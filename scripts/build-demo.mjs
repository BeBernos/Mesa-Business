// Monta a demonstração pública em _site/ (GitHub Pages): copia public/, troca os caminhos absolutos por relativos
// (o site fica numa subpasta, ex.: /Mesa-Business/) e carrega demo/demo.js antes do app, que simula a API.
// A Mesa 3.0 mora em v3/: o app roda no documento v3/index.html, então os caminhos dos scripts são relativos a ele ("../").
// Uso: node scripts/build-demo.mjs
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const site = join(raiz, "_site");
rmSync(site, { recursive: true, force: true });
cpSync(join(raiz, "public"), site, { recursive: true });
cpSync(join(raiz, "docs/exemplo-plano.json"), join(site, "demo/exemplo-plano.json"));

const ABS = /(["'`])\/((?:api|js|v3|img|icons|fonts|p)\/|sw\.js|manifest\.webmanifest)/g;
function trocar(arq) {
  let s = readFileSync(arq, "utf8");
  const naRaiz = arq === join(site, "index.html") || arq.endsWith("manifest.webmanifest");
  if (arq.endsWith(".css")) s = s.replace(/url\((["']?)\/(fonts|img|icons)\//g, "url($1../$2/");
  else s = s.replace(ABS, naRaiz ? "$1./$2" : "$1../$2");
  if (arq.endsWith("manifest.webmanifest")) s = s.replace(/"start_url":\s*"\/[^"]*"/, '"start_url": "./"').replace(/"scope":\s*"\/"/, '"scope": "./"');
  if (arq === join(site, "v3/index.html")) s = s.replace('<script type="module" src="../v3/app.js"></script>', '<script type="module" src="../js/demo.js"></script>\n<script type="module" src="../v3/app.js"></script>');
  writeFileSync(arq, s);
}
(function andar(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) andar(p);
    else if (/\.(js|html|css|webmanifest)$/.test(n)) trocar(p);
  }
})(site);
// o simulador da API entra depois da troca (ele precisa reconhecer "/api/" como está)
cpSync(join(raiz, "demo/demo.js"), join(site, "js/demo.js"));
// confere: nenhum caminho absoluto sobrando nos arquivos do app, e a demo entra antes do app
for (const f of ["v3/app.js", "v3/ui.js", "js/sync.js", "index.html"]) {
  const sobra = readFileSync(join(site, f), "utf8").match(ABS);
  if (sobra) throw new Error(`caminho absoluto sobrando em ${f}: ${sobra[0]}`);
}
if (!readFileSync(join(site, "v3/index.html"), "utf8").includes("js/demo.js")) throw new Error("demo.js não entrou no v3/index.html");
console.log("demonstração pronta em _site/");
