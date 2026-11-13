// Teste ponta a ponta no navegador + capturas de tela (opcional; precisa de Playwright e `npm run dev`).
// Uso: SHOTS=pasta node test/e2e.browser.mjs plano.json [http://localhost:8787] [senha]
import { chromium } from "playwright";

const [, , planPath, base = "http://localhost:8787", password = "teste-local-123"] = process.argv;
const SHOTS = process.env.SHOTS || ".";
if (!planPath) throw new Error("passe o caminho do plano .json");

const browser = await chromium.launch();
const errors = [];

async function phone(scheme) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: "America/Sao_Paulo", locale: "pt-BR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${scheme}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/401|404/.test(m.text())) errors.push(`${scheme}: ${m.text()}`); });
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

// --- celular 1 (claro): login, aparelho novo, sobe o plano ---
const a = await phone("light");
await a.goto(base);
await a.fill("#senha", password);
await a.click("#login button[type=submit]");
await a.waitForSelector("#ajustes-sb");
await a.click("[data-act=aj-pessoa][data-p=rafael]");
await a.waitForTimeout(300);
await shot(a, "01-ajustes");
await a.click("[data-act=close-sheet]");
await a.waitForTimeout(300);
await shot(a, "02-vazio");
await a.click("[data-act=atualizar]");
await a.waitForSelector("[data-act=up-arquivo]");
const [chooser] = await Promise.all([a.waitForEvent("filechooser"), a.click("[data-act=up-arquivo]")]);
await chooser.setFiles(planPath);
await a.waitForSelector("[data-act=up-publicar]");
await a.waitForTimeout(300);
await shot(a, "03-previa");
await a.click("[data-act=up-publicar]");
await a.waitForSelector(".timeline");
await a.waitForTimeout(900);
await shot(a, "04-hoje");
await a.click(".check >> nth=0");
await a.click(".check >> nth=1");
await a.waitForTimeout(900);
await shot(a, "05-hoje-comi");
await a.click(".meal .body >> nth=2");
await a.waitForSelector(".sheet .items");
await a.waitForTimeout(400);
await shot(a, "06-refeicao");
await a.click("[data-act=close-sheet]");
await a.waitForTimeout(300);
await a.click("[data-act=tab][data-tab=semana]");
await a.waitForTimeout(500);
await shot(a, "07-semana");
await a.click("[data-act=tab][data-tab=compras]");
await a.waitForTimeout(400);
await a.click("[data-act=pegar] >> nth=0");
await a.click("[data-act=pegar] >> nth=2");
await a.waitForTimeout(400);
await shot(a, "08-compras");
await a.click("[data-act=tab][data-tab=saude]");
await a.waitForTimeout(400);
await shot(a, "09-saude");
await a.click("[data-act=peso]");
await a.fill("input[name=kg]", "83,8");
await a.click("form[data-form=peso] button[type=submit]");
await a.waitForTimeout(1200);
await a.evaluate(() => window.scrollTo(0, 500));
await a.waitForTimeout(300);
await shot(a, "10-saude-testes");

// --- celular 2 (escuro): outro aparelho vê o que o primeiro marcou ---
const b = await phone("dark");
await b.goto(base);
await b.fill("#senha", password);
await b.click("#login button[type=submit]");
await b.waitForSelector("#ajustes-sb");
await b.click("[data-act=aj-pessoa][data-p=marina]");
await b.click("[data-act=aj-pessoa][data-p=theo]");
await b.waitForTimeout(800);
await b.click("[data-act=close-sheet]");
await b.waitForSelector(".timeline");
await b.waitForTimeout(800);
await shot(b, "11-escuro-marina");
await b.click("[data-act=pessoa][data-p=rafael]");
await b.waitForTimeout(600);
const feitosNoB = await b.$$eval(".check.on", (els) => els.length);
console.log("refeições marcadas no celular 1 e vistas no celular 2:", feitosNoB);
await b.click("[data-act=tab][data-tab=compras]");
await b.waitForTimeout(500);
const pegosNoB = await b.$$eval(".shop .row.got", (els) => els.length);
console.log("itens de compra sincronizados:", pegosNoB);
await shot(b, "12-escuro-compras");
await b.click("[data-act=tab][data-tab=saude]");
await b.click("[data-act=pessoa][data-p=theo]");
await b.waitForTimeout(400);
await shot(b, "13-escuro-theo");
await b.click("[data-act=tab][data-tab=hoje]");
await b.click("[data-act=pessoa][data-p=marina]");
await b.waitForTimeout(300);
await b.click(".meal .body >> nth=1");
await b.waitForTimeout(500);
await shot(b, "14-escuro-refeicao");

console.log("erros:", errors.length ? errors : "nenhum");
await browser.close();
