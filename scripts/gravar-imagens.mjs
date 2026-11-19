// Grava as imagens do README a partir da demonstração (família fictícia): docs/images/capa.png e docs/images/demo.gif.
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
// o selo "Demonstração · dados fictícios" fica fora das imagens (a legenda do README já diz que é fictício)
const semSelo = (p) => p.evaluate(() => [...document.body.children].filter((e) => e.textContent === "Demonstração · dados fictícios").forEach((e) => e.remove()));
async function abrir(p) {
  await p.goto(URL_APP);
  await p.waitForSelector(".tl");
  await semSelo(p);
  await pausa(900);
}

// ---------- 1. prints do celular para a capa ----------
{
  const ctx = await browser.newContext({ ...celular, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await abrir(p);
  await p.screenshot({ path: join(tmp, "hoje.png") });
  await p.click(".tl [data-act=ficha] >> nth=0");
  await p.waitForSelector("dialog.folha[open]");
  await pausa(600);
  await p.screenshot({ path: join(tmp, "ficha.png") });
  await p.keyboard.press("Escape");
  await p.evaluate(() => { location.hash = "plano"; });
  await pausa(900);
  await semSelo(p);
  await p.screenshot({ path: join(tmp, "plano.png") });
  await ctx.close();
}

// ---------- 2. capa 1600×800 ----------
{
  const b64 = (f, tipo) => `data:${tipo};base64,${readFileSync(f).toString("base64")}`;
  const fonte = (n) => b64(join(raiz, "public/fonts", n), "font/woff2");
  const tela = (n) => b64(join(tmp, n), "image/png");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Outfit; src: url(${fonte("outfit.woff2")}); font-weight: 100 900; }
    @font-face { font-family: Inter; src: url(${fonte("inter.woff2")}); font-weight: 100 900; }
    html, body { margin: 0; width: 1600px; height: 800px; overflow: hidden; background: #0B0B0D; color: #F3F2F5; font-family: Inter, sans-serif; }
    .brilho { position: absolute; border-radius: 50%; filter: blur(90px); }
    .texto { position: absolute; left: 90px; top: 170px; width: 640px; }
    .texto img { width: 96px; height: 96px; display: block; }
    h1 { font: 200 140px/1 Outfit, sans-serif; letter-spacing: -.02em; margin: 56px 0 0; }
    p { font: 300 30px/1.35 Inter, sans-serif; color: #C9C7D0; margin: 34px 0 0; }
    .chip { display: inline-block; margin-top: 46px; padding: 14px 22px; border-radius: 14px; background: rgba(123,147,255,.12); border: 1px solid rgba(123,147,255,.25); color: #A9B8FF; font: 500 21px Inter, sans-serif; }
    .fone { position: absolute; width: 330px; height: 714px; border-radius: 48px; padding: 9px; background: #1A1922; box-shadow: 0 40px 90px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.08); }
    .fone img { width: 100%; height: 100%; border-radius: 40px; display: block; object-fit: cover; object-position: top; }
  </style></head><body>
    <div class="brilho" style="width:620px;height:620px;background:#3442B8;opacity:.42;right:180px;top:-260px"></div>
    <div class="brilho" style="width:520px;height:520px;background:#7E1C55;opacity:.4;right:-120px;bottom:-220px"></div>
    <div class="brilho" style="width:420px;height:420px;background:#3442B8;opacity:.18;left:-160px;bottom:-200px"></div>
    <div class="texto"><img src="${b64(join(raiz, "public/img/logo.svg"), "image/svg+xml")}" alt="">
      <h1>Mesa</h1><p>The family nutrition plan on every phone —<br>planned by AI, followed in real life.</p>
      <div class="chip">PWA · Claude AI (MCP) · Cloudflare Workers</div></div>
    <div class="fone" style="left:800px;top:150px;transform:rotate(-9deg)"><img src="${tela("plano.png")}"></div>
    <div class="fone" style="left:1290px;top:150px;transform:rotate(9deg)"><img src="${tela("ficha.png")}"></div>
    <div class="fone" style="left:1040px;top:66px"><img src="${tela("hoje.png")}"></div>
  </body></html>`;
  writeFileSync(join(tmp, "capa.html"), html);
  const p = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  await p.goto("file://" + join(tmp, "capa.html"));
  await pausa(500);
  await p.screenshot({ path: join(saida, "capa.png") });
  await p.close();
}

// ---------- 3. GIF: troca o café pela opção 2, marca como comido, anota a água; a semana e as compras acompanham ----------
{
  const ctx = await browser.newContext({ ...celular, deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: 390, height: 844 } } });
  const p = await ctx.newPage();
  await abrir(p);
  await pausa(800);
  await p.click(".tl [data-act=ficha] >> nth=0");
  await p.waitForSelector("dialog.folha[open]");
  await pausa(1200);
  const opcao2 = p.locator("dialog.folha [data-act=trocar][data-i='1']");
  if (await opcao2.count()) { await opcao2.scrollIntoViewIfNeeded(); await pausa(500); await opcao2.click(); await pausa(1200); }
  await p.click("dialog.folha [data-act=comi-ficha]");
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
  // os primeiros ~0,6 s são a página carregando: ficam de fora
  execFileSync("ffmpeg", ["-y", "-ss", "0.6", "-i", join(tmp, video), "-vf",
    "fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
    join(saida, "demo.gif")], { stdio: "inherit" });
}

await browser.close();
servidor.close();
console.log("imagens gravadas em docs/images/ (capa.png, demo.gif)");
