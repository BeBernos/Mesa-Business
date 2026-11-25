// Ponta a ponta da nova Mesa (/v3/). Roda contra o `wrangler dev` (CI) com estado zerado.
// Uso: npm run dev   e em outro terminal:   SHOTS=pasta node test/e2e.v3.mjs [http://localhost:8787] [senha]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const [, , base = "http://localhost:8787", senha = "teste-local-123"] = process.argv;
const SHOTS = process.env.SHOTS || ".";
const erros = [];
const ok = (cond, msg) => { if (!cond) throw new Error("FALHOU: " + msg); console.log("✓", msg); };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// plano de exemplo com as datas trazidas para hoje/amanhã
const tz = "America/Sao_Paulo";
const hoje = new Date().toLocaleDateString("en-CA", { timeZone: tz });
const amanha = new Date(Date.now() + 864e5).toLocaleDateString("en-CA", { timeZone: tz });
const plano = JSON.parse(readFileSync(new URL("../docs/exemplo-plano.json", import.meta.url), "utf8"));
Object.assign(plano, { inicio: hoje, fim: amanha });
plano.dias[0].data = hoje;
plano.dias[1].data = amanha;
plano.testes[0].doses[0].data = amanha;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: tz, locale: "pt-BR" });
// aparelho já cadastrado (celular novo vai uma vez à antiga para a primeira configuração)
await ctx.addInitScript(() => { if (!localStorage.getItem("app_device_id")) localStorage.setItem("app_device_id", JSON.stringify("e2e-v3-um")); });
const p = await ctx.newPage();
p.on("pageerror", (e) => erros.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/40[149]|423|503|ERR_INTERNET_DISCONNECTED/.test(m.text())) erros.push(m.text()); });
const shot = (n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

// entrar, cadastrar o aparelho e publicar o plano (a tela de senha é a mesma da trava)
await p.request.post(base + "/api/login", { data: { password: senha } }).catch(() => {});
await p.request.put(base + "/api/devices/e2e-v3-um", { data: { name: "Teste", persons: ["rafael"], viewPerson: "rafael" } }).catch(() => {});
await p.goto(base + "/");
await p.waitForURL(/\/v3\//);
ok(true, "a Mesa abre na nova por padrão");
await p.waitForSelector("#bq-pass, .rings, .page", { timeout: 15000 });
if (await p.isVisible("#bq-pass")) { await p.fill("#bq-pass", senha); await p.click("#bq-senha button[type=submit]"); await p.waitForSelector("#bq-pass", { state: "detached" }); }
// já logado: cadastra o aparelho e publica o plano de dentro da página (mesmo cookie do app)
const st = await p.evaluate(async (pl) => {
  const h = { "content-type": "application/json" };
  const d = await fetch("/api/devices/e2e-v3-um", { method: "PUT", headers: h, body: JSON.stringify({ name: "Teste", persons: ["rafael"], viewPerson: "rafael" }) });
  const r = await fetch("/api/plan", { method: "POST", headers: h, body: JSON.stringify({ plano: pl }) });
  return `aparelho ${d.status}, plano ${r.status} ${r.ok ? "" : await r.text()}`;
}, plano);
console.log("início:", st);
await p.evaluate(() => ["app_log_rows", "app_log_pending", "app_log_since"].forEach((k) => localStorage.removeItem(k))); // começa do zero
await p.reload();
await p.waitForSelector(".rings").catch(async (e) => { await shot("v3-00-sem-hoje"); console.log("tela:", (await p.textContent("body")).slice(0, 300)); throw e; });
await pausa(1100);

const feitas = () => p.$$eval(".tl .meal.done", (l) => l.length);
const reg = (kind, k) => p.evaluate(([kind, k]) => { const r = JSON.parse(localStorage.app_log_rows || "{}"); const x = Object.values(r).find((r) => r.kind === kind && r.k === k && !r.deleted); return x ? x.v : null; }, [kind, k]);

// ---------- "comi" e desfazer ----------
const antes = await feitas();
await p.click(".tl [data-act=comi]:not([aria-pressed=true])");
await p.waitForSelector("#toast.on >> text=Marcado");
ok((await feitas()) === antes + 1, "comi marca a refeição");
await p.click("#toast button");
await pausa(300);
ok((await feitas()) === antes, "desfazer desmarca");

// o círculo de cada cartão (não só o "Comi" do cartão da vez) marca
const c0 = await feitas();
await p.click(".tl .meal [data-act=comi][aria-pressed=false]", { timeout: 5000 });
await pausa(200);
ok((await feitas()) === c0 + 1, "o círculo do cartão marca 'comi'");
await p.click("#toast button");
await pausa(200);
ok((await feitas()) === c0, "e o desfazer desmarca");

// ---------- ficha da refeição ----------
// o cartão do "agora" abre a ficha tocando em qualquer parte (nome ou itens), como as outras refeições
if (await p.isVisible(".now .itens")) {
  await p.click(".now .itens");
  await p.waitForSelector("dialog.folha[open]");
  ok(true, "tocar nos itens do cartão 'agora' abre a ficha");
  await p.keyboard.press("Escape");
  await pausa(300);
}
const cafe = await p.getAttribute(".tl [data-act=ficha] >> nth=0", "data-m");
await p.click(".tl [data-act=ficha] >> nth=0");
await p.waitForSelector("dialog.folha >> text=Ingredientes");
await shot("v3-10-ficha");
ok(true, "tocar no cartão abre a ficha");
await p.click("dialog.folha [data-act=item] >> nth=0");
await p.waitForSelector("dialog.folha [data-act=parte-limpar]");
ok((await reg("partial", cafe)) !== null && (await reg("eaten", cafe)) === "1", "desmarcar um ingrediente grava 'só parte' e conta como feita");
await p.click("dialog.folha [data-act=parte-limpar]");
await pausa(200);
ok((await reg("partial", cafe)) === null && (await reg("eaten", cafe)) === null, "desfazer o 'só parte' volta ao estado de antes (nem parte, nem comi)");
// mensagens com a ficha aberta aparecem por cima dela (desmarcar um ingrediente avisa "Comeu parte")
await p.click("dialog.folha [data-act=item] >> nth=0");
await p.waitForSelector("#toast.on");
ok(await p.evaluate(() => { const t = document.getElementById("toast"), r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!el && t.contains(el); }), "aviso aparece por cima da ficha aberta");
// o chip "Opção X de N" leva às opções sem mudar a aba
await p.click("dialog.folha [data-act=ver-opcoes]", { timeout: 5000 });
await pausa(200);
ok((await p.evaluate(() => location.hash)) !== "#opcoes", "chip de opções não troca a rota");
await p.waitForSelector("dialog.folha [data-act=trocar][data-i='1']");
await p.click("dialog.folha [data-act=trocar][data-i='1']");
await pausa(200);
ok((await reg("swap", cafe)) === "1" && (await reg("partial", cafe)) === null, "trocar a opção apaga o 'só parte'");
// comi outra coisa: busca na tabela offline (sem acento, maiúscula ou minúscula)
await p.click("dialog.folha [data-act=outra]");
await p.waitForSelector("dialog.folha [name=busca]");
await p.fill("dialog.folha [name=busca]", "BIG MAC");
await p.click("dialog.folha [data-act=outra-item] >> nth=0");
await p.click("dialog.folha [data-act=outra-mais]"); // ½ em ½: 1 → 1½
await p.click("dialog.folha [data-act=outra-mais]"); // → 2
await shot("v3-50-outra-busca");
await p.click("dialog.folha [data-act=outra-salvar]");
await pausa(300);
let o = JSON.parse((await reg("partial", cafe)) || "{}");
ok(o.outra === "2× Big Mac" && o.outraKcal > 900 && o.outraProt > 40 && o.estimativa === true, "'comi outra coisa' pela busca grava kcal e proteína estimadas (2 Big Mac)");
await p.click("#toast button");
await pausa(300);
ok((await reg("partial", cafe)) === null, "desfazer a outra coisa volta ao que era");
// estimar: tipo × tamanho → média da faixa
await p.click(".tl [data-act=ficha] >> nth=0");
await p.click("dialog.folha [data-act=outra]");
await p.click("dialog.folha [data-act=outra-modo][data-modo=estimar]");
await p.click("dialog.folha [data-act=outra-tipo][data-v=lanche]");
await p.click("dialog.folha [data-act=outra-tam][data-v=exagerei]");
await shot("v3-51-outra-estimar");
await p.click("dialog.folha [data-act=outra-salvar]");
await pausa(300);
o = JSON.parse((await reg("partial", cafe)) || "{}");
ok(o.outraKcal === 1000 && o.estimativa === true && o.faixa?.join("-") === "800-1200", "estimar 'lanche, exagerei' grava a média da faixa (1000 kcal)");
// texto livre: com itens na lista é preciso escolher um (nada de "comeu" com 0 kcal sem querer); busca sem acento
await p.click(".tl [data-act=ficha] >> nth=0");
await p.click("dialog.folha [data-act=outra]");
await p.fill("dialog.folha [name=busca]", "acai");
await p.waitForSelector("dialog.folha [data-act=outra-item] >> text=Açaí");
ok(await p.isDisabled("dialog.folha [data-act=outra-salvar]"), "busca sem acento acha o açaí, e Registrar espera escolher um item");
await p.fill("dialog.folha [name=busca]", "x-burguer da esquina");
await p.click("dialog.folha [data-act=outra-modo][data-modo=estimar]");
await p.click("dialog.folha [data-act=outra-tipo][data-v=lanche]");
await p.click("dialog.folha [data-act=outra-tam][data-v=normal]");
await p.click("dialog.folha [data-act=outra-salvar]");
await pausa(300);
o = JSON.parse((await reg("partial", cafe)) || "{}");
ok(/x-burguer da esquina/.test(o.outra) && o.outraKcal === 600, "estimar guarda o nome digitado junto da estimativa");
await pausa(300);
ok(await p.isVisible(`.tl .meal [data-m="${cafe}"] >> text=outra coisa`), "o cartão mostra 'outra coisa'");

// ---------- segurar, gestos, dia futuro, preparo ----------
const n0 = await feitas();
// o aviso da ação anterior fica 5 s embaixo; dependendo da hora do dia o cartão cai sob ele e o toque pega o aviso
await p.waitForSelector("#toast.on", { state: "hidden", timeout: 8000 }).catch(() => {});
const alvo = await p.$(".tl .meal:not(.done) .corpo");
await alvo.scrollIntoViewIfNeeded();
await p.evaluate((el) => el.scrollIntoView({ block: "center" }), alvo);
const bx = await alvo.boundingBox();
await p.mouse.move(bx.x + 30, bx.y + 15);
await p.mouse.down();
await pausa(700);
await p.mouse.up();
await p.waitForSelector("dialog.folha [data-act=comi-ficha]");
ok((await feitas()) === n0 && (await p.isVisible("dialog.folha >> text=Só parte")), "segurar abre as ações sem marcar 'comi'");
await shot("v3-11-acoes");
await p.keyboard.press("Escape");
await pausa(300);
const cdp = await ctx.newCDPSession(p);
// no toque, segurar não gera clique depois; o próximo toque (o "Comi" das ações) tem que valer
const b2 = await (await p.$(".tl .meal:not(.done) .corpo")).boundingBox();
await p.dispatchEvent(".tl .meal:not(.done) .corpo >> nth=0", "pointerdown", { clientX: b2.x + 30, clientY: b2.y + 15 });
await pausa(700);
await p.dispatchEvent(".tl .meal:not(.done) .corpo >> nth=0", "pointerup", { clientX: b2.x + 30, clientY: b2.y + 15 });
await p.waitForSelector("dialog.folha [data-act=comi-ficha]");
await p.click("dialog.folha [data-act=comi-ficha]");
await pausa(300);
ok((await feitas()) === n0 + 1, "depois de segurar, o toque em 'Comi' das ações vale");
await p.click("#toast button");
await pausa(300);
const arrastar = async (x0, y0, x1, y1) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 6, y: y0 + ((y1 - y0) * i) / 6 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const dia = () => p.getAttribute(".days [aria-current=date]", "data-d");
ok((await dia()) === hoje, "abre em hoje");
await arrastar(330, 600, 120, 610);
await pausa(400);
ok((await dia()) === amanha, "deslizar para a esquerda vai ao dia seguinte");
ok((await p.isVisible("text=Planejado")) && !(await p.isVisible(".bottle")) && !(await p.isVisible(".now")), "dia futuro: planejado, sem garrafa nem cartão da vez");
await shot("v3-12-amanha");
await arrastar(120, 600, 330, 605);
await pausa(400);
ok((await dia()) === hoje, "deslizar para a direita volta");
if (await p.isVisible("[data-act=preparo]")) {
  await p.click("[data-act=preparo]");
  await p.waitForSelector("dialog.folha >> text=Preparo de hoje");
  await p.click("dialog.folha [data-act=cozinha]");
  await p.waitForSelector(".cozinha");
  ok(true, "preparo abre o modo cozinha");
  await p.click(".cozinha [data-k=fechar]");
}

// ---------- tela infantil do Theo ----------
await p.click(".who [data-p=theo]");
await pausa(600);
ok(await p.evaluate(() => document.body.classList.contains("crianca")), "Theo: a pele infantil entra sozinha");
ok((await p.isVisible(".hi .urso")) && (await p.isVisible("text=Alergia a ovo")), "Theo: Ursinho no topo e a alergia à vista");
ok(!/\bkcal\b/.test(await p.textContent("#app")), "Theo: nenhuma caloria na tela");
await shot("v3-20-theo");
const refD = await p.getAttribute(".tl [data-act=aceite][data-v=pouco] >> nth=0", "data-m");
await p.click(".tl [data-act=aceite][data-v=pouco] >> nth=0");
await pausa(300);
ok((await reg("aceite", refD)) === "pouco" && (await reg("eaten", refD)) === "1", "Theo: 'comeu pouco' grava");
ok(await p.isVisible(`.tl [data-act=aceite][data-v=pouco][data-m="${refD}"][aria-pressed=true]`), "Theo: a carinha escolhida fica marcada");
await p.click(`.tl [data-act=aceite][data-v=pouco][data-m="${refD}"]`);
await pausa(300);
ok((await reg("eaten", refD)) === null, "Theo: tocar de novo desmarca");
await p.waitForSelector("#toast.on", { state: "hidden", timeout: 8000 }).catch(() => {});
await p.evaluate(() => document.querySelector(".tl .corpo").scrollIntoView({ block: "center" }));
const bd = await (await p.$(".tl .corpo")).boundingBox();
await p.mouse.move(bd.x + 20, bd.y + 10);
await p.mouse.down();
await pausa(700);
await p.mouse.up();
await p.waitForSelector("dialog.folha [data-act=comi-ficha]");
ok(!(await p.isVisible("dialog.folha >> text=Outra coisa")), "Theo: segurar não oferece 'Outra coisa' (que mostra calorias)");
await p.keyboard.press("Escape");
await pausa(300);
await p.setViewportSize({ width: 280, height: 640 });
await p.evaluate(() => { document.documentElement.style.fontSize = "130%"; });
await pausa(400);
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Theo, fonte grande: cabe na largura");
await p.screenshot({ path: `${SHOTS}/v3-21-theo-fonte.png`, fullPage: true });
await p.evaluate(() => { document.documentElement.style.fontSize = ""; });
await p.setViewportSize({ width: 412, height: 915 });
await p.click(".who [data-p=rafael]");
await pausa(400);
ok(!(await p.evaluate(() => document.body.classList.contains("crianca"))), "voltar ao Rafael volta à pele escura");

// ---------- água: ajustes por pessoa e sequência de dias na meta ----------
await p.evaluate(() => { location.hash = "ajustes"; });
await p.click("[data-act=aj-sec][data-s=agua]");
await p.waitForSelector("[data-agua] [name=acorda]");
ok((await p.inputValue("[data-agua] [name=acorda]")) === "07:00" && (await p.inputValue("[data-agua] [name=dorme]")) === "22:00", "Ajustes da água abrem com 07:00–22:00");
await p.fill("[data-agua] [name=acorda]", "06:30");
await p.dispatchEvent("[data-agua] [name=acorda]", "change");
await pausa(400);
ok((await p.evaluate(() => fetch("/api/agua-cfg/rafael").then((r) => r.json()))).acorda === "06:30", "mudar o horário de acordar grava no servidor");
await shot("v3-40-ajustes-agua");
const diaAntes = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: tz });
await p.evaluate((ops) => fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) }),
  [1, 2, 3].map((n) => ({ kind: "water", day: diaAntes(n), person: "rafael", k: "", v: "4000" })));
await p.evaluate(() => { location.hash = "hoje"; });
await p.reload();
await p.waitForSelector(".bottle");
await pausa(500);
ok(/3 dias seguidos/.test(await p.textContent(".hoje-agua")), "a água mostra a sequência de 3 dias na meta");
await shot("v3-41-sequencia");

// ---------- sintomas e tratamento (Fase 5) ----------
const regsDe = (kind) => p.evaluate((kind) => Object.values(JSON.parse(localStorage.app_log_rows || "{}")).filter((r) => r.kind === kind && !r.deleted), kind);
await p.click("[data-act=mais]");
await p.click("dialog.folha [data-act=mais-sintoma]");
await p.click("dialog.folha [data-act=sint-tipo][data-v=gases]");
await p.click("dialog.folha [data-act=sint-int][data-v=media]");
await shot("v3-60-sintoma");
await p.click("dialog.folha [data-act=sint-salvar]");
await pausa(400);
const sint = (await regsDe("symptom")).map((r) => JSON.parse(r.v));
ok(sint.some((s) => s.tipo === "gases" && s.intensidade === "media" && s.nivel === "moderado"), "o + anota um sintoma (e mantém o nível para a Mesa antiga)");
ok(await p.isVisible(".tl .nota >> text=Gases"), "o sintoma aparece na linha do tempo");
await p.click("[data-act=mais]");
await p.click("dialog.folha [data-act=mais-alerta]");
await p.click("dialog.folha [data-act=sint-tipo][data-v=febre]");
await p.click("dialog.folha [data-act=sint-salvar]");
await p.waitForSelector("#toast.on");
ok(/Sinal de alerta: procure um médico/.test(await p.textContent("#toast")), "o aviso do alerta não sugere esperar");
await pausa(300);
ok(await p.isVisible("text=procure um médico"), "sinal de alerta mostra 'procure um médico'");
ok(!/Febre \(forte\)/.test(await p.textContent("#app")), "sinal de alerta sem intensidade inventada");
// cadastro do tratamento nos Ajustes → cartão e dose na Hoje
await p.evaluate(() => { location.hash = "ajustes"; });
await p.click("[data-act=aj-sec][data-s=tratamento]");
await p.click("[data-act=trat-novo]");
await p.fill("[data-trat] [name=nome]", "Berberina + alicina");
await p.fill("[data-trat] [name=dose0]", "Berberina");
await p.selectOption("[data-trat] [name=quando0]", "cafe");
await p.fill("[data-trat] [name=dose1]", "Alicina");
await p.selectOption("[data-trat] [name=quando1]", "horario");
await p.fill("[data-trat] [name=hora1]", "07:30");
await shot("v3-61-tratamento-ajustes");
await p.click("[data-act=trat-salvar]");
await pausa(500);
const trat1 = await p.evaluate(() => fetch("/api/tratamento/rafael").then((r) => r.json()));
ok(trat1.nome === "Berberina + alicina" && trat1.doses.length === 2 && trat1.doses.every((d) => !/^d\d$/.test(d.id)), "tratamento cadastrado no servidor, com ids próprios por dose");
await p.click("[data-act=trat-editar]");
ok((await p.inputValue("[data-trat] [name=quando1]")) === "horario" && (await p.inputValue("[data-trat] [name=hora1]")) === "07:30", "editar mantém a dose com horário");
await p.click("[data-act=trat-salvar]");
await pausa(400);
ok(JSON.stringify((await p.evaluate(() => fetch("/api/tratamento/rafael").then((r) => r.json()))).doses) === JSON.stringify(trat1.doses), "salvar sem mudar nada mantém os ids das doses");
await p.evaluate(() => { location.hash = "hoje"; });
await p.waitForSelector("text=Tratamento · dia 1 de 28");
await p.waitForSelector(".tl .dose >> text=Berberina");
ok(await p.isVisible(".tl .dose >> text=07:30"), "dose com horário aparece com o horário");
await shot("v3-62-tratamento-hoje");
await p.click(".tl .dose [data-act=dose]");
await pausa(300);
ok((await regsDe("dose")).some((r) => r.v === "1"), "'Tomei' grava a dose");
await p.click("[data-act=mais]");
await p.click("dialog.folha [data-act=mais-efeito]");
await p.fill("dialog.folha [name=efeito]", "enjoo leve");
await p.click("dialog.folha [data-act=efeito-salvar]");
await pausa(300);
ok((await regsDe("sideeffect")).some((r) => JSON.parse(r.v).texto === "enjoo leve"), "efeito colateral anotado pelo +");
// fim do tratamento: "Parar no fim" e depois "Estender" volta a valer
const diasAtras = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: tz });
await p.evaluate(async (inicio) => { const t = await fetch("/api/tratamento/rafael").then((r) => r.json()); await fetch("/api/tratamento/rafael", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...t, inicio }) }); }, diasAtras(26));
await p.reload();
await p.waitForSelector("[data-act=trat-parar]");
await p.click("[data-act=trat-parar]");
await pausa(400);
await p.click("[data-act=trat-estender]");
await pausa(400);
const trat2 = await p.evaluate(() => fetch("/api/tratamento/rafael").then((r) => r.json()));
ok(trat2.fim == null && trat2.dias === 42, "estender depois de 'parar no fim' desfaz o fim e soma 2 semanas");
// o + só aparece no dia de hoje (anotar no dia certo)
await p.click(`.days [data-d="${amanha}"]`);
await pausa(300);
ok(!(await p.isVisible(".fab")), "o + não aparece em outro dia");
await p.click(`.days [data-d="${hoje}"]`);

// ---------- Diário + Claude (Fase 6) ----------
await p.evaluate(() => { location.hash = "diario"; });
await p.waitForSelector("[data-act=fechar-dia]");
await p.click("[data-act=fechar-dia]");
await p.click("dialog.folha [data-act=dia-humor][data-v=bem]");
await p.click("dialog.folha [data-act=dia-energia][data-v='4']");
await p.click("dialog.folha [data-act=dia-bristol][data-v='4']");
await p.click("dialog.folha [data-act=dia-sint][data-s=gases][data-v='2']");
await shot("v3-70-fechar-dia");
await p.click("dialog.folha [data-act=dia-salvar]");
await pausa(400);
const fech = JSON.parse((await regsDe("day"))[0]?.v || "{}");
ok(fech.humor === "bem" && fech.energia === 4 && fech.bristol === 4 && fech.sintomas?.gases === 2, "fechar o dia grava humor, energia, Bristol e a nota dos sintomas");
ok(await p.isVisible(".diario-dia >> text=😊"), "o dia fechado aparece no Diário");
const ontem = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: tz });
await p.click(`[data-act=fechar-dia][data-d="${ontem}"]`);
await p.click("dialog.folha [data-act=dia-humor][data-v=mal]");
await p.click("dialog.folha [data-act=dia-salvar]");
await pausa(400);
ok((await regsDe("day")).some((r) => r.day === ontem && JSON.parse(r.v).humor === "mal"), "dá para fechar o dia anterior pelo Diário");
await p.click("[data-act=fechar-semana]");
await p.waitForSelector("dialog.folha >> text=adesão");
await p.fill("dialog.folha [name=semana]", "Semana boa, menos gases");
await p.click("dialog.folha [data-act=semana-salvar]");
await p.waitForSelector("dialog.folha a[href^='https://claude.ai/new?q=']");
ok(true, "fechar a semana grava e oferece pedir a análise ao Claude");
const sem = (await regsDe("week"))[0];
const domingo = (() => { const d = new Date(hoje + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7)); return d.toISOString().slice(0, 10); })();
ok(JSON.parse(sem?.v || "{}").texto === "Semana boa, menos gases" && (sem.day === domingo || sem.day < hoje), "a semana fica gravada no domingo que a termina");
await p.keyboard.press("Escape");
await pausa(300);
ok(await p.isVisible(".sint-grafico"), "gráfico de sintomas por semana no Diário");
await shot("v3-71-diario");
// análise do Claude: pelo conector (CI) ou semeada na API falsa (local)
await p.evaluate(async () => {
  const m = await fetch("/api/mcp").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const a = { pessoa: "rafael", titulo: "Semana de teste", texto: "Água melhorou e os gases caíram." };
  if (m?.url) await fetch(new URL(m.url).pathname, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "gravar_analise", arguments: { ...a, so_validar: false } } }) });
  else await fetch("/__fake/analise", { method: "POST", body: JSON.stringify(a) });
});
await p.evaluate(() => { location.hash = "hoje"; });
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); // voltou para o app: busca as análises de novo (sem recarregar)
await p.waitForSelector("[data-act=ler-analise]", { timeout: 8000 });
ok(await p.isVisible("text=Semana de teste"), "análise não lida aparece como cartão na Hoje");
await p.click("[data-act=ler-analise]");
await p.waitForSelector("dialog.folha >> text=os gases caíram");
await p.keyboard.press("Escape");
await pausa(400);
ok(!(await p.isVisible("[data-act=ler-analise]")), "depois de lida, o cartão sai da Hoje");
// sem conector: colar a resposta
await p.evaluate(() => { location.hash = "diario"; });
await p.click("[data-act=colar-analise]");
await p.fill("dialog.folha [name=resposta]", "Resposta colada do Claude");
await p.click("dialog.folha [data-act=colar-salvar]");
await pausa(400);
ok(await p.isVisible(".diario >> text=Resposta colada do Claude"), "a resposta colada vira uma análise no Diário");
// o que era da aba Saúde agora fica no Diário: peso, testes de reintrodução, sintomas anotados
await p.click("[data-act=peso]");
await p.fill("dialog.folha [name=kg]", "82,4");
await p.click("dialog.folha [data-act=peso-salvar]");
await pausa(300);
ok((await regsDe("weight")).some((r) => r.v === "82.4"), "registrar peso pelo Diário");
ok(await p.isVisible(".diario >> text=82,4"), "o peso aparece no Diário");
ok(await p.isVisible(".diario >> text=Testes de reintrodução"), "os testes de reintrodução estão no Diário");
const nSint = (await regsDe("symptom")).length;
await p.click(".diario [data-act=sintoma-del] >> nth=0");
await pausa(300);
ok((await regsDe("symptom")).length === nSint - 1, "apagar um sintoma anotado");
await p.click("#toast button");
await pausa(300);
ok((await regsDe("symptom")).length === nSint, "e desfazer traz de volta");
await p.evaluate(() => { location.hash = "hoje"; });

// ---------- Plano e Compras (Fase 7) ----------
await p.evaluate(() => { location.hash = "plano"; });
await p.waitForSelector(".grade");
ok((await p.$$(".grade .bola")).length > 0, "o Plano mostra a semana em grade com as bolinhas das refeições");
await shot("v3-80-plano");
await p.fill("[name=busca-plano]", "frango");
await p.waitForSelector("[data-act=busca-ir]");
ok((await p.$$("[data-act=busca-ir]")).length > 0, "a busca acha em que dias tem frango");
await p.fill("[name=busca-plano]", "");
{
  await p.waitForSelector("[data-act=lote]");
  await p.click("[data-act=lote] >> nth=0");
  await p.waitForSelector("dialog.folha >> text=Quanto fazer");
  ok(true, "Cozinha da semana mostra quanto fazer no lote");
  await p.keyboard.press("Escape");
  await pausa(300);
}
await p.click(`.grade [data-act=plano-dia][data-d="${amanha}"]`);
await pausa(300);
ok((await p.evaluate(() => location.hash)) === "#hoje" && (await p.getAttribute(".days [aria-current=date]", "data-d")) === amanha, "tocar num dia da grade abre a Hoje nesse dia");
await p.click(`.days [data-d="${hoje}"]`);
await p.evaluate(() => { location.hash = "plano"; });
await p.click("[data-act=fechar-mes]");
await p.waitForSelector("dialog.folha a[href^='https://claude.ai/new?q=']");
ok(await p.isVisible("dialog.folha >> text=adesão"), "fechamento do mês mostra o resumo e o pedido do próximo plano");
await p.keyboard.press("Escape");
await pausa(300);
await p.evaluate(() => { window.print = () => {}; });
await p.click("[data-act=imprimir]");
ok(await p.evaluate(() => !!document.getElementById("impressao")?.textContent.includes("Compras")), "imprimir monta o cardápio e as compras da semana");
await p.emulateMedia({ media: "print" });
ok(await p.isVisible("#impressao") && !(await p.isVisible(".nav")), "na impressão aparece só o cardápio (não a página em branco)");
await p.emulateMedia({ media: "screen" });
await p.evaluate(() => { const el = document.getElementById("impressao"); if (el) el.parentNode.removeChild(el); });
await p.evaluate(() => { location.hash = "compras"; });
await p.waitForSelector(".compras [data-act=pegar]");
await shot("v3-81-compras");
const k1 = await p.getAttribute(".compras [data-act=pegar] >> nth=0", "data-k");
await p.click(".compras [data-act=pegar] >> nth=0");
await pausa(200);
ok((await regsDe("shop")).some((r) => r.k === k1 && r.v === "1"), "tocar no item põe no carrinho (mesmo registro da antiga)");
const k2 = await p.getAttribute(".compras [data-act=casa] >> nth=0", "data-k");
await p.click(".compras [data-act=casa] >> nth=0");
await pausa(200);
ok((await regsDe("shop")).some((r) => r.k === k2 && r.v === "casa") && (await p.isVisible("text=Já tem em casa")), "'já tenho em casa' tira o item da conta");
await p.fill(".compras [name=extra]", "Papel-toalha");
await p.press(".compras [name=extra]", "Enter"); // o Enter do teclado do celular adiciona
await pausa(200);
ok(await p.isVisible(".compras >> text=Papel-toalha"), "dá para adicionar um item extra");
ok(await p.isVisible(".compras [data-act=cmp-trocas]"), "a lista tem a opção de seguir as trocas");
await p.click('.compras [data-act=cmp-semana][data-n^="m:"] >> nth=0');
await pausa(200);
const mesNome = await p.getAttribute('.compras [data-act=cmp-semana][data-n^="m:"] >> nth=0', "aria-label");
ok((await p.getAttribute('.compras [data-act=cmp-semana][data-n^="m:"] >> nth=0', "aria-pressed")) === "true" && (await p.isVisible(`.compras >> text=${mesNome} ·`)), "Compras: dá para ver a lista do mês");
await p.evaluate(() => { location.hash = "hoje"; });

// ---------- computador: Hoje em duas colunas, nada vaza para os lados ----------
await p.setViewportSize({ width: 1440, height: 900 });
await p.evaluate(() => { location.hash = "hoje"; });
await pausa(500);
const lado = await p.evaluate(() => { const a = document.querySelector(".hoje-pc .col-a").getBoundingClientRect(), b = document.querySelector(".hoje-pc .col-b").getBoundingClientRect(); return b.left > a.right - 1 && Math.abs(a.top - b.top) < 60; });
ok(lado, "computador: painel e linha do tempo lado a lado");
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "computador: nada vaza para os lados");
await p.screenshot({ path: `${SHOTS}/v3-90-computador.png` });
await p.setViewportSize({ width: 412, height: 915 });
await pausa(300);

// ---------- novidades da nova Mesa: só para quem ligou, uma vez por versão ----------
await p.evaluate(() => localStorage.setItem("app_versao_vista", JSON.stringify("3.0.0-beta.1")));
await p.reload();
await p.waitForSelector("dialog.folha >> text=Novidades");
ok(await p.isVisible("dialog.folha >> text=Ursinho"), "novidades da v3 aparecem ao abrir uma versão nova");
await shot("v3-30-novidades");
await p.keyboard.press("Escape");
await p.reload();
await p.waitForSelector(".tl");
await pausa(500);
ok(!(await p.isVisible("dialog.folha")), "e não reaparecem depois de vistas");

// ---------- etapas das tarefas seguintes entram aqui ----------

// ---------- Ajustes completos (Fase 8) — o que era da Mesa antiga ----------
const real = (await p.evaluate(() => fetch("/api/vapid").then((r) => r.status))) === 200; // falso = API de teste local (sem Worker)
await p.evaluate(() => { location.hash = "ajustes"; });
await p.click("[data-act=aj-menu]").catch(() => {});
await p.waitForSelector("[data-act=aj-sec][data-s=avisos]");
await shot("v3-95-ajustes");
ok(await p.evaluate(() => { const b = document.querySelector(".perfil"), av = b?.querySelector(".av"); return !!av && getComputedStyle(b).display === "flex" && av.getBoundingClientRect().width >= 40; }), "Ajustes: o cartão deste celular tem avatar e fica em linha");
await p.click("[data-act=aj-sec][data-s=celular]");
await p.click("[data-act=aj-pessoa][data-p=marina]");
await pausa(800);
ok((await p.evaluate(() => JSON.parse(localStorage.app_cfg || "{}").persons || [])).includes("marina"), "Este celular: escolher de quem são os avisos");
await p.click("[data-act=aj-menu]");
await p.click("[data-act=aj-sec][data-s=lembretes]");
await p.fill("[data-form=lembrete] [name=texto]", "Tomar creatina");
await p.click("[data-form=lembrete] button[type=submit]");
await pausa(300);
ok((await p.evaluate(() => JSON.parse(localStorage.app_cfg || "{}").reminders || [])).some((r) => r.text === "Tomar creatina" && r.days.length === 7), "lembrete novo");
await p.click("[data-act=aj-menu]");
await p.click("[data-act=aj-sec][data-s=avisos]");
await p.waitForSelector("text=Próximos avisos");
ok(true, "notificações: página com os próximos avisos");
await p.click("[data-act=aj-menu]");
if (real) {
  await p.click("[data-act=aj-sec][data-s=claude]");
  await p.click("[data-act=aj-mcp]");
  await p.waitForSelector(".endereco");
  ok(/\/mcp\//.test(await p.textContent(".endereco")), "Claude: mostra o endereço do conector");
  await p.click("[data-act=aj-menu]");
  // digital (autenticador virtual) e a trava depois de horas sem uso
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true } });
  await p.click("[data-act=aj-sec][data-s=seguranca]");
  await p.waitForSelector("[data-act=aj-digital-ativar]");
  await p.click("[data-act=aj-digital-ativar]");
  await p.waitForSelector("[data-act=aj-digital-remover]");
  ok(true, "digital cadastrada (autenticador virtual)");
  const travar = async () => { await ctx.clearCookies({ name: "pf_sess" }); await p.evaluate(() => localStorage.setItem("app_ativo", "0")); await p.reload(); };
  const passkey = await p.evaluate(() => localStorage.getItem("app_passkey"));
  await p.evaluate(() => localStorage.removeItem("app_passkey"));
  await travar();
  await p.waitForSelector("#bq-pass");
  ok((await p.evaluate(() => fetch("/api/meta").then((x) => x.status))) === 423, "trava: o servidor recusa os dados enquanto está bloqueado");
  await p.fill("#bq-pass", senha);
  await p.click("#bq-senha button[type=submit]");
  await p.waitForSelector(".nav", { timeout: 15000 });
  ok(true, "trava: a senha destrava");
  await p.evaluate((v) => localStorage.setItem("app_passkey", v), passkey);
  // trava garantida: o "último uso" zera antes dos scripts do app (a página aberta podia renová-lo antes do reload)
  await p.addInitScript(() => { if (sessionStorage.getItem("e2e_travar")) { sessionStorage.removeItem("e2e_travar"); localStorage.setItem("app_ativo", "0"); } });
  await p.evaluate(() => sessionStorage.setItem("e2e_travar", "1"));
  await travar();
  await p.waitForSelector("#bq-digital");
  await shot("v3-90-entrada");
  ok(await p.isHidden("#bq-senha"), "entrada: com digital, a senha fica guardada atrás de 'Usar a senha'");
  await p.click("#bq-digital"); // a digital só é pedida no toque
  await p.waitForSelector(".nav", { timeout: 15000 });
  ok((await p.evaluate(() => fetch("/api/meta").then((x) => x.status))) === 200, "trava: a digital destrava de verdade");
}
await p.evaluate(() => { location.hash = "hoje"; });

// ---------- dois celulares: o que um marca o outro vê ----------
const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, timezoneId: tz, locale: "pt-BR" });
await ctx2.addInitScript(() => { if (!localStorage.getItem("app_device_id")) localStorage.setItem("app_device_id", JSON.stringify("e2e-v3-b")); });
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => erros.push("celular 2: " + e.message));
await p2.request.post(base + "/api/login", { data: { password: senha } }).catch(() => {});
await p2.request.put(base + "/api/devices/e2e-v3-b", { data: { name: "Celular 2", persons: ["rafael"], viewPerson: "rafael" } }).catch(() => {});
await p.evaluate(() => { location.hash = "hoje"; });
await p.reload();
await p.waitForSelector(".tl");
await pausa(1500); // a fila sobe
const feitas1 = await feitas();
await p2.goto(base + "/v3/");
await p2.waitForSelector(".tl", { timeout: 15000 });
await pausa(1500);
ok((await p2.$$eval(".tl .meal.done", (l) => l.length)) === feitas1, `o segundo celular vê as mesmas refeições marcadas (${feitas1})`);
await ctx2.close();

// ---------- subir plano pelo app (arquivo) ----------
await p.evaluate(() => { location.hash = "ajustes"; });
await p.click("[data-act=aj-menu]").catch(() => {});
await p.click("[data-act=aj-sec][data-s=plano]");
await p.click("[data-act=atualizar]");
const arquivoPlano = `${SHOTS}/plano-v3.json`;
writeFileSync(arquivoPlano, JSON.stringify(plano));
const [escolha] = await Promise.all([p.waitForEvent("filechooser"), p.click("dialog.folha [data-act=up-arquivo]")]);
await escolha.setFiles(arquivoPlano);
await p.waitForSelector("dialog.folha [data-act=up-publicar]");
await shot("v3-96-previa-plano");
await p.click("dialog.folha [data-act=up-publicar]");
await p.waitForSelector("#toast.on >> text=ublicado");
ok(true, "subir o plano pelo app: prévia e publicar");

console.log("erros na página:", erros.length ? erros : "nenhum");
await browser.close();
if (erros.length) process.exit(1);
