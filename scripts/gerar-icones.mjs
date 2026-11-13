// Gera os PNGs do app a partir do vetor em scripts/icones.mjs (precisa de Playwright).
// Uso: npm run icons
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { svgIcone, svgBadge, IDENTIDADE } from "./icones.mjs";

const dir = new URL("../public/icons/", import.meta.url).pathname;
const alvos = [
  ["icon-192.png", 192, svgIcone(IDENTIDADE, "arredondado"), true],
  ["icon-512.png", 512, svgIcone(IDENTIDADE, "arredondado"), true],
  ["maskable-512.png", 512, svgIcone(IDENTIDADE, "quadrado"), false],
  ["apple-touch-icon.png", 180, svgIcone(IDENTIDADE, "quadrado"), false],
  ["badge-96.png", 96, svgBadge(), true],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const [nome, px, svg, transparente] of alvos) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('width="1024" height="1024"', `width="${px}" height="${px}"`)}</body></html>`);
  await page.screenshot({ path: dir + nome, omitBackground: transparente, clip: { x: 0, y: 0, width: px, height: px } });
}
await browser.close();
// versões vetoriais para dentro do app (logo nítido em qualquer tela) e favicon
writeFileSync(new URL("../public/img/logo.svg", import.meta.url), svgIcone(IDENTIDADE, "arredondado"));
console.log("ícones gerados:", alvos.map((a) => a[0]).join(", "), "+ img/logo.svg");
