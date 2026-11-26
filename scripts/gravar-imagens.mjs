// Grava as imagens do README a partir da demonstração (família fictícia), em inglês e português:
//   capa.png · demo.gif · telas-1-{en,pt}.png · telas-2-{en,pt}.png · computador.png · arquitetura-{en,pt}.png · fluxo-{en,pt}.png
// Precisa de Playwright (chromium) e ffmpeg — roda no GitHub Actions (.github/workflows/imagens.yml), não no notebook.
// Uso: node scripts/gravar-imagens.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const site = join(raiz, "_site"), saida = join(raiz, "docs/images"), tmp = join(raiz, "_imagens");
execFileSync("node", [join(raiz, "scripts/build-demo.mjs")], { stdio: "inherit" });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// o site como no GitHub Pages: /Mesa-Business/...
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const servidor = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname).replace(/^\/Mesa-Business/, "");
  if (p.endsWith("/")) p += "index.html";
  try { const b = readFileSync(join(site, p)); r.writeHead(200, { "content-type": TIPOS[extname(p)] || "application/octet-stream" }); r.end(b); }
  catch (e) { r.writeHead(404); r.end(); }
}).listen(5577, "127.0.0.1");
const URL_APP = "http://127.0.0.1:5577/Mesa-Business/v3/";

const browser = await chromium.launch();
const celular = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "dark" };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// o selo "Demonstração · dados fictícios" fica fora das imagens (o README já diz que é fictício)
const semSelo = (p) => p.evaluate(() => [...document.body.children].filter((e) => e.textContent === "Demonstração · dados fictícios").forEach((e) => e.remove()));
async function abrir(p) {
  await p.goto(URL_APP);
  await p.waitForSelector(".tl");
  await semSelo(p);
  await pausa(900);
}
const irPara = async (p, aba) => { await p.evaluate((a) => { location.hash = a; }, aba); await pausa(900); await semSelo(p); await p.evaluate(() => scrollTo(0, 0)); };

// ---------- 1. as telas do celular ----------
{
  const ctx = await browser.newContext({ ...celular, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const foto = (n) => p.screenshot({ path: join(tmp, `${n}.png`) });
  await abrir(p);
  await foto("hoje");
  await p.click(".tl [data-act=ficha] >> nth=0");
  await p.waitForSelector("dialog.folha[open]");
  await pausa(600);
  await foto("ficha");
  await p.keyboard.press("Escape");
  await pausa(400);
  for (const aba of ["plano", "compras", "diario", "ajustes"]) { await irPara(p, aba); await foto(aba); }
  await irPara(p, "hoje");
  await p.click("[data-act=pessoa][data-p=theo]");
  await pausa(1200);
  await semSelo(p);
  await foto("theo");
  // a entrada: com digital cadastrada, o prato se desenha e o botão da digital pulsa
  await p.evaluate(async () => {
    localStorage.setItem("app_passkey", JSON.stringify({ id: "demo" }));
    const m = await import(new URL("../js/views/bloqueio.js", location.href).href);
    m.telaBloqueio(() => {});
  });
  await pausa(3200);
  await semSelo(p);
  await foto("entrada");
  await ctx.close();
}

// ---------- 2. o computador ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "pt-BR", timezoneId: "America/Sao_Paulo", colorScheme: "dark" });
  const p = await ctx.newPage();
  await abrir(p);
  await p.screenshot({ path: join(saida, "computador.png") });
  await ctx.close();
}

// ---------- 3. capa, painéis e diagramas (HTML → PNG) ----------
const b64 = (f, tipo) => `data:${tipo};base64,${readFileSync(f).toString("base64")}`;
const fonte = (n) => b64(join(raiz, "public/fonts", n), "font/woff2");
const tela = (n) => b64(join(tmp, `${n}.png`), "image/png");
const logo = b64(join(raiz, "public/img/logo.svg"), "image/svg+xml");
const BASE = `<meta charset="utf-8"><style>
  @font-face { font-family: Outfit; src: url(${fonte("outfit.woff2")}); font-weight: 100 900; }
  @font-face { font-family: Inter; src: url(${fonte("inter.woff2")}); font-weight: 100 900; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #0B0B0D; color: #F3F2F5; font-family: Inter, sans-serif; overflow: hidden; }
  .brilho { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; }
  .fone { width: 330px; height: 714px; border-radius: 48px; padding: 9px; background: #1A1922; box-shadow: 0 40px 90px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.08); }
  .fone img { width: 100%; height: 100%; border-radius: 40px; display: block; object-fit: cover; object-position: top; }
  .eyebrow { font: 500 15px Inter; letter-spacing: .14em; text-transform: uppercase; color: #8D8B96; }
  h2 { font: 300 52px/1.05 Outfit; margin: 10px 0 0; letter-spacing: -.01em; }
</style>`;
const brilhos = `<div class="brilho" style="width:620px;height:620px;background:#3442B8;opacity:.38;left:-180px;top:-300px"></div>
  <div class="brilho" style="width:560px;height:560px;background:#7E1C55;opacity:.36;right:-160px;bottom:-260px"></div>`;
async function png(html, w, h, arq) {
  writeFileSync(join(tmp, "pagina.html"), `<!doctype html><html><head>${BASE}</head><body style="width:${w}px;height:${h}px;position:relative">${html}</body></html>`);
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto("file://" + join(tmp, "pagina.html"));
  await pausa(400);
  await p.screenshot({ path: join(saida, arq) });
  await p.close();
}

// capa 1600×800
await png(`${brilhos}
  <div style="position:absolute;left:90px;top:170px;width:640px"><img src="${logo}" style="width:96px;height:96px">
    <h1 style="font:200 140px/1 Outfit;letter-spacing:-.02em;margin:56px 0 0">Mesa</h1>
    <p style="font:300 30px/1.35 Inter;color:#C9C7D0;margin:34px 0 0">The family nutrition plan on every phone —<br>planned by AI, followed in real life.</p>
    <div style="display:inline-block;margin-top:46px;padding:14px 22px;border-radius:14px;background:rgba(123,147,255,.12);border:1px solid rgba(123,147,255,.25);color:#A9B8FF;font:500 21px Inter">PWA · Claude AI (MCP) · Cloudflare Workers</div></div>
  <div class="fone" style="position:absolute;left:800px;top:150px;transform:rotate(-9deg)"><img src="${tela("plano")}"></div>
  <div class="fone" style="position:absolute;left:1290px;top:150px;transform:rotate(9deg)"><img src="${tela("ficha")}"></div>
  <div class="fone" style="position:absolute;left:1040px;top:66px"><img src="${tela("hoje")}"></div>`, 1600, 800, "capa.png");

const T = {
  en: {
    p1: ["Every person, their own day", "Each phone opens on one person: their meals, rings and notes — nobody else's."],
    p2: ["The whole household, one app", "Shared shopping, a diary the AI reads, a child view and a passkey at the door."],
    telas: {
      hoje: ["Today", "Four rings, water and the meal timeline"], ficha: ["Meal sheet", "Options, only part, something else"],
      plano: ["Plan", "The week at a glance"], compras: ["Shopping", "By week or month, synced live"],
      diario: ["Diary", "Daily close and Claude's reviews"], theo: ["Child view", "No calories — ate well, little or refused"],
      entrada: ["Entrance", "The passkey is asked on tap"], ajustes: ["Settings", "Per-phone reminders, the Claude connector"],
    },
    arq: { titulo: "How Mesa works", fones: "Family phones · PWA", fonesL: ["Today · Plan · Shopping · Diary", "Event log + offline queue", "Service worker cache", "Passkey lock"],
      worker: "One Cloudflare Worker", workerL: ["REST API  /api/*", "Cron every minute → reminders", "Web Push (VAPID + RFC 8291)", "MCP server for Claude", "plan.js — the same engine as the phone"],
      dados: "D1 + KV", dadosL: "shared log · plans · devices · schedule", claude: "Claude (the family's account)", claudeL: "reads the month, drafts, validates, publishes after a “yes”",
      pulse: "Pulse · training", pulseL: "weight, workouts, cardio", cesta: "Cesta · groceries", cestaL: "shopping list out, prices back",
      s1: "HTTPS · log sync · Web Push", s2: "MCP", s3: "service binding" },
    fluxo: { titulo: "One month, one loop", passos: [["Read", "Claude reads adherence, leftovers, swaps, symptoms, weight and cost"], ["Draft", "Writes the plan in 7-day parts in the JSON contract"],
      ["Validate", "The same engine checks it and shows the summary"], ["Publish", "After a “yes”, every phone is notified"], ["Live", "The family eats, swaps, logs — offline too"], ["Learn", "The log becomes next month's context"]],
      volta: "next month starts from what really happened" },
  },
  pt: {
    p1: ["Cada um com o seu dia", "Cada celular abre em uma pessoa: as refeições, os anéis e as notas dela — e de mais ninguém."],
    p2: ["A casa inteira, um app", "Compras em conjunto, um diário que a IA lê, a visão da criança e a digital na porta."],
    telas: {
      hoje: ["Hoje", "Quatro anéis, água e a linha do tempo"], ficha: ["Ficha da refeição", "Opções, só parte, outra coisa"],
      plano: ["Plano", "A semana de relance"], compras: ["Compras", "Por semana ou mês, sincronizada"],
      diario: ["Diário", "Fechamento do dia e análises do Claude"], theo: ["Visão da criança", "Sem calorias — comeu bem, pouco ou recusou"],
      entrada: ["Entrada", "A digital é pedida no toque"], ajustes: ["Ajustes", "Avisos por celular e o conector do Claude"],
    },
    arq: { titulo: "Como a Mesa funciona", fones: "Celulares da família · PWA", fonesL: ["Hoje · Plano · Compras · Diário", "Registro de eventos + fila offline", "Cache no service worker", "Trava com digital"],
      worker: "Um Cloudflare Worker", workerL: ["API REST  /api/*", "Cron a cada minuto → lembretes", "Web Push (VAPID + RFC 8291)", "Servidor MCP para o Claude", "plan.js — o mesmo motor do celular"],
      dados: "D1 + KV", dadosL: "registro · planos · aparelhos · agenda", claude: "Claude (a conta da família)", claudeL: "lê o mês, monta, valida e publica depois de um “sim”",
      pulse: "Pulse · treino", pulseL: "peso, treinos, cardio", cesta: "Cesta · mercado", cestaL: "lista de compras vai, preços voltam",
      s1: "HTTPS · sincronização · Web Push", s2: "MCP", s3: "ligação interna" },
    fluxo: { titulo: "Um mês, um ciclo", passos: [["Ler", "O Claude lê adesão, sobras, trocas, sintomas, peso e custo"], ["Montar", "Escreve o plano em partes de 7 dias no contrato JSON"],
      ["Validar", "O mesmo motor confere e mostra o resumo"], ["Publicar", "Depois do “sim”, todos os celulares são avisados"], ["Viver", "A família come, troca, anota — offline também"], ["Aprender", "O registro vira o contexto do mês seguinte"]],
      volta: "o mês seguinte começa do que aconteceu de verdade" },
  },
};

for (const [lg, t] of Object.entries(T)) {
  // painéis: 4 celulares com legenda
  const painel = ([titulo, sub], telas, arq) => png(`${brilhos}
    <div style="position:absolute;left:68px;top:58px;right:68px"><div class="eyebrow">Mesa 3.0</div><h2>${titulo}</h2>
      <p style="font:300 22px/1.4 Inter;color:#B4B2BC;margin:12px 0 0">${sub}</p></div>
    <div style="position:absolute;left:68px;right:68px;top:250px;display:flex;justify-content:space-between">${telas.map((n) => `<div style="width:330px">
      <div class="fone"><img src="${tela(n)}"></div>
      <div style="font:500 22px Outfit;margin-top:22px">${t.telas[n][0]}</div><div style="font:400 16px/1.4 Inter;color:#9F9DA8;margin-top:4px">${t.telas[n][1]}</div></div>`).join("")}</div>`,
    1600, 1110, arq);
  await painel(t.p1, ["hoje", "ficha", "plano", "compras"], `telas-1-${lg}.png`);
  await painel(t.p2, ["diario", "theo", "entrada", "ajustes"], `telas-2-${lg}.png`);

  // arquitetura
  const a = t.arq;
  const caixa = (x, y, w, h, cor, tit, linhas) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:24px;padding:26px 28px;
    background:linear-gradient(160deg, ${cor}26, rgba(255,255,255,.03) 55%);border:1px solid ${cor}55">
    <div style="font:500 24px Outfit;color:#fff">${tit}</div>${Array.isArray(linhas) ? `<ul style="margin:16px 0 0;padding:0;list-style:none;font:400 17px/1.25 Inter;color:#C9C7D0">
    ${linhas.map((l) => `<li style="margin-top:12px;display:flex;gap:10px"><span style="color:${cor}">●</span>${l}</li>`).join("")}</ul>` : `<div style="font:400 16px/1.4 Inter;color:#B4B2BC;margin-top:8px">${linhas}</div>`}</div>`;
  const seta = (x1, y1, x2, y2, txt, tx, ty) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7B93FF" stroke-width="2.5" stroke-dasharray="6 6" marker-end="url(#m)" marker-start="url(#m)"/>
    ${txt ? `<text x="${tx}" y="${ty}" fill="#A9B8FF" font-family="Inter" font-size="15" text-anchor="middle">${txt}</text>` : ""}`;
  await png(`${brilhos}
    <div style="position:absolute;left:60px;top:46px"><div class="eyebrow">Mesa 3.0</div><h2 style="font-size:44px">${a.titulo}</h2></div>
    <svg width="1600" height="800" style="position:absolute;inset:0"><defs><marker id="m" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#7B93FF"/></marker></defs>
      ${seta(404, 360, 636, 360, a.s1, 520, 342)}${seta(1064, 252, 1176, 252, a.s2, 1120, 234)}${seta(1064, 420, 1176, 420, a.s3, 1120, 402)}${seta(1064, 580, 1176, 580, a.s3, 1120, 562)}${seta(850, 602, 850, 658, "", 0, 0)}</svg>
    ${caixa(60, 200, 340, 320, "#7B93FF", a.fones, a.fonesL)}
    ${caixa(640, 180, 420, 420, "#F06595", a.worker, a.workerL)}
    ${caixa(640, 660, 420, 110, "#FF8A4C", a.dados, a.dadosL)}
    ${caixa(1180, 180, 360, 145, "#B57CFF", a.claude, a.claudeL)}
    ${caixa(1180, 355, 360, 130, "#FF8A4C", a.pulse, a.pulseL)}
    ${caixa(1180, 520, 360, 120, "#F59F00", a.cesta, a.cestaL)}`, 1600, 800, `arquitetura-${lg}.png`);

  // fluxo
  const f = t.fluxo;
  await png(`${brilhos}
    <div style="position:absolute;left:60px;top:46px"><div class="eyebrow">Mesa 3.0</div><h2 style="font-size:44px">${f.titulo}</h2></div>
    <div style="position:absolute;left:60px;right:60px;top:190px;display:flex;gap:22px">${f.passos.map(([n, d], i) => `<div style="flex:1;border-radius:22px;padding:24px 22px;min-height:230px;
      background:linear-gradient(160deg, rgba(123,147,255,${0.08 + i * 0.03}), rgba(255,255,255,.03) 60%);border:1px solid rgba(123,147,255,.28)">
      <div style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font:500 20px Outfit;background:linear-gradient(135deg,#7B93FF,#B57CFF)">${i + 1}</div>
      <div style="font:500 24px Outfit;margin-top:18px">${n}</div><div style="font:400 16px/1.45 Inter;color:#B4B2BC;margin-top:8px">${d}</div></div>`).join("")}</div>
    <svg width="1600" height="560" style="position:absolute;inset:0"><defs><marker id="v" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#F06595"/></marker></defs>
      <path d="M1450 440 Q800 540 150 440" fill="none" stroke="#F06595" stroke-width="2.5" stroke-dasharray="7 7" marker-end="url(#v)"/>
      <text x="800" y="508" fill="#F7A8C6" font-family="Inter" font-size="17" text-anchor="middle">${f.volta}</text></svg>`, 1600, 560, `fluxo-${lg}.png`);
}

// ---------- 4. GIF: troca o café pela opção 2, marca como comido, anota a água; a semana e as compras acompanham ----------
{
  const ctx = await browser.newContext({ ...celular, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: 390, height: 844 } } });
  const p = await ctx.newPage();
  const t0 = Date.now(); // o vídeo começa com a página
  await abrir(p);
  // a demo já traz o café de hoje marcado: desmarca fora do trecho que vai para o GIF (e some com o aviso)
  const feito = p.locator(".tl .meal [data-act=comi][aria-pressed=true]").first();
  if (await feito.count()) {
    await feito.click();
    await pausa(300);
    await p.evaluate(() => { const t = document.getElementById("toast"); t.classList.remove("on"); try { t.hidePopover(); } catch (e) {} });
  }
  await pausa(700);
  const corte = ((Date.now() - t0) / 1000).toFixed(2);
  await pausa(800);
  await p.click(".tl [data-act=ficha] >> nth=0");
  await p.waitForSelector("dialog.folha[open]");
  await pausa(1200);
  const opcao2 = p.locator("dialog.folha [data-act=trocar][data-i='1']");
  if (await opcao2.count()) { await opcao2.scrollIntoViewIfNeeded(); await pausa(500); await opcao2.click(); await pausa(1200); }
  const comi = p.locator("dialog.folha [data-act=comi-ficha]");
  if (!/desmarcar/i.test(await comi.textContent())) await comi.click(); else await p.keyboard.press("Escape");
  await pausa(1400);
  for (let i = 0; i < 2; i++) { await p.click('[data-act=agua][data-v="250"]'); await pausa(900); }
  await pausa(600);
  await p.evaluate(() => { location.hash = "plano"; });
  await semSelo(p);
  await pausa(1800);
  await p.evaluate(() => { location.hash = "compras"; });
  await semSelo(p);
  await pausa(1800);
  await ctx.close();
  const video = readdirSync(tmp).find((n) => n.endsWith(".webm"));
  // o começo (página carregando e o café desmarcado) fica de fora
  execFileSync("ffmpeg", ["-y", "-ss", corte, "-i", join(tmp, video), "-vf",
    "fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
    join(saida, "demo.gif")], { stdio: "inherit" });
}

await browser.close();
servidor.close();
console.log("imagens gravadas em docs/images/");
