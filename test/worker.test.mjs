// Testes do Worker sem Cloudflare: KV em memória, fetch do push interceptado.
// Rode com: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import worker, { ponteGravar, ponteLer, ponteCompras } from "../src/worker.js";
import { localToEpoch, localDate, dueBetween } from "../src/schedule.js";
import { DatabaseSync } from "node:sqlite";

const TZ = "America/Sao_Paulo";

function memoryKV() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const v = m.get(k); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}

// D1 falso em cima do SQLite do Node (mesma API que o Worker usa: prepare/bind/all/run/batch)
function memoryD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
    first: async () => db.prepare(sql).get(...args) ?? null,
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((x) => x.run())) };
}

function setup() {
  const env = { KV: memoryKV(), DB: memoryD1(), APP_PASSWORD: "senha-forte-teste", TZ, ASSETS: { fetch: async () => new Response("asset") } };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const flush = async () => { while (pending.length) await pending.shift(); };
  const jar = new Map(); // cookies como o navegador guardaria (Max-Age=0 apaga)
  const call = async (method, path, body, extra = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await worker.fetch(
      new Request("https://app.test" + path, { method, headers: { cookie, "content-type": "application/json", ...extra }, body: body && JSON.stringify(body) }),
      env, ctx,
    );
    for (const sc of res.headers.getSetCookie()) {
      const [kv] = sc.split(";");
      const i = kv.indexOf("=");
      if (/Max-Age=0\b/.test(sc)) jar.delete(kv.slice(0, i)); else jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
  };
  const cron = async (epoch) => { await worker.scheduled({ scheduledTime: epoch }, env, ctx); await flush(); };
  return { env, call, cron, flush, jar };
}

// Um "celular" falso: chaves ECDH + auth, e decriptação RFC 8291 feita com node:crypto.
function fakePhone(name) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { endpoint: `https://push.test/${name}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } };
  const decrypt = (buf) => {
    const salt = buf.subarray(0, 16);
    const idlen = buf[20];
    const asPub = buf.subarray(21, 21 + idlen);
    const ct = buf.subarray(21 + idlen);
    const secret = ecdh.computeSecret(asPub);
    const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPub]);
    const ikm = Buffer.from(crypto.hkdfSync("sha256", secret, auth, info, 32));
    const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
    const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
    const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    assert.equal(plain[plain.length - 1], 2, "delimitador de último registro");
    return JSON.parse(plain.subarray(0, -1).toString());
  };
  return { sub, decrypt };
}

function interceptPush(statusFor = () => 201) {
  const sent = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), headers: init.headers, body: Buffer.from(init.body) });
    return new Response(null, { status: statusFor(String(url)) });
  };
  return { sent, restore: () => (globalThis.fetch = orig) };
}

function planoPara(date) {
  const almoco = (itens, kcal) => ({ hora: "13:00", nome: "Almoço", titulo: "Frango grelhado", familia: true, kcal, proteina: 40, itens });
  return {
    formato: "plano-familia/2", titulo: "Plano Teste",
    pessoas: [{ id: "rafael", nome: "Rafael", metas: { kcal: 700, proteina: 40 } }, { id: "marina", nome: "Marina", metas: { kcal: 450, proteina: 40 } }],
    dias: [{ data: date, tipo: "T", refeicoes: {
      rafael: [almoco([["Peito de frango", 100, "g"], ["Arroz", 80, "g"]], 700)],
      marina: [almoco([["Peito de frango", 80, "g"]], 450)],
    } }],
  };
}

test("fuso: 07:00 em São Paulo é 10:00 UTC", () => {
  assert.equal(new Date(localToEpoch("2026-10-08", "07:00", TZ)).toISOString(), "2026-10-08T10:00:00.000Z");
  assert.equal(localDate(Date.parse("2026-10-09T02:30:00Z"), TZ), "2026-10-08");
});

test("aviso antecipado atravessa a meia-noite", () => {
  const sched = { days: { "2026-10-09": { meals: { rafael: [{ t: "00:05", name: "Ceia" }] } } } };
  const at = localToEpoch("2026-10-08", "23:55", TZ);
  const due = dueBetween({ persons: ["rafael"], lead: 10 }, sched, at - 60000, at, TZ);
  assert.equal(due.length, 1);
  assert.match(due[0].payload.title, /Ceia às 00:05/);
});

test("login exige a senha certa", async () => {
  const { call } = setup();
  assert.equal((await call("GET", "/api/meta")).status, 401);
  assert.equal((await call("POST", "/api/login", { password: "errada" })).status, 401);
  assert.equal((await call("POST", "/api/login", { password: "senha-forte-teste" })).status, 200);
  assert.equal((await call("GET", "/api/meta")).status, 200);
});

test("fluxo completo: aparelhos, upload, aviso de atualização, cron, adiar e inscrição morta", async () => {
  const { call, cron, env } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const rafael = fakePhone("rafael");
  const marina = fakePhone("marina");
  const today = localDate(Date.now(), TZ);
  for (const pid of ["rafael", "marina"]) await call("PUT", `/api/agua-cfg/${pid}`, { ligado: false }); // teste das refeições; a água tem o seu

  // sem as perguntas da Mesa: o "adiar" abaixo roda no horário real + 15 min e, perto das 10:00/15:30/19:00…, elas somavam avisos
  await call("PUT", "/api/devices/aparelho-rafael", { name: "S25", persons: ["rafael"], lead: 10, sub: rafael.sub, uploader: true, proativo: false });
  await call("PUT", "/api/devices/aparelho-marina", { name: "S24 FE", persons: ["marina", "rafael"], lead: 0, sub: marina.sub, summary: { on: true, time: "06:30" }, proativo: false });

  // upload pelo Rafael → só a Marina é avisada
  let push = interceptPush();
  const up = await call("POST", "/api/plan", {
    deviceId: "aparelho-rafael",
    plano: planoPara(today),
  });
  await new Promise((r) => setTimeout(r, 50));
  push.restore();
  assert.equal(up.status, 200);
  assert.equal(up.body.notified, 1);
  await Promise.resolve();
  assert.equal(push.sent.length, 1);
  assert.equal(push.sent[0].url, marina.sub.endpoint);
  assert.equal(marina.decrypt(push.sent[0].body).kind, "update");

  // cabeçalho VAPID: JWT ES256 válido com a chave pública publicada
  const { body: vapid } = await call("GET", "/api/vapid");
  const auth = push.sent[0].headers.Authorization;
  const [, jwt, k] = auth.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, vapid.publicKey);
  const [h, c, s] = jwt.split(".");
  const pub = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: Buffer.from(vapid.publicKey, "base64url").subarray(1, 33).toString("base64url"), y: Buffer.from(vapid.publicKey, "base64url").subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
  assert.equal(JSON.parse(Buffer.from(c, "base64url")).aud, "https://push.test");

  // 12:50 → Rafael (10 min antes); 13:00 → Marina recebe os dois (ela segue Marina e Rafael)
  push = interceptPush();
  await cron(localToEpoch(today, "12:50", TZ));
  assert.equal(push.sent.length, 1);
  const p1 = rafael.decrypt(push.sent[0].body);
  assert.match(p1.title, /Almoço às 13:00 \(em 10 min\)/);
  assert.match(p1.body, /Frango grelhado — peito de frango 100g \+ arroz 80g \(700 kcal\)/);
  assert.equal(p1.snooze, true);
  assert.deepEqual(p1.eat, { day: today, person: "rafael", k: "1300-almoco" });

  push.sent.length = 0;
  await cron(localToEpoch(today, "13:00", TZ));
  assert.equal(push.sent.length, 2);
  assert.deepEqual(push.sent.map((x) => marina.decrypt(x.body).title).sort(), ["13:00 · Almoço · Rafael", "13:00 · Almoço · Marina"].sort());

  push.sent.length = 0;
  await cron(localToEpoch(today, "06:30", TZ));
  assert.equal(push.sent.length, 1);
  assert.match(marina.decrypt(push.sent[0].body).title, /Hoje/);

  push.sent.length = 0;
  await cron(localToEpoch(today, "13:01", TZ));
  assert.equal(push.sent.length, 0, "nada fora do horário");
  push.restore();

  // próximos avisos
  const up2 = await call("GET", "/api/devices/aparelho-rafael/upcoming");
  assert.ok(Array.isArray(up2.body));

  // adiar 15 min
  await call("POST", "/api/snooze", { deviceId: "aparelho-rafael", minutes: 15, payload: p1 });
  const snz = JSON.parse(env.KV.m.get("snoozes"));
  push = interceptPush();
  await cron(snz[0].at + 30000);
  push.restore();
  assert.equal(push.sent.length, 1);
  assert.equal(JSON.parse(env.KV.m.get("snoozes")).length, 0);

  // inscrição morta (410) é limpa
  push = interceptPush((url) => (url.endsWith("/rafael") ? 410 : 201));
  await cron(localToEpoch(today, "12:50", TZ));
  push.restore();
  const devs = JSON.parse(env.KV.m.get("devices"));
  assert.equal(devs["aparelho-rafael"].sub, null);
  assert.ok(devs["aparelho-marina"].sub);

  // o plano volta como JSON para o app
  const plan = await call("GET", `/api/plan/${up.body.id}`);
  assert.equal(plan.status, 200);
  assert.equal(plan.body.titulo, "Plano Teste");
});

test("registro compartilhado: um celular marca, o outro vê", async () => {
  const { call } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const w = await call("POST", "/api/log", { device: "a", ops: [
    { kind: "eaten", day: "2026-10-26", person: "rafael", k: "1300-almoco", v: "1" },
    { kind: "shop", day: "2026-10-26", k: "arroz-g", v: "1" },
    { kind: "hackeado", day: "2026-10-26", k: "x", v: "1" },
  ] });
  assert.equal(w.body.written, 2, "tipo desconhecido é ignorado");
  const r1 = await call("GET", "/api/log?since=0");
  assert.equal(r1.body.rows.length, 2);
  // desmarcar sobrescreve a mesma linha e aparece no próximo "since"
  const since = Math.max(...r1.body.rows.map((r) => r.updated));
  await new Promise((r) => setTimeout(r, 5));
  await call("POST", "/api/log", { device: "b", ops: [{ kind: "eaten", day: "2026-10-26", person: "rafael", k: "1300-almoco", deleted: 1 }] });
  const r2 = await call("GET", `/api/log?since=${since + 1}`);
  assert.equal(r2.body.rows.length, 1);
  assert.equal(r2.body.rows[0].deleted, 1);
  assert.equal(r2.body.rows[0].by, "b");
  // a lista de compras do plano inteiro e do mês também sincroniza (antes "tudo-…" era descartado em silêncio)
  const c = await call("POST", "/api/log", { device: "a", ops: [
    { kind: "shop", day: "tudo-2026-11-23", k: "arroz-g", v: "1" },
    { kind: "shop", day: "mes-2026-12", k: "arroz-g", v: "casa" },
    { kind: "eaten", day: "mes-2026-12", person: "rafael", k: "x", v: "1" },
    { kind: "shop", day: "mes-2026-12-xx", k: "y", v: "1" },
  ] });
  assert.equal(c.body.written, 2, "período só vale para a lista de compras, e no formato certo");
});

test("ponte com o Pulse: peso e treino entram no registro; o app vê; tipos de fora são recusados", async () => {
  const { env, call } = setup();
  const w = await ponteGravar(env, [
    { kind: "weight", person: "rafael", day: "2026-10-21", v: "81.4" },
    { kind: "trained", person: "marina", day: "2026-10-21", v: "1" },
    { kind: "eaten", person: "rafael", day: "2026-10-21", v: "1" }, // só peso e treino passam pela ponte
    { kind: "weight", person: "", day: "2026-10-21", v: "80" },
  ]);
  assert.equal(w.written, 2);
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const rows = (await call("GET", "/api/log?since=0")).body.rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.person, r.v, r.by]).sort(), [["trained", "marina", "1", "Pulse"], ["weight", "rafael", "81.4", "Pulse"]]);
  // peso registrado no app da família aparece para o Pulse (só da pessoa pedida, depois do since)
  await new Promise((r) => setTimeout(r, 5));
  await call("POST", "/api/log", { device: "s26", ops: [{ kind: "weight", day: "2026-10-22", person: "marina", v: "61.2" }, { kind: "weight", day: "2026-10-22", person: "rafael", v: "81.1" }] });
  const p = await ponteLer(env, "rafael", 0);
  assert.deepEqual(p.rows.map((r) => [r.day, r.kg, r.deleted]), [["2026-10-21", 81.4, false], ["2026-10-22", 81.1, false]]);
  const depois = await ponteLer(env, "rafael", p.rows[0].updated);
  assert.deepEqual(depois.rows.map((r) => r.day), ["2026-10-22"]);
  // apagar no Pulse apaga aqui
  await ponteGravar(env, [{ kind: "weight", person: "rafael", day: "2026-10-22", deleted: 1 }]);
  assert.equal((await ponteLer(env, "rafael", 0)).rows.find((r) => r.day === "2026-10-22").deleted, true);
});

test("ponte com o Pulse: gasto do cardio (burn) entra no registro do dia", async () => {
  const { env, call } = setup();
  assert.equal((await ponteGravar(env, [{ kind: "burn", person: "rafael", day: "2026-11-05", v: "212" }])).written, 1);
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const rows = (await call("GET", "/api/log?since=0")).body.rows;
  assert.deepEqual(rows.filter((r) => r.kind === "burn").map((r) => [r.person, r.day, r.v, r.by]), [["rafael", "2026-11-05", "212", "Pulse"]]);
});

test("limpeza única: registros antigos em 'rafa' passam para 'rafael' (treino) ou saem (peso duplicado)", async () => {
  const { env, call } = setup();
  // o banco já tinha a tabela com as linhas antigas antes deste Worker subir
  await env.DB.prepare(`CREATE TABLE log (kind TEXT NOT NULL, day TEXT NOT NULL, person TEXT NOT NULL DEFAULT '', k TEXT NOT NULL DEFAULT '',
    v TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, by TEXT, PRIMARY KEY (kind, day, person, k))`).run();
  for (const [kind, person, day, v] of [["trained", "rafa", "2026-10-26", "1"], ["weight", "rafa", "2026-10-29", "84.8"], ["weight", "rafael", "2026-10-29", "84.8"]])
    await env.DB.prepare(`INSERT INTO log (kind, day, person, k, v, deleted, updated, by) VALUES (?, ?, ?, '', ?, 0, ?, 'Pulso')`).bind(kind, day, person, v, Date.now() - 86_400_000).run();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const rows = (await call("GET", "/api/log?since=0")).body.rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.person, r.day]).sort(), [["trained", "rafael", "2026-10-26"], ["weight", "rafael", "2026-10-29"]]);
  assert.ok(rows.find((r) => r.kind === "trained").updated > Date.now() - 60_000, "carimbo novo para os celulares baixarem");
});

test("exemplo da documentação é um plano válido", async () => {
  const { normalizarPlano, listaDeCompras } = await import("../public/js/plan.js");
  const fs = await import("node:fs");
  const { plano, erros } = normalizarPlano(fs.readFileSync(new URL("../docs/exemplo-plano.json", import.meta.url), "utf8"));
  assert.deepEqual(erros, []);
  assert.equal(plano.dias[0].refeicoes.rafael[0].titulo, "Shake de banana com aveia", "modelo foi aplicado");
  const cafe = plano.dias[0].refeicoes.rafael[0];
  assert.equal(cafe.alternativas[0].titulo, "Shake de morango", "alternativa vem do modelo");
  assert.equal(cafe.alternativas[0].hora, "07:00", "alternativa herda o horário");
  assert.equal(cafe.opcoes, "Opção 1 de 2");
  const compras = listaDeCompras(plano, plano.inicio, plano.fim).flatMap((c) => c.itens);
  assert.ok(compras.some((i) => i.nome === "Leite zero lactose desnatado" && i.qtd === 700), "iogurte caseiro virou leite + fermento");
});

test("plano com erro é recusado com a lista de problemas", async () => {
  const { call } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const r = await call("POST", "/api/plan", { plano: { formato: "plano-familia/2", pessoas: [{ id: "rafael", nome: "Rafael" }], dias: [{ data: "2026-10-26", refeicoes: { rafael: [{ hora: "25:00", nome: "x" }], zeca: [] } }] } });
  assert.equal(r.status, 422);
  assert.ok(r.body.erros.some((e) => /hora inválida/.test(e)));
  assert.ok(r.body.erros.some((e) => /pessoa desconhecida/.test(e)));
});

test("agenda inválida é recusada", async () => {
  const { call } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const r = await call("POST", "/api/plan", { plano: { dias: [] } });
  assert.equal(r.status, 422);
});

test("ponte com a Cesta: lista de compras do período, só o que vai para o carrinho", async () => {
  const { call, env } = setup();
  const fs = await import("node:fs");
  const { normalizarPlano, listaDeCompras } = await import("../public/js/plan.js");
  const bruto = fs.readFileSync(new URL("../docs/exemplo-plano.json", import.meta.url), "utf8");
  assert.deepEqual((await ponteCompras(env, "2026-10-26", "2026-10-27")).itens, [], "sem plano publicado: lista vazia");
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  assert.equal((await call("POST", "/api/plan", { plano: bruto })).status, 200);
  const r = await ponteCompras(env, "2026-10-20", "2026-10-31");
  assert.equal(r.semPlano, 10, "o exemplo cobre só 26 e 27/10");
  assert.equal(r.planos.length, 1);
  const { plano } = normalizarPlano(bruto);
  const esperado = listaDeCompras(plano, plano.inicio, plano.fim).flatMap((c) => c.itens.map((i) => [c.categoria, i.nome, i.qtd, i.unid]));
  assert.deepEqual(r.itens.map((i) => [i.categoria, i.nome, i.qtd, i.unid]), esperado);
  assert.deepEqual(Object.keys(r.itens[0]).sort(), ["categoria", "nome", "qtd", "unid"], "nada de refeições, peso ou saúde");
  // só um dia: menos que o período todo
  const um = await ponteCompras(env, "2026-10-26", "2026-10-26");
  assert.ok(um.itens.length && um.itens.every((i) => i.qtd == null || i.qtd <= (r.itens.find((x) => x.nome === i.nome && x.unid === i.unid).qtd)));
  assert.equal((await ponteCompras(env, "2026-10-27", "2026-10-26")).erro, "Período inválido");
  assert.equal((await ponteCompras(env, "2026-01-01", "2026-12-31")).ate, "2026-03-03", "no máximo 62 dias");
});

test("bloqueio: sem a sessão de 4h o app pede a digital, mas as ações da notificação seguem", async () => {
  const { call, jar } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  assert.ok(jar.has("pf_auth") && jar.has("pf_sess"));
  assert.equal((await call("GET", "/api/meta")).status, 200);
  jar.delete("pf_sess"); // passaram as horas sem uso
  const s = await call("GET", "/api/session");
  assert.equal(s.status, 200);
  assert.equal(s.body.locked, true);
  assert.equal((await call("GET", "/api/meta")).status, 423);
  assert.equal((await call("GET", "/api/log?since=0")).status, 423, "ler o registro exige desbloqueio");
  assert.equal((await call("POST", "/api/log", { ops: [{ kind: "eaten", day: "2026-10-26", person: "rafael", k: "x", v: "1" }] })).status, 200, "Comi da notificação");
  assert.equal((await call("DELETE", "/api/devices/aparelho-qualquer")).status, 423);
  // senha destrava de novo
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  assert.equal((await call("GET", "/api/meta")).status, 200);
});

test("escrita vinda de outro site é recusada", async () => {
  const { call } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const r = await call("POST", "/api/log", { ops: [] }, { origin: "https://site-estranho.example" });
  assert.equal(r.status, 403);
});

test("digital (passkey): cadastra, confere a assinatura e destrava", async () => {
  const { call, jar } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const id = crypto.randomBytes(32).toString("base64url");
  const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  assert.equal((await call("POST", "/api/passkey", { id, pub, alg: -7, device: "aparelho-rafael", name: "S25" })).status, 200);

  jar.delete("pf_sess");
  const assinar = async ({ origin = "https://app.test", flags = 0x05 } = {}) => {
    const { body } = await call("GET", "/api/passkey/desafio");
    const cd = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: body.challenge, origin }));
    const auth = Buffer.concat([crypto.createHash("sha256").update("app.test").digest(), Buffer.from([flags, 0, 0, 0, 1])]);
    const sig = crypto.sign("sha256", Buffer.concat([auth, crypto.createHash("sha256").update(cd).digest()]), privateKey); // DER, como o celular
    return { id, clientDataJSON: cd.toString("base64url"), authenticatorData: auth.toString("base64url"), signature: sig.toString("base64url") };
  };
  assert.equal((await call("POST", "/api/passkey/verificar", await assinar({ origin: "https://outro.test" }))).status, 401, "origem errada");
  assert.equal((await call("POST", "/api/passkey/verificar", await assinar({ flags: 0x01 }))).status, 401, "sem digital (UV)");
  assert.equal((await call("GET", "/api/meta")).status, 423);
  assert.equal((await call("POST", "/api/passkey/verificar", await assinar())).status, 200);
  assert.equal((await call("GET", "/api/meta")).status, 200, "destravou");

  // sair do celular apaga a digital dele
  await call("PUT", "/api/devices/aparelho-rafael", { name: "S25" });
  await call("DELETE", "/api/devices/aparelho-rafael");
  jar.delete("pf_sess");
  assert.equal((await call("POST", "/api/passkey/verificar", await assinar())).status, 404);
});

test("conector do Claude (MCP): contexto, rascunho em partes, validar e publicar", async () => {
  const { call, env } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const { body } = await call("GET", "/api/mcp");
  const caminho = new URL(body.url).pathname;
  assert.match(caminho, /^\/mcp\/[\w-]{20,}$/);
  const ctx = { waitUntil() {} };
  const rpc = async (method, params, id = 1, path = caminho) => {
    const res = await worker.fetch(new Request("https://app.test" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }), env, ctx);
    return res.status === 200 ? res.json() : { status: res.status };
  };
  const tool = async (name, args = {}) => {
    const r = await rpc("tools/call", { name, arguments: args });
    return { erro: r.result.isError, dado: (() => { try { return JSON.parse(r.result.content[0].text); } catch (e) { return r.result.content[0].text; } })() };
  };

  assert.equal((await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t" } }, 1, "/mcp/token-errado-0000000000000")).status, 404);
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude" } });
  assert.equal(init.result.serverInfo.name, "mesa");
  const notif = await worker.fetch(new Request("https://app.test" + caminho, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }), env, ctx);
  assert.equal(notif.status, 202);
  const nomes = (await rpc("tools/list", {})).result.tools.map((t) => t.name);
  assert.deepEqual(nomes, ["contexto_da_familia", "plano_atual", "formato_do_plano", "iniciar_rascunho", "adicionar_dias", "publicar_rascunho", "gravar_analise"]);

  // um feedback e um peso aparecem no contexto
  const hoje = localDate(Date.now(), TZ);
  await call("POST", "/api/log", { ops: [{ kind: "feedback", day: hoje, person: "rafael", k: "dia", v: JSON.stringify({ energia: 4, nota: "bem" }) }, { kind: "weight", day: hoje, person: "rafael", v: "83.5" }] });
  const c = (await tool("contexto_da_familia")).dado;
  assert.equal(c.feedbackDiario[0].energia, 4);
  assert.deepEqual(c.pesos.rafael, [[hoje, 83.5]]);

  // rascunho em duas partes a partir do exemplo da documentação
  const fs = await import("node:fs");
  const ex = JSON.parse(fs.readFileSync(new URL("../docs/exemplo-plano.json", import.meta.url), "utf8"));
  const { dias, ...cab } = ex;
  assert.equal((await tool("publicar_rascunho", { so_validar: true })).erro, true, "sem rascunho ainda");
  await tool("iniciar_rascunho", { cabecalho: cab });
  let r = (await tool("adicionar_dias", { dias: [dias[0]] })).dado;
  assert.deepEqual(r.faltam, [dias[1].data]);
  assert.deepEqual(r.erros, []);
  r = (await tool("adicionar_dias", { dias: [{ data: dias[1].data, refeicoes: { rafael: [{ hora: "99:00", nome: "x" }] } }] })).dado;
  assert.ok(r.erros.some((e) => /hora inválida/.test(e)), "erro do dia aparece na hora");
  await tool("adicionar_dias", { dias: [dias[1]] }); // corrige substituindo pela data
  const v = await tool("publicar_rascunho", { so_validar: true });
  assert.equal(v.erro, false);
  assert.equal(v.dado.valido, true);
  assert.equal((await call("GET", "/api/meta")).body.history.length, 0, "validar não publica");
  const pub = await tool("publicar_rascunho", { so_validar: false });
  assert.equal(pub.dado.publicado, true);
  const meta = (await call("GET", "/api/meta")).body;
  assert.equal(meta.history[0].title, ex.titulo);
  assert.equal(meta.history[0].by, "Claude");
  assert.equal(await env.DB.prepare("SELECT v FROM chaves WHERE k = 'rascunho'").first(), null, "rascunho apagado depois de publicar");

  // trocar o endereço invalida o anterior
  await call("POST", "/api/mcp");
  assert.equal((await rpc("ping", {})).status, 404);
});

test("planos com rodízio (\"Opção X de 3\" sem alternativas) ganham as outras opções dos dias vizinhos", async () => {
  const { normalizarPlano } = await import("../public/js/plan.js");
  const cafe = (titulo, n) => ({ hora: "07:00", nome: "Café da manhã", titulo, opcoes: `Opção ${n} de 3`, kcal: 500, proteina: 40, itens: [[titulo, 1, "un"]] });
  const dias = [["2026-11-01", "Banana", 1], ["2026-11-02", "Morango", 2], ["2026-11-03", "Iogurte", 3], ["2026-11-04", "Banana", 1]]
    .map(([data, t, n]) => ({ data, refeicoes: { rafael: [cafe(t, n)] } }));
  const { plano, erros } = normalizarPlano({ formato: "plano-familia/2", pessoas: [{ id: "rafael", nome: "Rafael", metas: { kcal: 500 } }], dias });
  assert.deepEqual(erros, []);
  const m = plano.dias[3].refeicoes.rafael[0];
  assert.equal(m.numero, 1);
  assert.deepEqual(m.alternativas.map((a) => [a.numero, a.titulo]), [[2, "Morango"], [3, "Iogurte"]]);
  assert.equal(m.alternativas[0].id, undefined, "a alternativa não leva o id do outro dia");
});

test("opções repetidas aparecem uma vez só (Leite da noite do Theo igual nas 3 opções)", async () => {
  const { normalizarPlano } = await import("../public/js/plan.js");
  const r = (titulo, n, item = titulo) => ({ hora: "19:45", nome: "Leite da noite", titulo, opcoes: `Opção ${n} de 3`, kcal: 150, proteina: 5, itens: [[item, 1, "un"]] });
  const dias = [[r("Mamadeira", 1), r("Pão", 1)], [r("Mamadeira", 2), r("Pão", 2)], [r("Mamadeira", 3), r("Fruta", 3)]]
    .map(([a, b], i) => ({ data: `2026-11-0${i + 1}`, refeicoes: { theo: [a, { ...b, hora: "15:30", nome: "Lanche" }] } }));
  const { plano, erros } = normalizarPlano({ formato: "plano-familia/2", pessoas: [{ id: "theo", nome: "Theo", metas: { kcal: 1300 } }], dias });
  assert.deepEqual(erros, []);
  const ms = plano.dias[2].refeicoes.theo, leite = ms.find((m) => m.nome === "Leite da noite"), lanche = ms.find((m) => m.nome === "Lanche");
  assert.equal(leite.alternativas, undefined, "três opções iguais viram nenhuma");
  assert.equal(leite.opcoes, "");
  assert.deepEqual([lanche.numero, ...lanche.alternativas.map((a) => [a.numero, a.titulo])], [2, [1, "Pão"]], "Pão 1 e 2 iguais: sobram 2, numeradas 1 e 2");
  assert.equal(lanche.opcoes, "Opção 2 de 2");
});

test("plano sem carbo/gordura: a Mesa estima pelos ingredientes; o valor do plano vale mais", async () => {
  const { normalizarPlano } = await import("../public/js/plan.js");
  const m = (extra) => ({ hora: "07:00", nome: "Café da manhã", kcal: 400, proteina: 30, itens: [["Arroz", 100, "g"], ["Azeite", 10, "ml"], ["Sonho de Valsa", 2, "un"], ["Coisa que não existe", 50, "g"]], ...extra });
  const { plano } = normalizarPlano({ formato: "plano-familia/2", pessoas: [{ id: "rafael", nome: "Rafael", metas: { kcal: 2000 } }],
    dias: [{ data: "2026-12-01", refeicoes: { rafael: [m({}), m({ hora: "12:00", nome: "Almoço", carbo: 50, gordura: 7 })] } }] });
  const [cafe, almoco] = plano.dias[0].refeicoes.rafael;
  assert.deepEqual([cafe.carbo, cafe.gordura], [78 + 24, Math.round(0.5 + 9.2 + 13)], "arroz 100 g + azeite 10 ml + 2 bombons");
  assert.deepEqual([almoco.carbo, almoco.gordura], [50, 7]);
});

test("destaque do dia: o teste FODMAP só aparece para quem está testando", async () => {
  const { destaqueDe } = await import("../public/js/plan.js");
  assert.equal(destaqueDe("Teste FODMAP · GOS 3/3", false), "");
  assert.equal(destaqueDe("Feriado · Finados · Teste FODMAP · frutose 1/3", false), "Feriado · Finados");
  assert.equal(destaqueDe("Feriado · Finados · Teste FODMAP · frutose 1/3", true), "Feriado · Finados · Teste FODMAP · frutose 1/3");
  assert.equal(destaqueDe("Noite do hambúrguer", false), "Noite do hambúrguer");
});

test("comer só parte: estimativa fecha com o total da refeição e respeita kcal por item", async () => {
  const { normalizarPlano, estimarItens, consumido } = await import("../public/js/plan.js");
  const fs = await import("node:fs");
  const { plano } = normalizarPlano(fs.readFileSync(new URL("../docs/exemplo-plano.json", import.meta.url), "utf8"));
  const almoco = plano.dias[0].refeicoes.rafael.find((m) => m.nome === "Almoço");
  const est = estimarItens(almoco);
  assert.equal(Math.round(est.reduce((s, x) => s + x.kcal, 0)), almoco.kcal, "soma das partes = refeição");
  assert.equal(est.find((_, i) => almoco.itens[i].nome === "Arroz").kcal, 288, "kcal do plano por item é usada como veio");
  const semArroz = consumido(almoco, ["Arroz"]);
  assert.equal(Math.round(semArroz.kcal), almoco.kcal - 288);
  assert.ok(semArroz.proteina < almoco.proteina && semArroz.proteina > almoco.proteina - 10, "arroz tira pouca proteína");
  assert.equal(consumido(almoco, almoco.itens.map((i) => i.nome), 600).kcal, 600, "outra coisa substitui a refeição");
  assert.equal(consumido(almoco).kcal, almoco.kcal, "sem nada de fora, é a refeição inteira");
});

test("Mesa proativa: regras das perguntas", async () => {
  const { perguntasDoMomento } = await import("../src/proativo.js");
  const base = { dow: 3, hoje: "2026-11-11", pid: "rafael", nome: "Rafael", refeicoes: [{ t: "07:00", name: "Café", key: "0700-cafe" }, { t: "13:00", name: "Almoço", key: "1300-almoco" }], linhas: [], testes: [], ultimaSumido: null };
  const ids = (f) => perguntasDoMomento({ ...base, ...f }).map((q) => q.id);
  assert.deepEqual(ids({ hm: "21:30" }), ["noite"]);
  assert.deepEqual(ids({ hm: "21:30", linhas: [{ kind: "feedback", day: "2026-11-11", k: "dia", v: "{}" }] }), [], "já respondeu o dia");
  assert.deepEqual(ids({ hm: "21:30", linhas: [{ kind: "day", day: "2026-11-11", k: "", v: "{}" }] }), [], "já fechou o dia na nova Mesa");
  const dia = perguntasDoMomento({ ...base, hm: "15:30" })[0];
  assert.equal(dia.id, "dia");
  assert.deepEqual(dia.payload.respostas[0].ops.map((o) => o.k), ["0700-cafe", "1300-almoco"], "'comi tudo certo' marca as refeições até agora");
  assert.deepEqual(ids({ hm: "15:30", linhas: [{ kind: "eaten", day: "2026-11-11", k: "0700-cafe", v: "1" }] }), []);
  assert.deepEqual(ids({ hm: "10:00", linhas: [{ kind: "symptom", day: "2026-11-10", k: "x", v: JSON.stringify({ texto: "gases", nivel: "leve" }) }] }), ["estomago"]);
  assert.deepEqual(ids({ hm: "10:00", linhas: [{ kind: "symptom", day: "2026-11-10", k: "x", v: JSON.stringify({ texto: "nada", nivel: "nenhum" }) }] }), []);
  const teste = { alimento: "Alho fresco", n: 1, k: "Alho fresco-1", data: "2026-11-10" };
  assert.deepEqual(ids({ hm: "10:30", testes: [teste] }), ["teste"]);
  assert.deepEqual(ids({ hm: "10:30", testes: [teste], linhas: [{ kind: "test", day: "2026-11-10", k: "Alho fresco-1", v: "ok" }] }), [], "24 h já respondida");
  assert.deepEqual(ids({ hm: "19:00" }), ["sumido"]);
  assert.deepEqual(ids({ hm: "19:00", ultimaSumido: "2026-11-10" }), [], "não insiste antes de 3 dias");
  assert.deepEqual(ids({ hm: "20:00", dow: 0 }), ["semana"]);
  assert.deepEqual(ids({ hm: "20:00", dow: 0, linhas: [{ kind: "week", day: "2026-11-11", k: "", v: "{}" }] }), [], "já fechou a semana na nova Mesa");
  assert.deepEqual(ids({ hm: "20:00" }), [], "fechamento só no domingo");
});

test("Mesa proativa no cron: chega ao dono do celular, com botões, e não repete", async () => {
  const { call, cron } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const rafael = fakePhone("rafael");
  const hoje = localDate(Date.now(), TZ);
  await call("PUT", "/api/devices/aparelho-rafael", { name: "S25", persons: ["rafael"], viewPerson: "rafael", sub: rafael.sub });
  await call("POST", "/api/plan", { plano: planoPara(hoje), deviceId: "aparelho-rafael" }); // quem sobe não recebe o aviso de plano novo
  await call("PUT", "/api/agua-cfg/rafael", { ligado: false }); // teste das perguntas; a água tem o seu
  let push = interceptPush();
  await cron(localToEpoch(hoje, "21:30", TZ));
  push.restore();
  assert.equal(push.sent.length, 1);
  const p = rafael.decrypt(push.sent[0].body);
  assert.equal(p.kind, "pergunta");
  assert.match(p.title, /Como foi o dia, Rafael/);
  assert.equal(p.respostas.length, 2);
  push = interceptPush();
  await cron(localToEpoch(hoje, "21:30", TZ));
  push.restore();
  assert.equal(push.sent.length, 0, "a mesma pergunta não volta no mesmo dia");
  // desligar em Ajustes
  await call("PUT", "/api/devices/aparelho-rafael", { proativo: false });
  push = interceptPush();
  await cron(localToEpoch(hoje, "15:30", TZ));
  push.restore();
  assert.equal(push.sent.length, 0);
});

test("refeição já marcada como 'comi' não é avisada (nem depois de adiar)", async () => {
  const { call, cron, env } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const rafael = fakePhone("rafael");
  const hoje = localDate(Date.now(), TZ);
  await call("PUT", "/api/devices/aparelho-rafael", { name: "S25", persons: ["rafael"], lead: 0, sub: rafael.sub, proativo: false });
  await call("PUT", "/api/agua-cfg/rafael", { ligado: false }); // teste das refeições; a água tem o seu
  await call("POST", "/api/plan", { plano: planoPara(hoje), deviceId: "aparelho-rafael" });
  let push = interceptPush();
  await cron(localToEpoch(hoje, "13:00", TZ));
  push.restore();
  const p = rafael.decrypt(push.sent[0].body);
  await call("POST", "/api/snooze", { deviceId: "aparelho-rafael", minutes: 15, payload: p });
  const adiado = JSON.parse(env.KV.m.get("snoozes"))[0];
  assert.deepEqual(adiado.payload.eat, p.eat, "o adiado guarda o 'Comi'");
  await call("POST", "/api/log", { ops: [{ kind: "eaten", day: hoje, person: "rafael", k: "1300-almoco", v: "1" }] });
  push = interceptPush();
  await cron(localToEpoch(hoje, "13:00", TZ));
  // o adiado vence em "agora real + 15 min": de madrugada, o cron das 13:00 já o consome — por isso a hora guardada
  await cron(adiado.at + 30000);
  push.restore();
  assert.equal(push.sent.length, 0);
});

test("busca no plano e meta de água", async () => {
  const { normalizarPlano, buscarNoPlano, metaAgua } = await import("../public/js/plan.js");
  const fs = await import("node:fs");
  const { plano } = normalizarPlano(fs.readFileSync(new URL("../docs/exemplo-plano.json", import.meta.url), "utf8"));
  const rs = buscarNoPlano(plano, "ARROZ");
  assert.ok(rs.length > 0 && rs.every((r) => r.achou.some((n) => /arroz/i.test(n))));
  assert.deepEqual(buscarNoPlano(plano, "a"), [], "termo curto não busca");
  assert.equal(metaAgua(plano, "rafael"), 3000, "a do plano vale");
  assert.equal(metaAgua(plano, "marina", 60), 2000, "35 ml/kg");
  assert.equal(metaAgua(plano, "marina", 30), 1500, "mínimo de 1,5 L");
  assert.equal(metaAgua({ pessoas: [{ id: "x", metas: {} }] }, "x"), 2000, "sem peso, 2 L");
});

test("comida × sintoma, resultado dos testes e pergunta no dia da dose", async () => {
  const { normalizarPlano, comidaXSintoma, veredito, historicoTestes, comidoNoDia } = await import("../public/js/plan.js");
  const ref = (feijao) => ({ hora: "13:00", nome: "Almoço", kcal: 500, itens: [["Arroz", 80, "g"], ...(feijao ? [["Feijão carioca", 60, "g"]] : [["Batata", 100, "g"]])] });
  const datas = Array.from({ length: 8 }, (_, i) => `2026-11-0${i + 1}`);
  const { plano } = normalizarPlano({ formato: "plano-familia/2", pessoas: [{ id: "rafael", nome: "Rafael", metas: { kcal: 500 } }],
    dias: datas.map((data, i) => ({ data, refeicoes: { rafael: [ref(i % 2 === 0)] } })) });
  const id = plano.dias[0].refeicoes.rafael[0].id;
  const get = (k, d, mid) => (k === "eaten" && mid === id ? "1" : null);
  assert.deepEqual(comidoNoDia(plano, datas[0], "rafael", (k, mid) => get(k, datas[0], mid)), ["Arroz", "Feijão carioca"]);
  // sintoma nos dias com feijão (1, 3, 5) e num sem (2, de manhã → conta para o dia 1)
  const sintomas = [["2026-11-01", "leve"], ["2026-11-03", "moderado"], ["2026-11-05", "forte"], ["2026-11-08", "leve"]].map(([day, nivel]) => ({ day, nivel, hora: "20:00" }));
  const r = comidaXSintoma(plano, "rafael", get, sintomas, "2026-11-08");
  assert.equal(r[0].alimento, "Feijão carioca");
  assert.deepEqual([r[0].dias, r[0].comSintoma, r[0].semEle, r[0].semEleComSintoma], [4, 3, 4, 1]);
  assert.ok(!r.some((x) => x.alimento === "Arroz"), "comido todo dia não diferencia");
  assert.deepEqual(comidaXSintoma(plano, "rafael", get, [], "2026-11-08"), [], "sem sintoma, sem padrão");

  assert.equal(veredito(["ok", "ok", "ok"], 3), "passou");
  assert.equal(veredito(["ok", "leve", "ok"], 3), "leve");
  assert.equal(veredito(["ok", "forte"], 3), "nao");
  assert.equal(veredito(["ok"], 3), "andamento");
  const h = historicoTestes([{ k: "Alho fresco-1", day: "2026-10-02", v: "ok" }, { k: "Alho fresco-2", day: "2026-10-04", v: "ok" }, { k: "Lactose-1", day: "2026-11-02", v: "forte" }]);
  assert.deepEqual(h.map((t) => [t.alimento, t.veredito]), [["Lactose", "nao"], ["Alho fresco", "passou"]]);

  const { perguntasDoMomento } = await import("../src/proativo.js");
  const q = perguntasDoMomento({ hm: "10:00", dow: 3, hoje: "2026-11-11", pid: "rafael", nome: "Rafael", refeicoes: [], linhas: [], testes: [], ultimaSumido: null,
    testesHoje: [{ alimento: "Alho", n: 2, quantidade: "1 dente", refeicao: "Almoço" }] });
  assert.equal(q[0].id, "dose");
  assert.match(q[0].payload.body, /Dose 2 · 1 dente, no almoço/);
});

test("compras seguem as trocas e o preparo em lote soma a semana", async () => {
  const { normalizarPlano, listaDeCompras, quantidadesDoLote } = await import("../public/js/plan.js");
  const cafe = { hora: "07:00", nome: "Café", kcal: 300, itens: [["Morango", 100, "g"]], alternativas: [{ titulo: "Kiwi", kcal: 300, itens: [["Kiwi", 2, "un"]] }] };
  const almoco = { hora: "12:00", nome: "Almoço", kcal: 600, itens: [["Arroz", 80, "g"], ["Peito de frango", 120, "g"], ["Azeite", 5, "ml"]] };
  const { plano } = normalizarPlano({ formato: "plano-familia/2", pessoas: [{ id: "rafael", nome: "Rafael", metas: { kcal: 900 } }],
    conversoes: { Arroz: 2.5 }, lotes: [{ titulo: "Domingo", passos: ["Cozinhe o arroz da semana por 20 min.", "Asse frango a mais."] }],
    dias: ["2026-11-01", "2026-11-02"].map((data) => ({ data, refeicoes: { rafael: [cafe, almoco] } })) });
  const nomes = (cats) => cats.flatMap((c) => c.itens.map((i) => `${i.nome} ${i.qtd}`)).sort();
  assert.ok(nomes(listaDeCompras(plano, "2026-11-01", "2026-11-02")).includes("Morango 200"));
  const cafeId = plano.dias[0].refeicoes.rafael[0].id;
  const trocou = (d, p, id) => (d === "2026-11-02" && id === cafeId ? 1 : 0);
  const l = nomes(listaDeCompras(plano, "2026-11-01", "2026-11-02", "", trocou));
  assert.ok(l.includes("Morango 100") && l.includes("Kiwi 2"), "o dia trocado compra kiwi no lugar do morango");
  const q = quantidadesDoLote(plano, plano.lotes[0], "2026-11-01", "2026-11-02");
  assert.deepEqual(q.map((x) => [x.nome, x.qtd]), [["Arroz", 160], ["Peito de frango", 240]]);
  assert.equal(q[0].pronto, "≈400g pronto");
});

test("planos no D1 (o antigo do KV continua abrindo) e voltar a um plano anterior", async () => {
  const { call, env } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const hoje = localDate(Date.now(), TZ);
  // plano gravado do jeito antigo (só no KV)
  env.KV.m.set("meta", JSON.stringify({ history: [{ id: "antigo-1", kind: "v2", title: "Antigo", from: hoje, to: hoje }] }));
  env.KV.m.set("plan:antigo-1", JSON.stringify(planoPara(hoje)));
  assert.equal((await call("GET", "/api/meta")).body.history[0].id, "antigo-1");
  assert.equal((await call("GET", "/api/plan/antigo-1")).body.titulo, "Plano Teste");
  const novo = { ...planoPara(hoje), titulo: "Novo" };
  const up = await call("POST", "/api/plan", { plano: novo });
  assert.equal(env.KV.m.has(`plan:${up.body.id}`), false, "plano novo vai para o D1");
  assert.equal((await call("GET", `/api/plan/${up.body.id}`)).body.titulo, "Novo");
  assert.deepEqual((await call("GET", "/api/meta")).body.history.map((h) => h.title), ["Novo", "Antigo"]);
  const volta = await call("POST", "/api/plan/antigo-1/voltar", {});
  assert.equal(volta.status, 200);
  const h = (await call("GET", "/api/meta")).body.history;
  assert.equal(h[0].title, "Plano Teste", "o anterior volta como o mais novo");
  assert.equal((await call("POST", "/api/plan/nao-existe/voltar", {})).status, 404);
});

test("agenda de treino do Pulse: tipo do dia e horário do pré/pós-treino", async () => {
  const { lerAgendaPulse, tipoPeloPulse, horaPeloPulse } = await import("../public/js/plan.js");
  const a = lerAgendaPulse("1|18:00|Upper A");
  assert.deepEqual(a, { treino: true, hora: "18:00", nome: "Upper A" });
  assert.equal(tipoPeloPulse("D", a), "T", "treino no Pulse em dia de descanso do plano");
  assert.equal(tipoPeloPulse("X", a), "X", "outros tipos de treino ficam");
  assert.equal(tipoPeloPulse("T", lerAgendaPulse("0")), "D");
  assert.equal(tipoPeloPulse("T", null), "T", "sem Pulse, vale o plano");
  assert.equal(horaPeloPulse({ nome: "Pré-treino" }, "18:00"), "17:00");
  assert.equal(horaPeloPulse({ nome: "Lanche", titulo: "Shake pós-treino" }, "23:30"), "00:45");
  assert.equal(horaPeloPulse({ nome: "Almoço" }, "18:00"), null);
  const { env } = setup();
  await ponteGravar(env, [{ kind: "pulse", person: "rafael", day: "2026-11-12", v: "1|18:00|Upper A" }, { kind: "pizza", person: "rafael", day: "2026-11-12", v: "1" }]);
  const { results } = await env.DB.prepare(`SELECT kind, v FROM log WHERE person = 'rafael'`).all();
  assert.deepEqual(results.map((r) => [r.kind, r.v]), [["pulse", "1|18:00|Upper A"]]);
});

test("custo da dieta com os preços da Cesta", async () => {
  const { env, call } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const { ponteGuardarPrecos } = await import("../src/worker.js");
  const r = await ponteGuardarPrecos(env, [
    { nome: "Peito de frango", unid: "g", preco: 0.032 }, // R$ 32/kg
    { nome: "Arroz", unid: "g", preco: 0.006 },
    { nome: "x", unid: "litro", preco: 1 }, // unidade inválida
    { nome: "Ovo", unid: "un", preco: -1 }, // preço inválido
  ]);
  assert.equal(r.gravados, 2);
  const meta = (await call("GET", "/api/meta")).body;
  assert.equal(meta.precosCesta.precos["peito-de-frango|g"], 0.032);
  const { custoDaLista, listaDeCompras } = await import("../public/js/plan.js");
  const hoje = localDate(Date.now(), TZ);
  const { normalizarPlano } = await import("../public/js/plan.js");
  const { plano } = normalizarPlano(planoPara(hoje));
  const c = custoDaLista(listaDeCompras(plano, hoje, hoje), meta.precosCesta.precos);
  // frango 100 + 80 g × 0,032 + arroz 80 g × 0,006
  assert.deepEqual(c, { total: 6.24, comPreco: 2, itens: 2 });
});

test("água: esperado, atraso e quando avisar (sem virar ruído)", async () => {
  const { esperadoAgora, avisoDeAgua, cfgAgua } = await import("../src/agua.js");
  const cfg = cfgAgua(null);
  assert.deepEqual(cfg, { ligado: true, acorda: "07:00", dorme: "22:00" }, "padrão 7–22, ligado");
  assert.deepEqual(cfgAgua({ ligado: false, acorda: "25:00", dorme: "06:00" }), { ligado: false, acorda: "07:00", dorme: "22:00" }, "hora inválida cai no padrão");
  assert.deepEqual(cfgAgua({ acorda: "23:00", dorme: "08:00" }), { ligado: true, acorda: "07:00", dorme: "22:00" }, "acorda depois de dormir cai no padrão");
  assert.equal(esperadoAgora(3000, cfg, "13:00"), 1200);
  assert.equal(esperadoAgora(3000, cfg, "06:00"), 0);
  assert.equal(esperadoAgora(3000, cfg, "23:00"), 3000);
  const T = Date.UTC(2026, 10, 19, 16, 0); // só a diferença entre horários importa
  const base = { hm: "13:00", agora: T, metaMl: 3000, cfg, ultimoAviso: null, ultimoRegistro: null };
  const leve = avisoDeAgua({ ...base, bebido: 900 });
  assert.equal(leve.nivel, "leve");
  assert.match(leve.title, /Hora de um copo/);
  const forte = avisoDeAgua({ ...base, bebido: 400 });
  assert.equal(forte.nivel, "forte");
  assert.match(forte.title, /800 ml atrás/);
  assert.equal(avisoDeAgua({ ...base, bebido: 1000 }), null, "atraso < 250");
  assert.equal(avisoDeAgua({ ...base, hm: "21:59", bebido: 3000 }), null, "meta batida");
  assert.equal(avisoDeAgua({ ...base, hm: "06:30", bebido: 0 }), null, "antes de acordar");
  assert.equal(avisoDeAgua({ ...base, hm: "22:10", bebido: 0 }), null, "depois de dormir");
  assert.equal(avisoDeAgua({ ...base, bebido: 400, ultimoRegistro: T - 5 * 60e3 }), null, "acabou de beber");
  assert.equal(avisoDeAgua({ ...base, bebido: 900, ultimoAviso: { at: T - 60 * 60e3, nivel: "leve" } }), null, "leve: 1 a cada 90 min");
  assert.ok(avisoDeAgua({ ...base, bebido: 900, ultimoAviso: { at: T - 91 * 60e3, nivel: "leve" } }), "leve: depois de 90 min");
  assert.equal(avisoDeAgua({ ...base, bebido: 400, ultimoAviso: { at: T - 30 * 60e3, nivel: "forte" } }), null, "forte: 1 a cada 45 min");
  assert.ok(avisoDeAgua({ ...base, bebido: 400, ultimoAviso: { at: T - 46 * 60e3, nivel: "forte" } }), "forte: depois de 45 min");
  assert.equal(avisoDeAgua({ ...base, bebido: 0, cfg: { ...cfg, ligado: false } }), null, "desligado");
});

test("água no cron: avisa com +250/+500 que somam, respeita o intervalo, a criança e o desligado", async () => {
  const { call, cron, flush } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const hoje = localDate(Date.now(), TZ);
  const plano = planoPara(hoje);
  plano.pessoas.push({ id: "theo", nome: "Theo", metas: { kcal: 400, proteina: 20 } });
  plano.dias[0].refeicoes.theo = [{ hora: "13:00", nome: "Almoço", kcal: 300, itens: [["Arroz", 30, "g"]] }];
  const fones = {};
  for (const pid of ["rafael", "marina", "theo"]) {
    fones[pid] = fakePhone(pid);
    await call("PUT", `/api/devices/ap-${pid}`, { name: pid, persons: [pid], viewPerson: pid, sub: fones[pid].sub, meals: false, proativo: false });
  }
  await call("POST", "/api/plan", { plano });
  const avisoPlano = interceptPush(); await flush(); avisoPlano.restore(); // o "plano novo" não entra na conta da água
  assert.equal((await call("PUT", "/api/agua-cfg/marina", { ligado: false })).status, 200);
  assert.deepEqual((await call("GET", "/api/agua-cfg/rafael")).body, { ligado: true, acorda: "07:00", dorme: "22:00" });
  await call("PUT", "/api/agua-cfg/marina", { acorda: "06:30" });
  assert.deepEqual((await call("PUT", "/api/agua-cfg/marina", { ligado: false })).body, { ligado: false, acorda: "06:30", dorme: "22:00" }, "desligar mantém os horários");

  const enviar = async (hm) => { const push = interceptPush(); await cron(localToEpoch(hoje, hm, TZ)); push.restore(); return push.sent; };
  let sent = await enviar("13:00");
  assert.equal(sent.length, 1, "só o Rafael: a Marina desligou e o Theo é criança");
  const p = fones.rafael.decrypt(sent[0].body);
  assert.match(p.title, /ml atrás/);
  assert.deepEqual(p.respostas.map((r) => r.ops[0].add), [250, 500]);
  assert.equal(p.respostas[0].ops[0].kind, "water");
  assert.equal((await enviar("13:30")).length, 0, "forte: nada antes de 45 min");
  assert.equal((await enviar("13:46")).length, 1, "forte: de novo depois de 45 min");

  // os botões somam no servidor (não sobrescrevem um copo anotado no app)
  await call("POST", "/api/log", { ops: [{ kind: "water", day: hoje, person: "rafael", k: "", v: "500" }] });
  await call("POST", "/api/log", { ops: [p.respostas[0].ops[0]] });
  await call("POST", "/api/log", { ops: [p.respostas[0].ops[0]] });
  const linha = (await call("GET", "/api/log?since=0")).body.rows.find((r) => r.kind === "water" && r.person === "rafael");
  assert.equal(linha.v, "1000");
  assert.equal((await enviar("14:40")).length, 0, "com 1 L às 14:40 não está atrasado");
});

test("água: agenda guardada antes da Fase 3 (sem 'agua') usa a meta do plano depois do primeiro cron", async () => {
  const { call, cron, flush, env } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const hoje = localDate(Date.now(), TZ);
  const plano = planoPara(hoje);
  plano.pessoas[0].metas.agua = 1500;
  const fone = fakePhone("rafael");
  await call("PUT", "/api/devices/ap-rafael", { name: "b", persons: ["rafael"], viewPerson: "rafael", sub: fone.sub, meals: false, proativo: false });
  await call("POST", "/api/plan", { plano });
  const fora = interceptPush(); await flush(); fora.restore();
  // como estava no KV antes desta versão: sem o campo da água
  const sched = JSON.parse(env.KV.m.get("sched")); delete sched.agua; env.KV.m.set("sched", JSON.stringify(sched));
  for (const k of [...env.KV.m.keys()].filter((k) => k.startsWith("sched:"))) { const s = JSON.parse(env.KV.m.get(k)); delete s.agua; env.KV.m.set(k, JSON.stringify(s)); }
  await call("POST", "/api/log", { ops: [{ kind: "water", day: hoje, person: "rafael", k: "", v: "500" }] });
  const push = interceptPush();
  await cron(localToEpoch(hoje, "13:00", TZ) + 11 * 60e3); // 13:11: meta 1500 → esperado ~640, atraso ~140 → nada (com 2 L seriam ~360 → aviso)
  push.restore();
  assert.equal(push.sent.length, 0);
  assert.equal(JSON.parse(env.KV.m.get("sched")).agua.rafael.meta, 1500, "a agenda foi refeita com a água");
});

test("outra coisa: a proteína estimada entra no consumido", async () => {
  const { consumido } = await import("../public/js/plan.js");
  const m = { kcal: 600, proteina: 40, itens: [{ nome: "Arroz", qtd: 100, unid: "g" }, { nome: "Frango", qtd: 120, unid: "g" }] };
  const c = consumido(m, ["Arroz", "Frango"], 500, 25);
  assert.equal(c.kcal, 500);
  assert.equal(c.proteina, 25);
  assert.equal(consumido(m, ["Arroz", "Frango"], 500).proteina, 0, "sem proteína informada, conta 0 como antes");
});

test("tratamento: validação, dia X de N, doses do dia e sintomas (novo e antigo)", async () => {
  const { cfgTratamento, diaDoTratamento, dosesDoDia, lerSintoma, alertasRecentes } = await import("../public/js/tratamento.js");
  assert.equal(cfgTratamento(null), null);
  assert.equal(cfgTratamento({ nome: "", inicio: "2026-11-01" }), null, "sem nome não vale");
  const t = cfgTratamento({ nome: "Berberina + alicina", inicio: "2026-11-01", doses: [
    { id: "b1", nome: "Berberina", quando: "almoco" }, { id: "b2", nome: "Berberina", quando: "jantar" }, { id: "a1", nome: "Alicina", quando: "07:30" },
    ...Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, nome: "x".repeat(200), quando: "cafe" })),
  ] });
  assert.equal(t.dias, 28, "duração padrão: 4 semanas");
  assert.equal(t.doses.length, 8, "no máximo 8 doses");
  assert.ok(t.doses.every((d) => d.nome.length <= 40));
  assert.equal(cfgTratamento({ nome: "x", inicio: "2026-13-45" }), null, "data inválida");
  assert.equal(cfgTratamento({ nome: "x", inicio: "2026-11-01", doses: [{ id: "a", nome: "y", quando: "25:00" }] }).doses.length, 0, "horário inválido sai");
  assert.deepEqual(diaDoTratamento(t, "2026-11-12"), { n: 12, total: 28, ultimos: false, acabou: false, antes: false });
  assert.equal(diaDoTratamento(t, "2026-11-26").ultimos, true, "dia 26 de 28: últimos 3 dias");
  assert.equal(diaDoTratamento(t, "2026-11-29").acabou, true);
  assert.equal(diaDoTratamento(t, "2026-10-31").antes, true);
  const refs = [{ id: "r-cafe", nome: "Café da manhã", hora: "07:00" }, { id: "r-alm", nome: "Almoço", hora: "12:30" }];
  const t3 = cfgTratamento({ nome: "B", inicio: "2026-11-01", doses: t.doses.slice(0, 3) });
  const ds = dosesDoDia(t3, "2026-11-12", refs);
  assert.deepEqual(ds.map((d) => [d.id, d.refeicao, d.hora]), [["a1", null, "07:30"], ["b1", "r-alm", "12:30"], ["b2", null, "23:59"]], "por hora; jantar sem refeição vai para o fim do dia");
  assert.deepEqual(dosesDoDia(t, "2026-12-30", refs), [], "fora do período: nenhuma dose");
  const velho = lerSintoma(JSON.stringify({ texto: "Gases depois do almoço", nivel: "moderado", hora: "14:00" }));
  assert.equal(velho.intensidade, "media");
  assert.match(velho.rotulo, /Gases depois do almoço/);
  const novo = lerSintoma(JSON.stringify({ tipo: "sangue", intensidade: "forte", hora: "09:00" }));
  assert.equal(novo.alerta, true);
  const linhas = [{ kind: "symptom", day: "2026-11-10", v: JSON.stringify({ tipo: "febre", intensidade: "media" }) }, { kind: "symptom", day: "2026-10-01", v: JSON.stringify({ tipo: "febre" }) }, { kind: "symptom", day: "2026-11-11", v: JSON.stringify({ tipo: "gases" }) }];
  assert.deepEqual(alertasRecentes(linhas, "2026-11-12").map((a) => a.dia), ["2026-11-10"], "só sinais de alerta dos últimos 14 dias");
});

test("tratamento: rotas validadas, 'Tomei' no lembrete da refeição e o Claude vê doses e efeitos", async () => {
  const { call, cron, flush, env } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const hoje = localDate(Date.now(), TZ);
  const fone = fakePhone("rafael");
  await call("PUT", "/api/devices/ap-rafael", { name: "b", persons: ["rafael"], viewPerson: "rafael", sub: fone.sub, lead: 0, proativo: false });
  await call("PUT", "/api/agua-cfg/rafael", { ligado: false });
  await call("POST", "/api/plan", { plano: planoPara(hoje) });
  const fora = interceptPush(); await flush(); fora.restore();
  const r = await call("PUT", "/api/tratamento/rafael", { nome: "Berberina + alicina", inicio: hoje, doses: [{ id: "b1", nome: "Berberina", quando: "almoco" }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.dias, 28);
  assert.equal((await call("PUT", "/api/tratamento/marina", { nome: "" })).status, 400, "cadastro inválido é recusado");
  assert.equal((await call("GET", "/api/tratamento/marina")).body, null);
  const push = interceptPush();
  await cron(localToEpoch(hoje, "13:00", TZ));
  push.restore();
  assert.equal(push.sent.length, 1);
  const p = fone.decrypt(push.sent[0].body);
  assert.match(p.body, /Berberina/);
  assert.deepEqual(p.doses, [{ kind: "dose", day: hoje, person: "rafael", k: "b1", v: "1" }]);
  assert.ok(p.eat, "o 'Comi' continua");
  await call("POST", "/api/log", { ops: [p.doses[0], { kind: "sideeffect", day: hoje, person: "rafael", k: "e1", v: JSON.stringify({ texto: "enjoo leve" }) }] });
  const { body } = await call("GET", "/api/mcp");
  const res = await worker.fetch(new Request("https://app.test" + new URL(body.url).pathname, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "contexto_da_familia", arguments: {} } }) }), env, { waitUntil() {} });
  const c = JSON.parse((await res.json()).result.content[0].text);
  assert.equal(c.tratamentos.rafael.nome, "Berberina + alicina");
  assert.deepEqual(c.dosesTomadas.map((d) => d.dose), ["b1"]);
  assert.equal(c.efeitosColaterais[0].texto, "enjoo leve");
});

test("diário: fechamento do dia validado, média de sintomas por semana, piora por 3 semanas e o pedido ao Claude", async () => {
  const { lerDia, notaSintomasDia, mediasPorSemana, piorouTresSemanas, segundaDe, pedidoDeAnalise, linkClaude } = await import("../public/js/diario.js");
  assert.deepEqual(lerDia(JSON.stringify({ humor: 9, fome: "bem", texto: "x".repeat(500), sintomas: { gases: 2, inchaco: 7, zzz: 1 }, bristol: 4, energia: 6 })),
    { humor: null, fome: "bem", texto: "x".repeat(280), sintomas: { gases: 2, inchaco: 3 }, bristol: 4, energia: null }, "valores fora da faixa saem ou são cortados");
  assert.equal(notaSintomasDia({ sintomas: { gases: 2, inchaco: 1 } }), 3);
  assert.equal(segundaDe("2026-11-19"), "2026-11-16", "quinta → segunda da mesma semana");
  assert.equal(segundaDe("2026-11-22"), "2026-11-16", "domingo fecha a semana");
  const dias = [["2026-11-03", 1], ["2026-11-04", 1], ["2026-11-10", 2], ["2026-11-17", 3], ["2026-11-18", 5], ["2026-11-24", 6]]
    .map(([data, n]) => ({ data, fechamento: { sintomas: { gases: n } } }));
  const ms = mediasPorSemana(dias);
  assert.deepEqual(ms.map((s) => [s.semana, s.media]), [["2026-11-02", 1], ["2026-11-09", 2], ["2026-11-16", 4], ["2026-11-23", 6]]);
  assert.equal(piorouTresSemanas(ms.slice(0, 3), "2026-12-01"), false, "2 subidas não bastam (regra completa no teste da revisão)");
  const pedido = pedidoDeAnalise({ nome: "Rafael", de: "2026-11-16", ate: "2026-11-22" });
  assert.match(pedido, /contexto_da_familia/);
  assert.match(pedido, /gravar_analise/);
  assert.ok(linkClaude(pedido).startsWith("https://claude.ai/new?q="));
  assert.ok(decodeURIComponent(linkClaude(pedido).split("q=")[1]).includes("Rafael"));
});

test("diário no servidor: fechamentos no contexto, gravar_analise (validar antes) e análises lidas no app", async () => {
  const { call, env } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const hoje = localDate(Date.now(), TZ);
  await call("POST", "/api/plan", { plano: planoPara(hoje) });
  await call("POST", "/api/log", { ops: [
    { kind: "day", day: hoje, person: "rafael", k: "", v: JSON.stringify({ humor: "bem", energia: 4, bristol: 4, sintomas: { gases: 1 } }) },
    { kind: "week", day: hoje, person: "rafael", k: "", v: JSON.stringify({ texto: "semana boa" }) },
  ] });
  const { body } = await call("GET", "/api/mcp");
  const caminho = new URL(body.url).pathname;
  const tool = async (name, args = {}) => {
    const res = await worker.fetch(new Request("https://app.test" + caminho, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env, { waitUntil() {} });
    const r = (await res.json()).result;
    return { erro: !!r.isError, dado: (() => { try { return JSON.parse(r.content[0].text); } catch (e) { return r.content[0].text; } })() };
  };
  const c = (await tool("contexto_da_familia")).dado;
  assert.equal(c.fechamentosDoDia[0].energia, 4);
  assert.equal(c.fechamentosDaSemana[0].texto, "semana boa");
  const a = { pessoa: "rafael", titulo: "Semana de 16/11", texto: "Água melhorou; gases caíram nos dias sem feijão." };
  const v = await tool("gravar_analise", { ...a, so_validar: true });
  assert.equal(v.erro, false);
  assert.deepEqual((await call("GET", "/api/analises/rafael")).body, [], "validar não grava");
  assert.equal((await tool("gravar_analise", { ...a, pessoa: "zeca", so_validar: false })).erro, true, "pessoa fora do plano é recusada");
  assert.equal((await tool("gravar_analise", { ...a, pessoa: "familia", so_validar: false })).erro, true, "'familia' não existe no app: recusa em vez de gravar onde ninguém lê");
  assert.equal((await call("POST", "/api/analises/zeca", { titulo: "x", texto: "y" })).status, 400, "colar só para quem está no plano");
  assert.equal((await tool("gravar_analise", { ...a, so_validar: false })).erro, false);
  const lista = (await call("GET", "/api/analises/rafael")).body;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].lida, false);
  assert.equal((await call("PUT", `/api/analises/rafael/${lista[0].id}/lida`)).status, 200);
  assert.equal((await call("GET", "/api/analises/rafael")).body[0].lida, true);
  // sem conector: a resposta colada no app vira uma análise (já lida, porque a pessoa acabou de ler)
  assert.equal((await call("POST", "/api/analises/rafael", { titulo: "", texto: "" })).status, 400);
  assert.equal((await call("POST", "/api/analises/rafael", { titulo: "Colada", texto: "Resposta do Claude" })).status, 200);
  assert.deepEqual((await call("GET", "/api/analises/rafael")).body.map((x) => [x.titulo, x.lida]), [["Colada", true], ["Semana de 16/11", true]]);
});
test("tratamento (revisão): refeição com tipo explícito recebe a dose, duração limitada a 120 e alerta sem intensidade inventada", async () => {
  const { cfgTratamento, lerSintoma } = await import("../public/js/tratamento.js");
  assert.equal(cfgTratamento({ nome: "x", inicio: "2026-11-01", dias: 150 }).dias, 120, "acima de 120 fica 120 (não volta para 28)");
  const alerta = lerSintoma(JSON.stringify({ tipo: "febre", intensidade: null, hora: "09:00" }));
  assert.equal(alerta.intensidade, null);
  assert.doesNotMatch(alerta.rotulo, /forte/);
  assert.doesNotMatch(lerSintoma(JSON.stringify({ tipo: "sangue", intensidade: "forte" })).rotulo, /forte/, "sinal de alerta não mostra intensidade");

  const { call, cron, flush } = setup();
  await call("POST", "/api/login", { password: "senha-forte-teste" });
  const hoje = localDate(Date.now(), TZ);
  const plano = planoPara(hoje);
  plano.dias[0].refeicoes.rafael[0].nome = "Refeição 2";
  plano.dias[0].refeicoes.rafael[0].tipo = "almoco";
  const fone = fakePhone("rafael");
  await call("PUT", "/api/devices/ap-rafael", { name: "b", persons: ["rafael"], viewPerson: "rafael", sub: fone.sub, lead: 0, proativo: false });
  await call("PUT", "/api/agua-cfg/rafael", { ligado: false });
  await call("POST", "/api/plan", { plano });
  const fora = interceptPush(); await flush(); fora.restore();
  await call("PUT", "/api/tratamento/rafael", { nome: "Berberina", inicio: hoje, doses: [{ id: "b1", nome: "Berberina", quando: "almoco" }] });
  const push = interceptPush();
  await cron(localToEpoch(hoje, "13:00", TZ));
  push.restore();
  assert.deepEqual(fone.decrypt(push.sent[0].body).doses?.map((d) => d.k), ["b1"], "o almoço com tipo explícito leva a dose");
});

test("diário (revisão): piora só com semanas seguidas, completas e alta de verdade; semana a fechar depois da meia-noite", async () => {
  const { mediasPorSemana, piorouTresSemanas, semanaParaFechar } = await import("../public/js/diario.js");
  const semana = (seg, n, dias = 3) => Array.from({ length: dias }, (_, i) => ({ data: new Date(Date.parse(seg + "T12:00:00Z") + i * 864e5).toISOString().slice(0, 10), fechamento: { sintomas: { gases: n } } }));
  const sobe = [...semana("2026-10-26", 1), ...semana("2026-11-02", 2), ...semana("2026-11-09", 3), ...semana("2026-11-16", 5)];
  assert.equal(piorouTresSemanas(mediasPorSemana(sobe), "2026-11-24"), true, "4 semanas seguidas, completas, subindo");
  const comBuraco = [...semana("2026-10-12", 1), ...semana("2026-11-02", 2), ...semana("2026-11-09", 3), ...semana("2026-11-16", 5)];
  assert.equal(piorouTresSemanas(mediasPorSemana(comBuraco), "2026-11-24"), false, "semana faltando no meio não conta como seguidas");
  assert.equal(piorouTresSemanas(mediasPorSemana(sobe), "2026-11-18"), false, "a semana em curso (incompleta) não entra");
  const poucos = [...semana("2026-10-26", 1, 1), ...semana("2026-11-02", 2, 1), ...semana("2026-11-09", 3, 1), ...semana("2026-11-16", 5, 1)];
  assert.equal(piorouTresSemanas(mediasPorSemana(poucos), "2026-11-24"), false, "semana com menos de 3 dias fechados não decide");
  const tico = [0, 0.1, 0.2, 0.4].flatMap((n, i) => semana(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"][i], n * 10).map((d) => ({ ...d, fechamento: { sintomas: { gases: 0 } } })));
  assert.equal(piorouTresSemanas(mediasPorSemana(tico), "2026-11-24"), false, "sem subir pelo menos 1,5 ponto não é piora");
  const aberta = () => false, fechada = () => true;
  assert.deepEqual(semanaParaFechar("2026-11-23", 30, aberta), { de: "2026-11-16", ate: "2026-11-22" }, "segunda 00:30 com a anterior aberta: fecha a anterior");
  assert.deepEqual(semanaParaFechar("2026-11-23", 30, fechada), { de: "2026-11-23", ate: "2026-11-29" }, "anterior já fechada: a semana nova");
  assert.deepEqual(semanaParaFechar("2026-11-23", 13 * 60, aberta), { de: "2026-11-23", ate: "2026-11-29" }, "depois do meio-dia de segunda: a semana nova");
  assert.deepEqual(semanaParaFechar("2026-11-21", 18 * 60, aberta), { de: "2026-11-16", ate: "2026-11-22" }, "sábado: a semana atual, guardada no domingo");
});
