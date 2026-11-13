import { generateVapid, sendPush, b64u, unb64u } from "./webpush.js";
import { verificarAssercao, algSuportado, importarChave } from "./webauthn.js";
import { dueBetween, upcoming, localDate, addDays } from "./schedule.js";
import { normalizarPlano, agenda, listaDeCompras, totais, metaDoDia, comidaXSintoma, historicoTestes, VEREDITOS, lerAgendaPulse, custoDaLista, semanas, slug } from "../public/js/plan.js";
import { responderMcp, REGRAS, exemploDoFormato } from "./mcp.js";
import { perguntasDoMomento, HORARIOS } from "./proativo.js";

// Chaves no KV:
//   meta          { history: [{ id, title, from, to, uploadedAt, by, method }] }  (mais novo primeiro)
//   plan:<id>     HTML do plano, como foi enviado
//   sched:<id>    agenda extraída daquele plano
//   sched         agenda consolidada (planos mais novos sobrescrevem datas de mais antigos)
//   devices       { <id>: aparelho }
//   snoozes       [{ at, deviceId, payload }]
//   vapid         par de chaves do Web Push (gerado sozinho na primeira vez)
//   passkeys      { <credId>: { pub, alg, device, name, created } }  — desbloqueio por digital
// No D1, tabela "chaves": mcp_token (segredo da URL do conector) e rascunho (plano que o Claude está montando).

const COOKIE = "pf_auth";
const MAX_HISTORY = 18;
const enc = new TextEncoder();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

const getJSON = async (env, key, def) => (await env.KV.get(key, "json")) ?? def;
const putJSON = (env, key, val) => env.KV.put(key, JSON.stringify(val));
const tzOf = (env) => env.TZ || "America/Sao_Paulo";

// ---------- autenticação ----------
// Dois cookies: pf_auth (este celular já entrou com a senha; ~1 ano) e pf_sess (sessão desbloqueada; vence após
// IDLE sem uso e se renova a cada chamada). Sem pf_sess o app pede a digital (passkey) ou a senha.
// SameSite=None + Partitioned: o cookie também funciona com a Mesa aberta dentro do Pulse (iframe), cada um no seu
// "pote" (Partitioned), e um site estranho não consegue usar o cookie de outro pote.

const SESS = "pf_sess";
const IDLE_MS = 4 * 3600e3; // "algumas horas" sem uso
const ATTR = "Path=/; HttpOnly; Secure; SameSite=None; Partitioned";

async function tokenFor(secret, msg = "plano-familia:v1") {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const lerCookie = (req, nome) => (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`))?.[1] || "";

async function cookieSessao(env) {
  const exp = Date.now() + IDLE_MS;
  return `${SESS}=${exp}.${await tokenFor(env.APP_PASSWORD, `sess:${exp}`)}; Max-Age=${IDLE_MS / 1000}; ${ATTR}`;
}

/** 0 = ninguém · 1 = celular cadastrado, mas bloqueado · 2 = desbloqueado */
async function nivel(req, env) {
  if (!env.APP_PASSWORD) return 0;
  if (!sameString(lerCookie(req, COOKIE), await tokenFor(env.APP_PASSWORD))) return 0;
  const [exp, sig] = lerCookie(req, SESS).split(".");
  if (+exp > Date.now() && sig && sameString(sig, await tokenFor(env.APP_PASSWORD, `sess:${exp}`))) return 2;
  return 1;
}

async function login(req, env) {
  if (!env.APP_PASSWORD) return json({ error: "APP_PASSWORD não configurada no Cloudflare (veja o README)." }, 500);
  const { password } = await req.json().catch(() => ({}));
  const ok = typeof password === "string" && sameString(await tokenFor(password), await tokenFor(env.APP_PASSWORD));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: "Senha incorreta" }, 401);
  }
  const r = json({ ok: true });
  r.headers.append("set-cookie", `${COOKIE}=${await tokenFor(env.APP_PASSWORD)}; Max-Age=34560000; ${ATTR}`);
  r.headers.append("set-cookie", await cookieSessao(env));
  return r;
}

// ---------- digital (passkey) ----------
// Desafio sem estado: "<vence>.<aleatório>.<hmac>" — vale 2 minutos.
// shortcut: o mesmo desafio pode ser reusado dentro desses 2 min; se um dia importar, guardar os usados no KV.

async function novoDesafio(env) {
  const exp = Date.now() + 120e3;
  const r = b64u(crypto.getRandomValues(new Uint8Array(16)));
  return b64u(enc.encode(`${exp}.${r}.${await tokenFor(env.APP_PASSWORD, `chal:${exp}.${r}`)}`));
}

async function desafioValido(env, ch) {
  try {
    const [exp, r, sig] = new TextDecoder().decode(unb64u(ch)).split(".");
    return +exp > Date.now() && !!sig && sameString(sig, await tokenFor(env.APP_PASSWORD, `chal:${exp}.${r}`));
  } catch (e) {
    return false;
  }
}

async function passkeyRegistrar(req, env) {
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string" || !/^[\w-]{16,400}$/.test(b.id) || typeof b.pub !== "string" || b.pub.length > 2000 || !algSuportado(b.alg))
    return json({ error: "Passkey inválida" }, 400);
  try { await importarChave(b.pub, b.alg); } catch (e) { return json({ error: "Chave pública inválida" }, 400); }
  const pk = await getJSON(env, "passkeys", {});
  pk[b.id] = { pub: b.pub, alg: +b.alg, device: cleanStr(b.device, 64), name: cleanStr(b.name, 40), created: Date.now() };
  await putJSON(env, "passkeys", pk);
  return json({ ok: true });
}

async function passkeyVerificar(req, env, url) {
  const b = await req.json().catch(() => ({}));
  const cred = (await getJSON(env, "passkeys", {}))[b.id];
  if (!cred) return json({ error: "Digital não cadastrada neste app. Entre com a senha." }, 404);
  try {
    await verificarAssercao({ ...cred, ...b, origem: url.origin, rpId: url.hostname, desafioOk: (c) => desafioValido(env, c) });
  } catch (e) {
    return json({ error: "Não deu para confirmar a digital: " + e.message }, 401);
  }
  const r = json({ ok: true });
  r.headers.append("set-cookie", await cookieSessao(env));
  return r;
}

// ---------- push ----------

async function vapidOf(env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) };
  }
  let v = await getJSON(env, "vapid", null);
  if (!v) {
    v = await generateVapid();
    await putJSON(env, "vapid", v);
  }
  return v;
}

/** Envia para vários aparelhos; apaga do KV os que o serviço de push disse que morreram. */
async function pushMany(env, targets, opts = {}) {
  if (!targets.length) return [];
  const vapid = await vapidOf(env);
  const subject = env.VAPID_SUBJECT || "mailto:familia@example.com";
  const results = await Promise.all(
    targets.map(async ({ device, payload }) => {
      try {
        const r = await sendPush(device.sub, { ...payload, ts: Date.now() }, { vapid, subject, ...opts });
        return { id: device.id, ...r };
      } catch (e) {
        return { id: device.id, ok: false, error: String(e) };
      }
    }),
  );
  const gone = results.filter((r) => r.gone).map((r) => r.id);
  if (gone.length) {
    const devices = await getJSON(env, "devices", {});
    for (const id of gone) if (devices[id]) devices[id].sub = null;
    await putJSON(env, "devices", devices);
  }
  return results;
}

// ---------- planos ----------

function cleanStr(s, n) {
  return typeof s === "string" ? s.slice(0, n) : "";
}

/** Recalcula a agenda consolidada a partir do histórico (mais novo vence). */
async function rebuildSched(env, meta) {
  const today = localDate(Date.now(), tzOf(env));
  const keep = addDays(today, -2);
  const relevant = meta.history.filter((h) => h.to >= keep).reverse(); // do mais velho para o mais novo
  const merged = { persons: {}, days: {}, lastDate: null };
  for (const h of relevant) {
    const s = await getJSON(env, `sched:${h.id}`, null);
    if (!s) continue;
    Object.assign(merged.persons, s.persons);
    for (const [date, d] of Object.entries(s.days)) if (date >= keep) merged.days[date] = { ...d, planId: h.id };
  }
  const dates = Object.keys(merged.days).sort();
  merged.lastDate = dates[dates.length - 1] || null;
  await putJSON(env, "sched", merged);
  return merged;
}

async function uploadPlan(req, env, ctx) {
  const body = await req.json().catch(() => null);
  if (!body || !body.plano) return json({ error: "Plano ausente" }, 400);
  const { status, resposta } = await publicar(env, ctx, typeof body.plano === "string" ? body.plano : JSON.stringify(body.plano), body.deviceId);
  return json(resposta, status);
}

/** Valida, guarda e avisa os celulares. Usado pelo upload no app e pelo conector do Claude (deviceId vazio, por = "Claude"). */
async function publicar(env, ctx, bruto, deviceId, por = "") {
  if (bruto.length > 3_000_000) return { status: 413, resposta: { error: "Plano grande demais (máx. 3 MB)" } };
  const { plano, erros, avisos } = normalizarPlano(bruto);
  if (!plano) return { status: 422, resposta: { error: "O plano tem erros", erros, avisos } };

  const devices = await getJSON(env, "devices", {});
  const by = devices[deviceId]?.name || por;
  const id = `${plano.inicio.replace(/-/g, "")}-${Date.now().toString(36)}`;
  await gravarPlanoBruto(env, id, bruto);
  await putJSON(env, `sched:${id}`, agenda(plano));

  const meta = await lerMeta(env);
  meta.history.unshift({ id, kind: "v2", title: plano.titulo, from: plano.inicio, to: plano.fim, uploadedAt: Date.now(), by });
  for (const old of meta.history.splice(MAX_HISTORY)) {
    ctx.waitUntil(apagarPlanoBruto(env, old.id));
    ctx.waitUntil(env.KV.delete(`sched:${old.id}`));
  }
  await gravarMeta(env, meta);
  await rebuildSched(env, meta);

  const br = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const targets = Object.values(devices)
    .filter((d) => d.sub && d.id !== deviceId && d.updates !== false)
    .map((device) => ({
      device,
      payload: {
        kind: "update",
        title: "Plano novo no ar ✨",
        body: `${plano.titulo} · ${br(plano.inicio)} a ${br(plano.fim)}${by ? ` · enviado por ${by}` : ""}. Toque para ver.`,
        tag: "plan-update",
        url: "/?atualizado=1",
      },
    }));
  ctx.waitUntil(pushMany(env, targets, { ttl: 86400, urgency: "normal" }));
  return { status: 200, resposta: { ok: true, id, notified: targets.length, avisos } };
}

// ---------- conector do Claude (MCP) ----------
// URL secreta: /mcp/<token>. Quem tem a URL lê e publica o plano — ela fica só nos Conectores do Claude do Rafael.
// shortcut: segredo na URL em vez de OAuth; se um dia a URL precisar circular, trocar por OAuth (workers-oauth-provider).

async function tokenMcp(env, novo = false) {
  let t = novo ? null : await lerChave(env, "mcp_token");
  if (!t) { t = b64u(crypto.getRandomValues(new Uint8Array(24))); await gravarChave(env, "mcp_token", t); }
  return t;
}

const lerJsonSeguro = (v) => { try { return JSON.parse(v); } catch (e) { return v; } };

/** O plano em vigor hoje (ou o mais novo), já normalizado. */
async function planoVigente(env, hoje) {
  const meta = await lerMeta(env);
  const v2 = meta.history.filter((h) => h.kind === "v2");
  const info = v2.find((h) => h.from <= hoje && hoje <= h.to) || v2[0];
  if (!info) return { info: null, bruto: null, plano: null, historico: meta.history };
  const bruto = await lerPlanoBruto(env, info.id);
  return { info, bruto, plano: bruto && normalizarPlano(bruto).plano, historico: meta.history };
}

async function contextoFamilia(env, dias) {
  const hoje = localDate(Date.now(), tzOf(env));
  const desde = addDays(hoje, -Math.max(7, Math.min(120, Number(dias) || 45)));
  const { info, plano, historico } = await planoVigente(env, hoje);
  const { results } = await (await db(env))
    .prepare(`SELECT kind, day, person, k, v FROM log WHERE deleted = 0 AND day >= ? AND kind IN ('weight','feedback','symptom','test','eaten','swap','trained','partial','checkin','water','aceite','pulse') ORDER BY day`)
    .bind(addDays(hoje, -365)).all();
  const r = results.filter((x) => x.kind === "weight" || x.kind === "test" || x.day >= desde); // peso e testes: o ano todo
  const valor = new Map(results.map((x) => [`${x.kind}|${x.day}|${x.person}|${x.k}`, x.v]));
  const por = (kind) => r.filter((x) => x.kind === kind);

  const adesao = {};
  for (const p of plano?.pessoas || []) {
    const diasPlano = plano.dias.filter((d) => d.data >= desde && d.data <= hoje && d.data >= plano.inicio);
    const planejadas = diasPlano.reduce((n, d) => n + (d.refeicoes[p.id]?.length || 0), 0);
    const feitas = por("eaten").filter((x) => x.person === p.id && diasPlano.some((d) => d.data === x.day)).length;
    adesao[p.id] = { refeicoesPlanejadas: planejadas, marcadasComoFeitas: feitas, percentual: planejadas ? Math.round((feitas / planejadas) * 100) : null };
  }
  const pesos = {};
  for (const x of por("weight")) (pesos[x.person] ||= []).push([x.day, Number(x.v)]);
  return {
    hoje, periodoAnalisado: { de: desde, ate: hoje },
    planoAtual: info && plano ? { id: info.id, titulo: plano.titulo, de: plano.inicio, ate: plano.fim, publicadoPor: info.by || "",
      pessoas: plano.pessoas.map((p) => ({ id: p.id, nome: p.nome, resumo: p.resumo, metas: p.metas, restricoes: p.restricoes, suplementos: p.suplementos })) } : null,
    planosAnteriores: historico.slice(0, 6).map((h) => ({ titulo: h.title, de: h.from, ate: h.to })),
    pesos,
    feedbackDiario: por("feedback").filter((x) => x.k === "dia").map((x) => ({ dia: x.day, pessoa: x.person, ...lerJsonSeguro(x.v) })),
    fechamentosSemanais: por("feedback").filter((x) => x.k === "semana").map((x) => ({ semanaDesde: x.day, pessoa: x.person, ...lerJsonSeguro(x.v) })),
    diarioDeSintomas: por("symptom").map((x) => ({ dia: x.day, pessoa: x.person, ...lerJsonSeguro(x.v) })),
    resultadosDeTestes: por("test").map((x) => ({ dia: x.day, pessoa: x.person, teste: x.k, resultado: x.v })),
    respostasDasPerguntas: por("checkin").map((x) => ({ dia: x.day, pessoa: x.person, pergunta: x.k, resposta: x.v })),
    refeicoesComidasEmParte: por("partial").map((x) => ({ dia: x.day, pessoa: x.person, refeicao: x.k, ...lerJsonSeguro(x.v) })),
    trocasDeOpcao: por("swap").map((x) => ({ dia: x.day, pessoa: x.person, refeicao: x.k, opcaoEscolhida: Number(x.v) + 1 })),
    naoTreinou: por("trained").filter((x) => x.v === "0").map((x) => ({ dia: x.day, pessoa: x.person })),
    aguaMl: por("water").map((x) => ({ dia: x.day, pessoa: x.person, ml: Number(x.v) })),
    custoDaDieta: await (async () => {
      const pc = await precosCesta(env);
      if (!pc || !plano) return null;
      return { precosDaCestaEm: new Date(pc.quando).toISOString().slice(0, 10), porSemana: semanas(plano).map((w) => ({ semana: w.n, de: w.de, ate: w.ate, ...custoDaLista(listaDeCompras(plano, w.de, w.ate), pc.precos) })),
        observacao: "R$ estimados com os menores preços anotados na Cesta; só os itens que a Cesta ligou a um produto com preço (comPreco de itens)." };
    })(),
    agendaDeTreinoDoPulse: por("pulse").map((x) => ({ dia: x.day, pessoa: x.person, ...(lerAgendaPulse(x.v) || {}) })),
    aceitacaoCrianca: por("aceite").map((x) => ({ dia: x.day, pessoa: x.person, refeicao: x.k, comeu: x.v })),
    testesPorAlimento: Object.fromEntries((plano?.pessoas || []).map((p) => [p.id, historicoTestes(por("test").filter((x) => x.person === p.id))
      .map((t) => ({ alimento: t.alimento, resultado: VEREDITOS[t.veredito], doses: t.doses.map((d) => `${d.dia}: ${d.v}`) }))])),
    comidaXSintoma: Object.fromEntries((plano?.pessoas || []).map((p) => [p.id, comidaXSintoma(plano, p.id, (k, dia, id) => valor.get(`${k}|${dia}|${p.id}|${id}`) ?? null,
      por("symptom").filter((x) => x.person === p.id).map((x) => ({ day: x.day, ...lerJsonSeguro(x.v) })), hoje)])),
    adesao,
  };
}

function resumoDoPlano(plano, avisos) {
  const porPessoa = plano.pessoas.map((p) => {
    const ds = plano.dias.filter((d) => d.refeicoes[p.id]?.length);
    const media = (f) => Math.round(ds.reduce((n, d) => n + f(d), 0) / (ds.length || 1));
    return { pessoa: p.nome, diasComCardapio: ds.length, kcalMedia: media((d) => totais(d.refeicoes[p.id]).kcal),
      metaMedia: media((d) => metaDoDia(plano, p.id, d.tipo[p.id]).kcal || 0), proteinaMedia: media((d) => totais(d.refeicoes[p.id]).proteina) };
  });
  return { titulo: plano.titulo, de: plano.inicio, ate: plano.fim, dias: plano.dias.length, porPessoa, avisos };
}

function ferramentasMcp(env, ctx) {
  const leitura = { readOnlyHint: true, openWorldHint: false };
  const rascunho = async () => {
    const r = await lerChave(env, "rascunho");
    if (!r) throw new Error("Não há rascunho. Chame iniciar_rascunho primeiro.");
    return JSON.parse(r);
  };
  return [
    { name: "contexto_da_familia", title: "Contexto da família",
      description: "Plano atual (pessoas e metas), pesos, feedback diário e semanal, diário de sintomas, resultados de testes (e o resumo por alimento de todos os meses), alimentos que mais aparecem nos dias com sintoma (comidaXSintoma: padrão, não prova), água, aceitação da criança (comeu bem/pouco/recusou), refeições comidas em parte, trocas de opção e adesão. Use antes de montar o plano novo.",
      inputSchema: { type: "object", properties: { dias: { type: "integer", description: "Quantos dias para trás analisar (padrão 45)." } } },
      annotations: leitura, run: (a) => contextoFamilia(env, a.dias) },
    { name: "plano_atual", title: "Plano atual (JSON)",
      description: "O JSON completo do plano em vigor (formato plano-familia/2), para continuar ou ajustar.",
      inputSchema: { type: "object", properties: {} }, annotations: leitura,
      run: async () => (await planoVigente(env, localDate(Date.now(), tzOf(env)))).bruto || "Nenhum plano publicado ainda." },
    { name: "formato_do_plano", title: "Formato do plano",
      description: "Regras do formato plano-familia/2 e um exemplo completo válido.",
      inputSchema: { type: "object", properties: {} }, annotations: leitura,
      run: () => `${REGRAS}

Exemplo válido:
${JSON.stringify(exemploDoFormato())}` },
    { name: "iniciar_rascunho", title: "Iniciar rascunho",
      description: "Começa um plano novo com o cabeçalho (formato, titulo, subtitulo, inicio, fim, pessoas, tiposDeDia, conversoes, modelos, lotes, compras, testes, regras, notas). Os dias vêm depois, em adicionar_dias. Substitui um rascunho anterior.",
      inputSchema: { type: "object", properties: { cabecalho: { type: "object" } }, required: ["cabecalho"] },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      run: async (a) => {
        if (!a.cabecalho || typeof a.cabecalho !== "object") throw new Error("Envie { cabecalho: { ... } }");
        await gravarChave(env, "rascunho", JSON.stringify({ ...a.cabecalho, formato: "plano-familia/2", dias: Array.isArray(a.cabecalho.dias) ? a.cabecalho.dias : [] }));
        return { ok: true, proximo: "adicionar_dias em blocos de até 7 dias" };
      } },
    { name: "adicionar_dias", title: "Adicionar dias ao rascunho",
      description: "Acrescenta (ou substitui, pela data) dias ao rascunho. Mande até 7–10 dias por vez. Devolve os erros desses dias e as datas que ainda faltam.",
      inputSchema: { type: "object", properties: { dias: { type: "array", items: { type: "object" } } }, required: ["dias"] },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      run: async (a) => {
        const r = await rascunho();
        if (!Array.isArray(a.dias) || !a.dias.length) throw new Error("Envie { dias: [ ... ] }");
        if (a.dias.length > 31) throw new Error("No máximo 31 dias por chamada");
        const porData = new Map(r.dias.map((d) => [d.data, d]));
        for (const d of a.dias) porData.set(d?.data, d);
        r.dias = [...porData.values()].sort((x, y) => String(x.data).localeCompare(String(y.data)));
        await gravarChave(env, "rascunho", JSON.stringify(r));
        const { erros } = normalizarPlano({ ...r, dias: a.dias, inicio: undefined, fim: undefined });
        const faltam = [];
        if (/^\d{4}-\d{2}-\d{2}$/.test(r.inicio || "") && /^\d{4}-\d{2}-\d{2}$/.test(r.fim || ""))
          for (let d = r.inicio; d <= r.fim && faltam.length < 40; d = addDays(d, 1)) if (!porData.has(d)) faltam.push(d);
        return { diasNoRascunho: r.dias.length, faltam, erros };
      } },
    { name: "publicar_rascunho", title: "Validar ou publicar o rascunho",
      description: "Com so_validar=true, confere o plano inteiro e devolve o resumo (médias de kcal contra a meta, avisos). Com so_validar=false, publica: vira o plano da família e os celulares são avisados. Publique só depois de o Rafael confirmar.",
      inputSchema: { type: "object", properties: { so_validar: { type: "boolean" } }, required: ["so_validar"] },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run: async (a) => {
        const bruto = JSON.stringify(await rascunho());
        const { plano, erros, avisos } = normalizarPlano(bruto);
        if (!plano) throw new Error(`O plano tem erros:
- ${erros.join("\n- ")}`);
        if (a.so_validar !== false) return { valido: true, ...resumoDoPlano(plano, avisos) };
        const { status, resposta } = await publicar(env, ctx, bruto, "", "Claude");
        if (status !== 200) throw new Error(resposta.error + (resposta.erros ? `:
- ${resposta.erros.join("\n- ")}` : ""));
        await gravarChave(env, "rascunho", null);
        return { publicado: true, id: resposta.id, celularesAvisados: resposta.notified, ...resumoDoPlano(plano, avisos) };
      } },
  ];
}

// ---------- registro compartilhado (D1): comi, compras, peso, sintomas, testes ----------
// Uma linha por fato; o celular manda "ops" e puxa o que mudou desde o último "since".

const KINDS = new Set(["eaten", "shop", "shopx", "weight", "symptom", "test", "trained", "swap", "feedback", "partial", "checkin", "burn", "water", "aceite"]);
const dbReady = new WeakMap(); // por banco: cria a tabela uma vez por instância do Worker
function db(env) {
  if (!dbReady.has(env.DB)) {
    dbReady.set(env.DB, env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS log (kind TEXT NOT NULL, day TEXT NOT NULL, person TEXT NOT NULL DEFAULT '', k TEXT NOT NULL DEFAULT '',
        v TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, by TEXT, PRIMARY KEY (kind, day, person, k))`),
      env.DB.prepare(`CREATE INDEX IF NOT EXISTS log_updated ON log(updated)`),
      // chave → valor com leitura imediata (o KV demora até 1 min para espalhar): rascunho do Claude e chave do conector
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS chaves (k TEXT PRIMARY KEY, v TEXT)`),
      // limpeza única (autorizada pelo Rafael em 05/11): até 29/10 o Pulse gravava o Rafael como "rafa" (login da conta).
      // "Treinou hoje?" que só existe lá passa para "rafael" (carimbo novo, os celulares baixam); o resto (pesos já
      // copiados para "rafael") sai. Depois da primeira vez não acha mais nada.
      env.DB.prepare(`UPDATE OR IGNORE log SET person = 'rafael', updated = CAST(unixepoch('subsec') * 1000 AS INTEGER) + rowid WHERE person = 'rafa' AND kind = 'trained'`),
      env.DB.prepare(`DELETE FROM log WHERE person = 'rafa'`),
    ]).catch((e) => { dbReady.delete(env.DB); throw e; }));
  }
  return dbReady.get(env.DB).then(() => env.DB);
}

// ---------- planos e histórico no D1: leitura imediata depois de publicar (o KV pode atrasar até 1 min entre servidores) ----------
// O que foi gravado antes continua no KV e é lido de lá (sem migração); a próxima gravação já vai para o D1.
// shortcut: plano acima de ~1,9 MB (limite de linha do D1) fica no KV; o maior até hoje tem ~290 KB.
const LIMITE_D1 = 1_900_000;
async function lerPlanoBruto(env, id) { return (await lerChave(env, `plan:${id}`)) ?? (await env.KV.get(`plan:${id}`)); }
async function gravarPlanoBruto(env, id, bruto) {
  if (bruto.length < LIMITE_D1) await gravarChave(env, `plan:${id}`, bruto); else await env.KV.put(`plan:${id}`, bruto);
}
async function apagarPlanoBruto(env, id) { await Promise.all([gravarChave(env, `plan:${id}`, null), env.KV.delete(`plan:${id}`)]); }
async function lerMeta(env) {
  const v = await lerChave(env, "meta");
  return v ? JSON.parse(v) : getJSON(env, "meta", { history: [] });
}
const gravarMeta = (env, meta) => gravarChave(env, "meta", JSON.stringify(meta));

async function lerChave(env, k) {
  const r = await (await db(env)).prepare(`SELECT v FROM chaves WHERE k = ?`).bind(k).first();
  return r ? r.v : null;
}
async function gravarChave(env, k, v) {
  const d = await db(env);
  if (v == null) await d.prepare(`DELETE FROM chaves WHERE k = ?`).bind(k).run();
  else await d.prepare(`INSERT INTO chaves (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).bind(k, v).run();
}

async function readLog(env, since) {
  const d = await db(env);
  const floor = since > 0 ? since : Date.now() - 400 * 864e5;
  const { results } = await d.prepare(`SELECT kind, day, person, k, v, deleted, updated, by FROM log WHERE updated >= ? ORDER BY updated LIMIT 5000`).bind(floor).all();
  return json({ now: Date.now(), rows: results });
}

async function writeLog(req, env) {
  const { ops, device } = await req.json().catch(() => ({}));
  if (!Array.isArray(ops) || !ops.length) return json({ error: "sem operações" }, 400);
  const d = await db(env);
  const now = Date.now();
  const stmts = [];
  for (const [i, o] of ops.slice(0, 200).entries()) {
    if (!o || !KINDS.has(o.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(o.day || "")) continue;
    stmts.push(d.prepare(`INSERT INTO log (kind, day, person, k, v, deleted, updated, by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, day, person, k) DO UPDATE SET v = excluded.v, deleted = excluded.deleted, updated = excluded.updated, by = excluded.by`)
      .bind(o.kind, o.day, cleanStr(o.person, 24), cleanStr(o.k, 80), o.v == null ? null : cleanStr(String(o.v), 2000), o.deleted ? 1 : 0, now + i, cleanStr(device, 40)));
  }
  if (stmts.length) await d.batch(stmts);
  return json({ ok: true, now: now + stmts.length, written: stmts.length });
}

async function deletePlan(env, id) {
  const meta = await lerMeta(env);
  meta.history = meta.history.filter((h) => h.id !== id);
  await gravarMeta(env, meta);
  await apagarPlanoBruto(env, id);
  await env.KV.delete(`sched:${id}`);
  await rebuildSched(env, meta);
  return json({ ok: true });
}

// ---------- aparelhos ----------

const HM = /^\d{2}:\d{2}$/;

function cleanDevice(id, b, prev = {}) {
  const sub = b.sub === undefined ? prev.sub : b.sub;
  const validSub =
    sub && typeof sub.endpoint === "string" && sub.endpoint.startsWith("https://") && sub.keys && sub.keys.p256dh && sub.keys.auth
      ? { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }
      : null;
  return {
    id,
    name: cleanStr(b.name ?? prev.name, 40) || "Celular",
    persons: (Array.isArray(b.persons) ? b.persons : prev.persons || []).slice(0, 8).map((p) => cleanStr(p, 24)),
    viewPerson: cleanStr(b.viewPerson ?? prev.viewPerson, 24),
    lead: Math.max(0, Math.min(120, Math.round(Number(b.lead ?? prev.lead ?? 0)) || 0)),
    meals: (b.meals ?? prev.meals) !== false,
    updates: (b.updates ?? prev.updates) !== false,
    uploader: !!(b.uploader ?? prev.uploader),
    proativo: (b.proativo ?? prev.proativo) !== false,
    summary: (() => {
      const s = b.summary ?? prev.summary ?? {};
      return { on: !!s.on, time: HM.test(s.time) ? s.time : "06:30" };
    })(),
    reminders: (Array.isArray(b.reminders) ? b.reminders : prev.reminders || [])
      .filter((r) => r && HM.test(r.time) && typeof r.text === "string" && r.text.trim())
      .slice(0, 30)
      .map((r) => ({
        id: cleanStr(r.id, 24) || Math.random().toString(36).slice(2, 10),
        text: cleanStr(r.text.trim(), 120),
        time: r.time,
        days: (Array.isArray(r.days) ? r.days : []).map(Number).filter((d) => d >= 0 && d <= 6),
      })),
    sub: validSub,
    createdAt: prev.createdAt || Date.now(),
    lastSeen: Date.now(),
  };
}

const publicDevice = (d) => ({ ...d, sub: undefined, hasPush: !!d.sub });

// ---------- roteador ----------

// Rotas que funcionam com o app bloqueado (só "celular cadastrado"): o necessário para destravar e para as
// ações das notificações (Comi, Adiar) e a renovação da inscrição de push pelo service worker.
const liberadoBloqueado = (m, p) =>
  p === "/api/session" || p === "/api/vapid" || /^\/api\/passkey\/(desafio|verificar)$/.test(p) ||
  (m === "POST" && (p === "/api/snooze" || p === "/api/log")) || (m === "PUT" && /^\/api\/devices\/[\w-]+$/.test(p));

async function handleApi(req, env, ctx, url) {
  const path = url.pathname;
  const method = req.method;

  // Proteção extra contra outro site disparando ações com o cookie: escrita só vinda da própria Mesa.
  const origem = req.headers.get("origin");
  if (method !== "GET" && origem && origem !== url.origin) return json({ error: "Origem não permitida" }, 403);

  if (path === "/api/login" && method === "POST") return login(req, env);
  if (path === "/api/logout" && method === "POST") {
    const r = json({ ok: true });
    for (const c of [COOKIE, SESS]) r.headers.append("set-cookie", `${c}=; Max-Age=0; ${ATTR}`);
    return r;
  }

  const n = await nivel(req, env);
  if (!n) return json({ error: "Não autenticado" }, 401);
  if (n < 2 && !liberadoBloqueado(method, path))
    return json({ error: "Bloqueado", locked: true }, 423);

  const r = await rotas(req, env, ctx, url, n);
  // sessão deslizante: cada uso desbloqueado empurra o vencimento (menos nas respostas imutáveis, que vão para o cache)
  if (n === 2 && !r.headers.get("cache-control")?.includes("immutable")) r.headers.append("set-cookie", await cookieSessao(env));
  return r;
}

async function rotas(req, env, ctx, url, n) {
  const path = url.pathname;
  const method = req.method;

  if (path === "/api/session") return json({ ok: true, tz: tzOf(env), locked: n < 2, idleHours: IDLE_MS / 3600e3 });
  if (path === "/api/vapid") return json({ publicKey: (await vapidOf(env)).publicKey });
  if (path === "/api/passkey/desafio") return json({ challenge: await novoDesafio(env) });
  if (path === "/api/passkey/verificar" && method === "POST") return passkeyVerificar(req, env, url);
  if (path === "/api/passkey" && method === "POST") return passkeyRegistrar(req, env);
  if (path === "/api/mcp") return json({ url: `${url.origin}/mcp/${await tokenMcp(env, method === "POST")}` });
  if (path === "/api/passkey" && method === "DELETE") {
    const { device } = await req.json().catch(() => ({}));
    const pk = await getJSON(env, "passkeys", {});
    for (const [id, c] of Object.entries(pk)) if (c.device === device) delete pk[id];
    await putJSON(env, "passkeys", pk);
    return json({ ok: true });
  }

  if (path === "/api/meta") {
    const [meta, sched] = await Promise.all([lerMeta(env), getJSON(env, "sched", {})]);
    return json({ history: meta.history, persons: sched.persons || {}, lastDate: sched.lastDate || null, today: localDate(Date.now(), tzOf(env)), precosCesta: await precosCesta(env) });
  }

  if (path === "/api/plan" && method === "POST") return uploadPlan(req, env, ctx);

  if (path === "/api/log" && method === "GET") return readLog(env, Number(url.searchParams.get("since")) || 0);
  if (path === "/api/log" && method === "POST") return writeLog(req, env);

  // voltar a um plano anterior: publica de novo o mesmo arquivo (vira o mais novo e os celulares são avisados)
  const volta = path.match(/^\/api\/plan\/([\w-]+)\/voltar$/);
  if (volta && method === "POST") {
    const raw = await lerPlanoBruto(env, volta[1]);
    if (raw === null) return json({ error: "Plano não encontrado" }, 404);
    const { deviceId } = await req.json().catch(() => ({}));
    const { status, resposta } = await publicar(env, ctx, raw, deviceId);
    return json(resposta, status);
  }

  let m = path.match(/^\/api\/plan\/([\w-]+)$/);
  if (m && method === "DELETE") return deletePlan(env, m[1]);
  if (m && method === "GET") {
    const raw = await lerPlanoBruto(env, m[1]);
    if (raw === null) return json({ error: "Plano não encontrado" }, 404);
    return new Response(raw, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=31536000, immutable" } });
  }

  if (path === "/api/devices" && method === "GET") {
    const devices = await getJSON(env, "devices", {});
    return json(Object.values(devices).map((d) => ({ id: d.id, name: d.name, persons: d.persons, hasPush: !!d.sub, lastSeen: d.lastSeen })));
  }

  m = path.match(/^\/api\/devices\/([\w-]{8,64})(\/test|\/upcoming)?$/);
  if (m) {
    const [, id, action] = m;
    const devices = await getJSON(env, "devices", {});
    const dev = devices[id];

    if (!action && method === "GET") return dev ? json(publicDevice(dev)) : json({ error: "não encontrado" }, 404);
    if (!action && method === "PUT") {
      devices[id] = cleanDevice(id, await req.json(), dev);
      await putJSON(env, "devices", devices);
      return json(publicDevice(devices[id]));
    }
    if (!action && method === "DELETE") {
      delete devices[id];
      await putJSON(env, "devices", devices);
      const pk = await getJSON(env, "passkeys", {});
      for (const [k, c] of Object.entries(pk)) if (c.device === id) delete pk[k];
      await putJSON(env, "passkeys", pk);
      return json({ ok: true });
    }
    if (!dev) return json({ error: "Aparelho não registrado" }, 404);
    if (action === "/upcoming") {
      const sched = await getJSON(env, "sched", {});
      return json(upcoming(dev, sched, Date.now(), tzOf(env)));
    }
    if (action === "/test" && method === "POST") {
      if (!dev.sub) return json({ error: "Este aparelho ainda não ativou as notificações" }, 400);
      const [r] = await pushMany(env, [{ device: dev, payload: { kind: "test", title: "✅ Notificações funcionando", body: `Tudo certo no ${dev.name}.`, tag: "test", url: "/" } }]);
      return json(r, r.ok ? 200 : 502);
    }
  }

  if (path === "/api/snooze" && method === "POST") {
    const { deviceId, minutes, payload } = await req.json().catch(() => ({}));
    const devices = await getJSON(env, "devices", {});
    if (!devices[deviceId] || !payload) return json({ error: "inválido" }, 400);
    const min = Math.max(1, Math.min(180, Number(minutes) || 15));
    const snoozes = (await getJSON(env, "snoozes", [])).filter((s) => s.at > Date.now() - 3600000);
    snoozes.push({
      at: Date.now() + min * 60000,
      deviceId,
      payload: { kind: payload.kind || "meal", title: cleanStr(payload.title, 120), body: cleanStr(payload.body, 400), tag: cleanStr(payload.tag, 80), url: cleanStr(payload.url, 200) || "/", snooze: true,
        // mantém o "Comi" no aviso adiado e deixa o cron pular se já foi marcado
        eat: payload.eat && /^\d{4}-\d{2}-\d{2}$/.test(payload.eat.day || "") ? { day: payload.eat.day, person: cleanStr(payload.eat.person, 24), k: cleanStr(payload.eat.k, 80) } : undefined },
    });
    await putJSON(env, "snoozes", snoozes.slice(-50));
    return json({ ok: true });
  }

  return json({ error: "rota desconhecida" }, 404);
}

async function servePlan(req, env, id) {
  if ((await nivel(req, env)) < 2) return new Response("Não autenticado", { status: 401 });
  const html = await lerPlanoBruto(env, id);
  if (html === null) return new Response("Plano não encontrado", { status: 404 });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

// ---------- cron: roda a cada minuto ----------

async function tick(env, scheduledTime) {
  const devices = await getJSON(env, "devices", {});
  const list = Object.values(devices).filter((d) => d.sub);
  if (!list.length) return;
  const [sched, snoozes] = await Promise.all([getJSON(env, "sched", {}), getJSON(env, "snoozes", [])]);

  const tz = tzOf(env);
  const to = scheduledTime;
  const from = to - 60000;
  const targets = [];
  for (const device of list) for (const e of dueBetween(device, sched, from, to, tz)) targets.push({ device, payload: e.payload });

  const dueSnoozes = snoozes.filter((s) => s.at <= to);
  for (const s of dueSnoozes) if (devices[s.deviceId]?.sub) targets.push({ device: devices[s.deviceId], payload: s.payload });
  if (dueSnoozes.length) await putJSON(env, "snoozes", snoozes.filter((s) => s.at > to));

  targets.push(...(await perguntas(env, list, sched, to)));
  const enviar = await semRefeicoesFeitas(env, targets);
  if (enviar.length) await pushMany(env, enviar, { ttl: 1800, urgency: "high" });
}

/** Tira os avisos de refeição (e os adiados) que alguém já marcou como "comi" no app. */
async function semRefeicoesFeitas(env, targets) {
  const dias = [...new Set(targets.filter((t) => t.payload.eat).map((t) => t.payload.eat.day))];
  if (!dias.length) return targets;
  const { results } = await (await db(env)).prepare(`SELECT day, person, k FROM log WHERE kind = 'eaten' AND deleted = 0 AND day IN (${dias.map(() => "?").join(",")})`).bind(...dias).all();
  const feitas = new Set(results.map((r) => `${r.day}|${r.person}|${r.k}`));
  return targets.filter(({ payload: { eat } }) => !eat || !feitas.has(`${eat.day}|${eat.person}|${eat.k}`));
}

// ---------- Mesa proativa (src/proativo.js decide; aqui só junta os fatos e aplica os limites) ----------
// Pergunta para o dono do celular (a pessoa em que ele abre), no máximo 2 por dia, cada uma uma vez.
// shortcut: as marcas "pro:<pessoa>:<dia>" ficam na tabela chaves (uma linha por pessoa por dia); limpar se um dia pesar.
async function perguntas(env, aparelhos, sched, quando) {
  const tz = tzOf(env);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(quando));
  if (!HORARIOS.includes(hm)) return [];
  const hoje = localDate(quando, tz);
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const porPessoa = new Map();
  for (const d of aparelhos) {
    const pid = d.viewPerson || d.persons?.[0];
    if (!pid || d.proativo === false) continue;
    if (!porPessoa.has(pid)) porPessoa.set(pid, []);
    porPessoa.get(pid).push(d);
  }
  const targets = [];
  for (const [pid, devs] of porPessoa) {
    const { results } = await (await db(env)).prepare(`SELECT kind, day, k, v FROM log WHERE deleted = 0 AND person = ? AND day >= ?`).bind(pid, addDays(hoje, -7)).all();
    const testes = [addDays(hoje, -1), addDays(hoje, -2)].flatMap((data) => (sched.days?.[data]?.testes || []).filter((t) => !t.pessoa || t.pessoa === pid).map((t) => ({ ...t, data })));
    const chave = `pro:${pid}:${hoje}`;
    const enviados = JSON.parse((await lerChave(env, chave)) || "[]");
    const qs = perguntasDoMomento({
      hm, dow, hoje, pid, nome: sched.persons?.[pid] || pid, refeicoes: sched.days?.[hoje]?.meals?.[pid] || [], linhas: results, testes,
      testesHoje: (sched.days?.[hoje]?.testes || []).filter((t) => !t.pessoa || t.pessoa === pid),
      ultimaSumido: await lerChave(env, `pro:${pid}:sumido`),
    }).filter((q) => !enviados.includes(q.id)).slice(0, Math.max(0, 2 - enviados.length));
    for (const q of qs) {
      enviados.push(q.id);
      for (const device of devs) targets.push({ device, payload: q.payload });
      if (q.id === "sumido") await gravarChave(env, `pro:${pid}:sumido`, hoje);
    }
    if (qs.length) await gravarChave(env, chave, JSON.stringify(enviados));
  }
  return targets;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(req, env, ctx, url);
      const mcp = url.pathname.match(/^\/mcp\/([\w-]{20,})$/);
      if (mcp) {
        const t = await lerChave(env, "mcp_token");
        if (!t || !sameString(mcp[1], t)) return new Response("Não encontrado", { status: 404 });
        return await responderMcp(req, ferramentasMcp(env, ctx));
      }
      const m = url.pathname.match(/^\/p\/([\w-]+)\.html$/);
      if (m) return await servePlan(req, env, m[1]);
      if (url.pathname === "/share") return Response.redirect(new URL("/?share=erro", url).toString(), 303);
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return json({ error: "Erro interno: " + e.message }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(tick(env, controller.scheduledTime));
  },
};

// ---------- ponte com o Pulse (app de treino): peso único, "treinou hoje?" e gasto do cardio (kcal) ----------
// Só o Worker do Pulse chama isto, pela ligação interna entre Workers (src/index.js → classe Ponte).
// Não existe rota pública: pela internet ninguém lê nem grava por aqui.

const PONTE_KINDS = new Set(["weight", "trained", "burn", "pulse"]); // pulse = agenda de treino ("1|HH:MM|Nome" ou "0")

/** Pesos de uma pessoa alterados depois de `since` (ms). Inclui apagados (deleted = 1). */
export async function ponteLer(env, person, since = 0) {
  const d = await db(env);
  const { results } = await d
    .prepare(`SELECT day, v, deleted, updated FROM log WHERE kind = 'weight' AND person = ? AND updated > ? ORDER BY updated LIMIT 2000`)
    .bind(cleanStr(person, 24), Number(since) || 0)
    .all();
  return { now: Date.now(), rows: results.map((r) => ({ day: r.day, kg: r.v == null ? null : Number(r.v), deleted: !!r.deleted, updated: r.updated })) };
}

/** Grava peso/treino/gasto vindos do Pulse. ops: [{ kind: "weight"|"trained"|"burn", person, day, v, deleted }]. */
export async function ponteGravar(env, ops) {
  if (!Array.isArray(ops) || !ops.length) return { written: 0 };
  const d = await db(env);
  const now = Date.now();
  const stmts = [];
  for (const [i, o] of ops.slice(0, 200).entries()) {
    if (!o || !PONTE_KINDS.has(o.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(o.day || "")) continue;
    const person = cleanStr(o.person, 24);
    if (!person) continue;
    stmts.push(d.prepare(`INSERT INTO log (kind, day, person, k, v, deleted, updated, by) VALUES (?, ?, ?, '', ?, ?, ?, 'Pulse')
      ON CONFLICT(kind, day, person, k) DO UPDATE SET v = excluded.v, deleted = excluded.deleted, updated = excluded.updated, by = excluded.by`)
      .bind(o.kind, o.day, person, o.v == null ? null : cleanStr(String(o.v), 40), o.deleted ? 1 : 0, now + i));
  }
  if (stmts.length) await d.batch(stmts);
  return { written: stmts.length, now: now + stmts.length };
}

// ---------- ponte com a Cesta: preços dos itens da dieta (item 4.2 do roadmap) ----------
// A Cesta manda, ao trazer a lista da dieta, o preço por g/ml/un de cada item que ela ligou a um produto com preço.
// Aqui fica só isso (nome, unidade, preço) — a Mesa soma o custo de qualquer período e o Claude vê no contexto.

/** itens: [{ nome, unid: "g"|"ml"|"un", preco (R$ por g/ml/un) }]. Substitui os preços anteriores dos mesmos itens. */
export async function ponteGuardarPrecos(env, itens) {
  if (!Array.isArray(itens)) return { gravados: 0 };
  const atual = await precosCesta(env);
  const precos = { ...(atual?.precos || {}) };
  let n = 0;
  for (const i of itens.slice(0, 500)) {
    const nome = cleanStr(i?.nome, 80), preco = Number(i?.preco);
    if (!nome || !["g", "ml", "un"].includes(i.unid) || !(preco > 0 && preco < 1000)) continue;
    precos[`${slug(nome)}|${i.unid}`] = Math.round(preco * 1e6) / 1e6;
    n++;
  }
  if (n) await gravarChave(env, "precos-cesta", JSON.stringify({ quando: Date.now(), precos }));
  return { gravados: n };
}
async function precosCesta(env) {
  const v = await lerChave(env, "precos-cesta");
  return v ? JSON.parse(v) : null;
}

// ---------- ponte com a Cesta (app do mercado): lista de compras da dieta ----------
// Só o Worker da Cesta chama isto, pela ligação interna entre Workers (classe Ponte). Devolve só o que vai para o
// carrinho (nome, quantidade, unidade, seção) — nada de refeições, peso ou saúde.

/** Lista de compras somada entre `de` e `ate` (AAAA-MM-DD, até 62 dias). Cada dia usa o plano mais novo que o cobre. */
export async function ponteCompras(env, de, ate) {
  const data = /^\d{4}-\d{2}-\d{2}$/;
  if (!data.test(de || "") || !data.test(ate || "") || de > ate) return { erro: "Período inválido", itens: [], planos: [] };
  if (addDays(de, 61) < ate) ate = addDays(de, 61);
  const meta = await lerMeta(env);
  const planos = meta.history.filter((h) => h.kind === "v2");
  // trechos seguidos de dias com o mesmo plano (somar por trecho evita arredondar dia a dia)
  const trechos = [];
  let semPlano = 0;
  for (let d = de; d <= ate; d = addDays(d, 1)) {
    const h = planos.find((x) => x.from <= d && d <= x.to);
    if (!h) { semPlano++; continue; }
    const ult = trechos[trechos.length - 1];
    if (ult && ult.id === h.id && addDays(ult.ate, 1) === d) ult.ate = d;
    else trechos.push({ id: h.id, titulo: h.title, de: d, ate: d });
  }
  const acc = new Map();
  const cache = new Map();
  for (const t of trechos) {
    if (!cache.has(t.id)) cache.set(t.id, normalizarPlano((await lerPlanoBruto(env, t.id)) || "").plano);
    const plano = cache.get(t.id);
    if (!plano) continue;
    for (const { categoria, itens } of listaDeCompras(plano, t.de, t.ate)) {
      for (const it of itens) {
        const k = `${it.nome}|${it.unid}`;
        const cur = acc.get(k) || { categoria, nome: it.nome, unid: it.unid, qtd: null };
        if (it.qtd != null) cur.qtd = (cur.qtd || 0) + it.qtd;
        acc.set(k, cur);
      }
    }
  }
  return { de, ate, semPlano, planos: [...new Set(trechos.map((t) => t.titulo))], itens: [...acc.values()] };
}

// exportado para os testes
export { cleanDevice };
