// Ponta a ponta das novidades da Mesa: opções de refeição, feedback, compras, conector do Claude,
// bloqueio/digital (com autenticador virtual do Chromium) e o layout no computador.
// Uso (estado zerado): npm run dev   e em outro terminal:   SHOTS=pasta node test/e2e.mesa.mjs [http://localhost:8787] [senha]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const [, , base = "http://localhost:8787", senha = "teste-local-123"] = process.argv;
const SHOTS = process.env.SHOTS || ".";
const erros = [];
const ok = (cond, msg) => { if (!cond) throw new Error("FALHOU: " + msg); console.log("✓", msg); };

// plano de exemplo com as datas trazidas para hoje/amanhã
const tz = "America/Sao_Paulo";
const hoje = new Date().toLocaleDateString("en-CA", { timeZone: tz });
const amanha = new Date(Date.now() + 864e5).toLocaleDateString("en-CA", { timeZone: tz });
const plano = JSON.parse(readFileSync(new URL("../docs/exemplo-plano.json", import.meta.url), "utf8"));
Object.assign(plano, { inicio: hoje, fim: amanha });
plano.dias[0].data = hoje;
plano.dias[1].data = amanha;
plano.testes[0].doses[0].data = amanha;
const arquivo = `${SHOTS}/plano-teste.json`;
writeFileSync(arquivo, JSON.stringify(plano));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: tz, locale: "pt-BR" });
const p = await ctx.newPage();
p.on("pageerror", (e) => erros.push(e.message));
p.on("console", (m) => { if (m.type() === "error" && !/40[149]|423|ERR_INTERNET_DISCONNECTED/.test(m.text())) erros.push(m.text()); });
const cdp = await ctx.newCDPSession(p);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const shot = (n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
const pausa = (ms = 400) => p.waitForTimeout(ms);

// entrar e publicar o plano
await p.goto(base);
await p.fill("#senha", senha);
await p.click("#login button[type=submit]");
await p.waitForSelector("#ajustes-sb");
await p.click("[data-act=aj-pessoa][data-p=rafael]");
await pausa();
await p.click("[data-act=close-sheet]");
await p.click("[data-act=atualizar]");
const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("[data-act=up-arquivo]")]);
await fc.setFiles(arquivo);
await p.click("[data-act=up-publicar]");
await p.waitForSelector(".timeline");
await pausa(700);

// 1. opções de refeição
await p.click(".meal .body >> nth=0");
await p.waitForSelector("#opcoes");
ok((await p.$$("[data-act=trocar]")).length === 2, "ficha mostra 2 opções no café");
await p.click("[data-act=ver-opcoes]");
await p.click("[data-act=trocar][data-i='1']");
await pausa();
ok((await p.textContent(".sheet .h1")).includes("morango"), "trocar a opção muda o prato na ficha");
await shot("n1-opcoes");
await p.click("[data-act=close-sheet]");
await pausa();
ok((await p.textContent(".meal .body >> nth=0")).includes("opção 2"), "cartão do dia mostra a opção escolhida");
await shot("n2-hoje");

// 1b. comer só parte: desmarca o arroz do almoço; depois "outra coisa" no lanche
await p.click(".meal .body >> nth=1");
await p.waitForSelector(".sheet [data-act=item]");
await p.click(".sheet [data-act=item][data-n='1']"); // arroz
await pausa();
ok((await p.textContent(".sheet")).includes("Comeu parte"), "desmarcar um ingrediente mostra 'Comeu parte'");
await shot("n2b-parte");
await p.click("[data-act=close-sheet]");
await pausa();
ok((await p.textContent(".meal .body >> nth=1")).includes("comeu parte"), "cartão mostra 'comeu parte' e conta como feita");
await p.click(".meal .body >> nth=2");
await p.waitForSelector("form[data-form=outra]");
await p.fill("form[data-form=outra] input[name=texto]", "Pizza, 2 fatias");
await p.fill("form[data-form=outra] input[name=kcal]", "560");
await p.click("form[data-form=outra] button[type=submit]");
await pausa();
ok((await p.textContent(".sheet")).includes("Pizza"), "outra coisa entra no lugar da refeição");
await p.click("[data-act=close-sheet]");
await pausa();

// 1c. Desfazer no "Comi", água, busca, fila sem internet e deslizar entre dias (2.3.0)
const ultima = (await p.$$(".meal")).length - 1;
await p.click(`.meal .check >> nth=${ultima}`);
await p.waitForSelector("#toast.act.on");
ok((await p.textContent("#toast")).includes("Desfazer"), "marcar 'comi' mostra Desfazer");
await shot("n2c-desfazer");
await p.click("#toast button");
await pausa();
ok(!(await p.$eval(`.meal >> nth=${ultima}`, (e) => e.classList.contains("done"))), "Desfazer desmarca a refeição");
await p.click("[data-act=agua][data-v='250']");
await p.click("[data-act=agua][data-v='250']");
await pausa();
ok((await p.textContent(".agua")).includes("0,5 /"), "dois copos de água = 0,5 L");
await p.click("[data-act=busca]");
await p.fill("#busca-q", "arroz");
await p.waitForSelector("[data-act=busca-ir]");
await shot("n2d-busca");
await p.click("[data-act=busca-ir] >> nth=0");
await p.waitForSelector(".sheet [data-act=item]");
ok((await p.textContent(".sheet")).toLowerCase().includes("arroz"), "resultado da busca abre a refeição");
await p.click("[data-act=close-sheet]");
await pausa();
await ctx.setOffline(true);
await p.click(`.meal .check >> nth=${ultima}`);
await p.waitForSelector(".fila", { timeout: 5000 });
ok((await p.textContent(".fila")).includes("esperando internet"), "sem internet aparece o aviso da fila");
await shot("n2e-fila");
await ctx.setOffline(false);
await p.evaluate(() => dispatchEvent(new Event("online")));
await p.waitForSelector(".fila", { state: "detached", timeout: 10000 });
ok(true, "com internet a fila sobe e o aviso some");
await p.click(`.meal .check >> nth=${ultima}`); // volta como estava
await pausa();
const dia0 = await p.textContent(".day.on .dn");
const arrastar = async (x0, y0, x1, y1) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 6, y: y0 + ((y1 - y0) * i) / 6 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
await arrastar(330, 600, 120, 610);
await pausa();
ok((await p.textContent(".day.on .dn")) !== dia0, "deslizar para a esquerda vai ao dia seguinte");
await arrastar(120, 600, 330, 605);
await pausa();
ok((await p.textContent(".day.on .dn")) === dia0, "deslizar para a direita volta");

// 1d. visão do Theo (2.4.0): comeu bem / pouco / recusou, sem calorias, alergia à vista
await p.click("[data-act=pessoa][data-p=theo]");
await pausa();
ok((await p.textContent(".hero")).includes("Como Theo comeu"), "Theo: o resumo mostra como comeu, sem calorias");
await p.click(".meal .body >> nth=0");
await p.waitForSelector("[data-act=aceite]");
await p.click("[data-act=aceite][data-v=pouco]");
await pausa();
await shot("n2f-theo");
await p.click("[data-act=close-sheet]");
await pausa();
ok((await p.textContent(".meal .body >> nth=0")).includes("comeu pouco"), "Theo: 'comeu pouco' aparece no cartão");
await p.click("[data-act=tab][data-tab=semana]");
await p.waitForSelector(".painel");
ok((await p.textContent(".painel")).includes("Pouco"), "painel do plano do Theo conta a aceitação");
await p.click("[data-act=pessoa][data-p=rafael]");
await pausa();
ok((await p.textContent(".painel")).includes("Kcal por dia"), "painel do plano do Rafael mostra kcal contra a meta");
await shot("n2g-painel");
await p.click("[data-act=tab][data-tab=hoje]");
await pausa();

// 2. compras: "Tudo" primeiro e compacto
await p.click("[data-act=tab][data-tab=compras]");
await pausa();
ok((await p.textContent(".segs button >> nth=0")).trim() === "Tudo", "Compras começa por Tudo");
await shot("n3-compras");
// 2b. despensa e trocas na lista (2.5.0)
const linhas = async () => (await p.$$(".shop:not(.casa) .row")).length;
const antesCasa = await linhas();
await p.click("[data-act=casa] >> nth=0");
await pausa();
ok((await linhas()) === antesCasa - 1 && (await p.isVisible("text=Já tem em casa")), "'já tenho em casa' tira o item da lista");
await shot("n3b-despensa");
await p.click(".shop.casa [data-act=casa]");
await pausa();
ok((await linhas()) === antesCasa, "'Comprar' devolve o item para a lista");
ok((await p.textContent(".page")).includes("Seguir as trocas"), "lista tem a opção de seguir as trocas");
// trocamos o café do Rafael para a opção 2 (morango) no começo: com a opção ligada, o morango entra na lista
ok((await p.textContent(".page")).toLowerCase().includes("morango"), "trocas de opção entram na lista");

// 2c. preparo em lote somado, temporizador e imprimir
await p.click("[data-act=tab][data-tab=semana]");
await p.click("[data-act=lote] >> nth=0");
await p.waitForSelector(".lote-qtd");
ok((await p.textContent(".lote-qtd")).includes("Arroz"), "preparo em lote mostra quanto arroz fazer na semana");
await shot("n3c-lote");
await p.click("[data-act=close-sheet]");
await pausa();
await p.evaluate(() => { window.print = () => { window.__imprimiu = document.getElementById("impressao")?.textContent || ""; }; });
await p.click("[data-act=imprimir]");
ok((await p.evaluate(() => window.__imprimiu)).includes("Compras da semana"), "imprimir monta o cardápio e as compras da semana");
await p.evaluate(() => document.getElementById("impressao")?.remove());

// 3. feedback
await p.click("[data-act=tab][data-tab=saude]");
await p.click("[data-act=fb][data-k=energia][data-v='4']");
await p.click("[data-act=fb][data-k=intestino][data-v='5']");
await pausa();
ok(await p.isVisible("text=salvo"), "check-in do dia salvo");
await p.click("[data-act=fb-semana]");
await p.fill("textarea[name=funcionou]", "Shake de manhã segurou a fome");
await p.click("form[data-form=fb-semana] button[type=submit]");
await pausa(600);
await shot("n4-feedback");

// 4. ajustes: conector do Claude e digital
await p.click("[data-act=ajustes]");
await p.waitForSelector(".aj-perfil");
await shot("n5a-ajustes-menu");
ok(await p.isVisible("[data-act=aj-sec][data-s=claude]"), "Ajustes abre no menu por assunto");
await p.click("[data-act=aj-sec][data-s=claude]");
await p.click("[data-act=aj-mcp]");
await p.waitForSelector("[data-act=aj-mcp-copiar]");
const url = await p.evaluate(() => [...document.querySelectorAll("#ajustes-sb .input")].map((e) => e.textContent).find((t) => t.includes("/mcp/")));
const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }).then((x) => x.json());
ok(r.result.tools.length === 6, "conector do Claude responde com 6 ferramentas");
const ctxClaude = await fetch(url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "contexto_da_familia", arguments: {} } }) }).then((x) => x.json());
ok(JSON.parse(ctxClaude.result.content[0].text).fechamentosSemanais[0].funcionou.includes("Shake"), "o Claude lê o fechamento da semana");
await p.goBack(); // o "voltar" do Android volta ao menu, sem fechar os Ajustes
await p.waitForSelector(".aj-perfil");
ok(await p.isVisible("#ajustes-sb"), "voltar dentro dos Ajustes volta ao menu");
await p.click("[data-act=aj-sec][data-s=seguranca]");
await p.waitForSelector("[data-act=aj-digital-ativar]");
await p.click("[data-act=aj-digital-ativar]");
await p.waitForSelector("[data-act=aj-digital-remover]");
ok(true, "digital cadastrada (autenticador virtual)");
await pausa();
await shot("n5-ajustes");
await p.click("[data-act=close-sheet]");
await pausa(400);
ok((await p.evaluate(() => history.state)) === null, "fechar a partir de um assunto não deixa 'voltar' sobrando");

// 5. bloqueio depois de horas sem uso → digital destrava
const travar = async () => {
  await ctx.clearCookies({ name: "pf_sess" });
  await p.evaluate(() => localStorage.setItem("app_ativo", "0"));
  await p.reload();
};
const passkey = await p.evaluate(() => localStorage.getItem("app_passkey"));
await p.evaluate(() => localStorage.removeItem("app_passkey")); // primeiro sem digital: tela com a senha
await travar();
await p.waitForSelector("#bq-pass");
await shot("n6-bloqueio-senha");
ok((await p.evaluate(() => fetch("/api/meta").then((x) => x.status))) === 423, "servidor recusa os dados enquanto está bloqueado");
await p.evaluate((v) => localStorage.setItem("app_passkey", v), passkey);
await travar();
await p.waitForSelector(".timeline", { timeout: 15000 });
ok((await p.evaluate(() => fetch("/api/meta").then((x) => x.status))) === 200, "digital destravou de verdade (servidor liberou)");

// 5b. novidades: aparece uma vez por versão; versão em Ajustes
await pausa(1500); // deixa o app terminar de abrir (ele grava a versão vista) antes de mexer nela
await p.evaluate(() => localStorage.setItem("app_versao_vista", JSON.stringify("1.0.0")));
await p.reload();
await p.waitForSelector("text=Novidades da Mesa");
await shot("n6b-novidades");
await p.click(".sheet .foot [data-act=close-sheet]");
await pausa(500);
await p.reload();
await p.waitForSelector(".timeline");
await pausa(600);
ok(!(await p.isVisible("text=Novidades da Mesa")), "novidades não reaparecem depois de vistas");
await p.click("[data-act=ajustes]");
const versao = readFileSync(new URL("../public/js/views/novidades.js", import.meta.url), "utf8").match(/versao: "([\d.]+)"/)[1];
ok(await p.isVisible(`text=Versão ${versao}`), `Ajustes mostra a versão (${versao})`);
await p.click("[data-act=close-sheet]");
await pausa(400);

// 5c. pergunta da notificação abre na aba certa
await p.goto(base + "/?aba=saude");
await p.waitForSelector("text=Como foi hoje?");
ok(true, "link da pergunta abre a aba Saúde");
await p.click("[data-act=tab][data-tab=hoje]");
await p.waitForSelector(".timeline");

// 5d. fonte grande (Android com fonte em 130% ≈ tela de 280 px): nada vaza para os lados
await p.setViewportSize({ width: 280, height: 640 });
for (const aba of ["hoje", "semana", "compras", "saude"]) {
  await p.click(`[data-act=tab][data-tab=${aba}]`);
  await pausa(300);
  ok(await p.evaluate(() => innerWidth <= 281), `fonte grande: ${aba} cabe na largura`);
  await shot(`n9-fonte-${aba}`);
}
await p.click("[data-act=tab][data-tab=hoje]");
await p.click(".meal .body >> nth=1");
await pausa(400);
ok(await p.evaluate(() => { const s = document.querySelector(".sheet .sb"); return s.scrollWidth <= s.clientWidth + 1; }), "fonte grande: ficha da refeição cabe");
await shot("n9-fonte-ficha");
await p.click("[data-act=close-sheet]");
await pausa(300);
await p.click("[data-act=ajustes]");
await pausa(400);
ok(await p.evaluate(() => { const s = document.querySelector(".sheet .sb"); return s.scrollWidth <= s.clientWidth + 1; }), "fonte grande: Ajustes cabe");
await shot("n9-fonte-ajustes");
await p.click("[data-act=close-sheet]");
await p.setViewportSize({ width: 412, height: 915 });
await pausa(300);

// 5e. próximo plano antes de começar
const depois = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA", { timeZone: tz });
const prox = JSON.parse(JSON.stringify(plano));
Object.assign(prox, { titulo: "Plano seguinte", inicio: depois(3), fim: depois(4) });
prox.dias[0].data = depois(3); prox.dias[1].data = depois(4); prox.testes = [];
const pub = await p.evaluate((pl) => fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plano: pl }) }).then((x) => x.status), prox);
ok(pub === 200, "plano seguinte publicado");
await p.reload();
await p.waitForSelector("[data-act=ver-proximo]");
await shot("n9b-proximo");
await p.click("[data-act=ver-proximo][data-tab=compras]");
await p.waitForSelector("[data-act=voltar-atual]");
ok(true, "dá para ver o próximo plano (e a compra) antes de começar");
await p.click("[data-act=voltar-atual]");
await p.click("[data-act=tab][data-tab=hoje]");
await p.waitForSelector(".timeline");

// 6. computador
await p.setViewportSize({ width: 1440, height: 900 });
await pausa(500);
await shot("n7-computador");
await p.click(".meal .body >> nth=1");
await pausa(500);
await shot("n8-computador-ficha");
await p.click("[data-act=close-sheet]");
await pausa(400);
await p.setViewportSize({ width: 1440, height: 900 });
await pausa(300);
await p.click(".meal .body >> nth=0");
await p.waitForSelector(".sheet.lado");
const t1 = await p.textContent(".sheet.lado .h1");
await p.click(".meal .body >> nth=2");
await pausa(300);
ok((await p.$$(".sheet")).length === 1 && (await p.textContent(".sheet.lado .h1")) !== t1, "computador: a ficha fica ao lado e troca ao tocar em outra refeição");
await shot("n8b-computador-lado");

console.log("erros na página:", erros.length ? erros : "nenhum");
await browser.close();
if (erros.length) process.exit(1);
