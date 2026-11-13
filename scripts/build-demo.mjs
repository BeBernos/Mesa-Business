// Monta a demonstração pública em _site/ (GitHub Pages): copia public/, troca os caminhos absolutos por relativos
// (o site fica numa subpasta, ex.: /Mesa-Business/) e carrega demo/demo.js antes do app, que simula a API.
// Uso: node scripts/build-demo.mjs
import { cpSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const raiz = new URL("..", import.meta.url).pathname;
const site = join(raiz, "_site");
rmSync(site, { recursive: true, force: true });
cpSync(join(raiz, "public"), site, { recursive: true });
cpSync(join(raiz, "docs/exemplo-plano.json"), join(site, "demo/exemplo-plano.json"));

const ABS = /(["'`])\/((?:api|js|css|img|icons|fonts|p)\/|sw\.js|manifest\.webmanifest)/g;
function trocar(arq) {
  let s = readFileSync(arq, "utf8");
  if (arq.endsWith(".css")) s = s.replace(/url\((["']?)\/(fonts|img|icons)\//g, "url($1../$2/");
  else s = s.replace(ABS, "$1./$2");
  s = s.replace('history.replaceState(null, "", "/")', 'history.replaceState(null, "", "./")').replace('location.replace("/")', 'location.replace("./")');
  if (arq.endsWith("manifest.webmanifest")) s = s.replace(/"start_url":\s*"\/[^"]*"/, '"start_url": "./"').replace(/"scope":\s*"\/"/, '"scope": "./"');
  if (arq.endsWith("index.html")) s = s.replace('<script type="module" src="./js/app.js"></script>', '<script type="module" src="./js/demo.js"></script>\n<script type="module" src="./js/app.js"></script>');
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
// confere: nenhum caminho absoluto sobrando nos arquivos do app
const sobra = readFileSync(join(site, "js/app.js"), "utf8").match(ABS);
if (sobra) throw new Error("caminho absoluto sobrando: " + sobra[0]);
if (!readFileSync(join(site, "index.html"), "utf8").includes("js/demo.js")) throw new Error("demo.js não entrou no index.html");
console.log("demonstração pronta em _site/");
