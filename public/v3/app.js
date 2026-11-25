// Mesa 3.0: casca, navegação e ligação com os módulos de dados — registro e fila offline (sync.js), estado e resumo
// do dia (state.js), motor do plano (plan.js), este celular (aparelho.js) e a trava (bloqueio.js).
import { S, setRender, hoje, dataInicial, cor } from "../js/state.js";
import { normalizarPlano } from "../js/plan.js";
import { api, log, LS } from "../js/sync.js";
import * as bloqueio from "../js/views/bloqueio.js";
import { VERSAO } from "../js/views/novidades.js";
import { $, icon, animar, folhaAberta, toast, topo } from "./ui.js";
import * as hojeV from "./views/hoje.js";
import * as ajustesV from "./views/ajustes.js";
import * as catalogoV from "./views/catalogo.js";
import * as fichaV from "./views/ficha.js";
import * as cozinhaV from "./views/cozinha.js";
import * as outraV from "./views/outra.js";
import * as maisV from "./views/mais.js";
import * as diarioV from "./views/diario.js";
import * as planoV from "./views/plano.js";
import * as comprasV from "./views/compras.js";
import * as atualizarV from "./views/atualizar.js";
import * as saudeV from "./views/saude.js";
import { criarAparelho, garantirInscricao } from "../js/aparelho.js";

// ---------- abas ----------
const VIEWS = {
  hoje: hojeV,
  plano: planoV,
  compras: comprasV,
  diario: diarioV,
  ajustes: ajustesV,
  catalogo: catalogoV,
};
const NAV = [["hoje", "sun", "Hoje"], ["plano", "calendar-days", "Plano"], ["compras", "shopping-cart", "Compras"], ["diario", "notebook-pen", "Diário"]];
const SEM_PLANO = new Set(["ajustes", "catalogo"]);
const FORMS = Object.assign({}, fichaV.forms, comprasV.forms, ajustesV.forms);
const ACTS = Object.assign({}, hojeV.acts, fichaV.acts, cozinhaV.acts, outraV.acts, maisV.acts, diarioV.acts, planoV.acts, comprasV.acts, atualizarV.acts, saudeV.acts, ajustesV.acts, catalogoV.acts, {
  pessoa: (b) => { S.pessoa = b.dataset.p; render(); },
  "voltar-atual": () => { S.viewing = null; carregarPlano(); },
});
const rota = () => (VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "hoje");

// ---------- id do aparelho ----------
S.deviceId = LS.get("app_device_id", null);
if (!S.deviceId) { S.deviceId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12); LS.set("app_device_id", S.deviceId); }
log.device = S.deviceId;

// ---------- desenho ----------
const nav = (r) => `<nav class="nav" aria-label="Abas">${NAV.map(([k, ic, l]) => `<a href="#${k}" ${r === k ? 'aria-current="page"' : ""}>${icon(ic)}${l}</a>`).join("")}</nav>`;

function vazio() {
  const antigo = S.planoInfo && S.planoInfo.kind !== "v2";
  return `<div class="page">${topo("Mesa")}<div class="glass card"><p class="muted" style="margin:0">${antigo
    ? "Este plano está no formato antigo (de antes de outubro). Dá para ver como página; o próximo, peça ao Claude no formato novo."
    : "Falta o plano do mês. Peça ao Claude pelo conector (Ajustes → Claude) — ele publica direto aqui — ou suba o arquivo."}</p><div class="gap"></div>
    ${antigo ? `<a class="btn cta" href="/p/${S.planoInfo.id}.html" target="_blank" rel="noopener">Ver o plano</a>` : `<button class="btn cta" data-act="atualizar">${icon("upload", "sm")}Subir plano</button>`}
    <a class="btn txt" href="#ajustes">Ajustes</a></div></div>`;
}

// redesenhar no meio de um toque troca o elemento sob o dedo e o gesto se perde (deslizar dia, segurar):
// enquanto há dedo na tela, o redesenho espera ele sair
let tocando = 0, pendente = false;
addEventListener("touchstart", (e) => { tocando = e.touches.length; }, { capture: true, passive: true });
const soltou = (e) => { tocando = e.touches.length; if (!tocando && pendente) { pendente = false; setTimeout(render, 0); } };
addEventListener("touchend", soltou, { capture: true, passive: true });
addEventListener("touchcancel", soltou, { capture: true, passive: true });

function render() {
  if (bloqueio.bloqueado()) return;
  if (tocando) { pendente = true; return; }
  document.documentElement.style.setProperty("--ac", S.pessoa ? cor(S.pessoa) : "var(--rafael)");
  // tela da criança: pele infantil (só fora do catálogo, que mostra as duas)
  const kid = !!S.plano?.pessoas.find((p) => p.id === S.pessoa)?.crianca && location.hash !== "#catalogo";
  document.body.classList.toggle("crianca", kid);
  const r = rota();
  let html;
  if (SEM_PLANO.has(r) || S.plano) html = VIEWS[r].render();
  else html = S.carregando ? `<div class="loader" aria-label="Carregando"><i></i><i></i><i></i></div>` : vazio();
  // vendo outro plano (histórico ou o próximo): faixa para voltar ao plano atual
  if (S.viewing && S.plano && !SEM_PLANO.has(r)) html = `<div class="page vendo"><div class="glass card aviso-dia alerta lado-a-lado"><span>Vendo <b>${S.planoInfo?.title || "outro plano"}</b></span><button class="btn" data-act="voltar-atual">Voltar ao atual</button></div></div>` + html;
  $("#app").innerHTML = html + (r === "catalogo" ? "" : nav(r));
  animar();
}
setRender(render);

// ---------- eventos ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  const f = b && ACTS[b.dataset.act];
  if (f) { e.preventDefault(); f(b, e); }
});
document.addEventListener("submit", (e) => {
  const f = FORMS[e.target.dataset.form];
  if (f) { e.preventDefault(); f(e.target); }
});
addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
addEventListener("plano:trocar", async (e) => { if (e.detail?.refresh) { S.viewing = null; await carregarMeta(); } await carregarPlano(); });
addEventListener("plano:ver", async (e) => { S.viewing = e.detail.id; await carregarPlano(); location.hash = "plano"; });
log.onChange(() => { if (!folhaAberta()) render(); });

// ---------- planos (o normalizado fica guardado no celular por versão) ----------
function escolherPlano() {
  const h = S.meta?.history || [];
  if (S.viewing) return h.find((p) => p.id === S.viewing) || null;
  const d = S.meta?.today || hoje();
  return h.find((p) => p.from <= d && d <= p.to) || h.find((p) => p.from > d) || h[0] || null;
}

async function carregarMeta() {
  try {
    S.meta = await api("/api/meta");
    LS.set("app_meta", S.meta);
    S.online = true;
  } catch (e) {
    // travado ou sem sessão: a tela de entrada resolve (antes o erro subia e ficava sem tratamento em quem chamou)
    if (e.auth || e.locked) return bloqueio.telaBloqueio(iniciar);
    S.online = false;
  }
}

async function carregarPlano() {
  const info = escolherPlano();
  const trocou = info?.id !== S.planoInfo?.id;
  S.planoInfo = info;
  if (!info || info.kind !== "v2") { S.plano = null; render(); return; }
  if (!trocou && S.plano) { render(); return; }
  const salvo = LS.get("app_plano_norm", null);
  if (salvo?.id === info.id && salvo.versao === VERSAO) S.plano = salvo.plano;
  else try {
    S.carregando = true;
    render();
    const r = await fetch(`/api/plan/${info.id}`, { credentials: "same-origin" });
    if (!r.ok) throw new Error(r.status);
    const { plano, rascunho } = normalizarPlano(await r.text());
    S.plano = plano || rascunho;
    if (!S.viewing) LS.set("app_plano_norm", { id: info.id, versao: VERSAO, plano: S.plano });
  } catch (e) {
    S.plano = null;
    toast("Não consegui abrir o plano" + (S.online ? "" : " (offline)"));
  }
  S.carregando = false;
  if (S.plano) {
    if (!S.plano.pessoas.some((p) => p.id === S.pessoa)) S.pessoa = (S.cfg?.viewPerson && S.plano.pessoas.some((p) => p.id === S.cfg.viewPerson)) ? S.cfg.viewPerson : S.plano.pessoas[0].id;
    if (!S.data || !S.plano.dias.some((d) => d.data === S.data)) S.data = dataInicial(S.plano);
  }
  render();
}

// ---------- parâmetros de URL (notificações, atalhos e "Compartilhar → Mesa") ----------
const ABA_ANTIGA = { hoje: "hoje", semana: "plano", compras: "compras", saude: "diario" };
async function parametros(search = location.search) {
  const q = new URLSearchParams(search);
  if (q.has("atualizado")) { await carregarMeta(); await carregarPlano(); toast("Plano novo no ar ✨"); }
  if (q.has("upload")) setTimeout(() => atualizarV.abrirAtualizar(), 0);
  if (q.get("share") === "1") {
    try {
      const c = await caches.open("pf-share");
      const r = await c.match("/__shared");
      if (r) { const t = await r.text(); await c.delete("/__shared"); setTimeout(() => atualizarV.abrirAtualizar(t), 0); }
    } catch (e) { toast("Não recebi o arquivo"); }
  }
  if (q.get("share") === "erro") toast("Não recebi o arquivo");
  if (q.get("pessoa")) S.pessoa = q.get("pessoa");
  if (q.get("dia")) S.data = q.get("dia");
  const aba = ABA_ANTIGA[q.get("aba")] || ((q.get("pessoa") || q.get("dia")) && "hoje");
  if (aba) location.hash = aba;
  if (q.has("fechamento") && S.plano) setTimeout(() => diarioV.abrirFecharSemana(), 0); // pergunta de domingo à noite
  if ([...q.keys()].length) history.replaceState(null, "", "/v3/" + location.hash);
  render();
}

// ---------- service worker ----------
async function registrarSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
    await (await caches.open("pf-meta")).put("/__device", new Response(S.deviceId));
  } catch (e) {}
  navigator.serviceWorker.addEventListener("message", async (e) => {
    const d = e.data || {};
    if (d.type === "open" && d.url) parametros(new URL(d.url, location.origin).search);
    if (d.type === "plan-updated") { await carregarMeta(); await carregarPlano(); }
    if (d.type === "log") log.pull().catch(() => {});
  });
}

// ---------- sincronização ----------
let ultimoPull = 0;
async function sincronizar(forcar = false) {
  if (!forcar && Date.now() - ultimoPull < 15000) return;
  ultimoPull = Date.now();
  try {
    const antes = S.meta?.history?.[0]?.id;
    await carregarMeta();
    if (S.meta?.history?.[0]?.id !== antes) { await carregarPlano(); if (antes) toast("Plano novo no ar"); }
    await log.pull();
  } catch (e) {
    if (e.auth || e.locked) bloqueio.telaBloqueio(iniciar);
    return;
  }
  bloqueio.marcarUso();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (S.cfg && bloqueio.vencido()) return bloqueio.telaBloqueio(iniciar);
  sincronizar(true);
  render();
});
addEventListener("online", () => sincronizar(true));
addEventListener("mesa:atualizar", async () => { await sincronizar(true); toast("Atualizado"); });
setInterval(() => { if (document.visibilityState === "visible") sincronizar(); }, 20000);

// ---------- início ----------
let swOk = false;
async function iniciar() {
  if (!swOk) { swOk = true; registrarSW(); }
  if (S.cfg && bloqueio.vencido()) return bloqueio.telaBloqueio(iniciar);
  S.pessoa = S.pessoa || S.cfg?.viewPerson || null;
  if (S.meta) await carregarPlano(); // mostra o guardado enquanto confere o servidor
  try {
    const s = await api("/api/session");
    if (s.tz) { S.tz = s.tz; LS.set("app_tz", s.tz); }
    if (s.idleHours) LS.set("app_idle_h", s.idleHours);
    if (s.locked) return bloqueio.telaBloqueio(iniciar);
  } catch (e) {
    // sem sessão: tela de senha/digital (entrar e destravar usam /api/login)
    if (e.auth) return bloqueio.telaBloqueio(iniciar);
    S.online = false;
    return parametros();
  }
  await carregarMeta();
  let novo = false;
  try { S.cfg = await api(`/api/devices/${S.deviceId}`); LS.set("app_cfg", S.cfg); }
  catch (e) { if (e.status === 404) { novo = true; try { await criarAparelho(); } catch (err) {} } } // celular novo: cadastra e abre "Este celular"
  if (!S.pessoa && S.cfg?.viewPerson) S.pessoa = S.cfg.viewPerson;
  await carregarPlano();
  log.pull().then(render).catch(() => {});
  garantirInscricao().catch(() => {});
  bloqueio.marcarUso();
  if (novo) { LS.set("app_versao_vista", VERSAO); ajustesV.abrirAjustes("celular"); return; }
  ajustesV.mostrarNovidades();
  parametros();
}
iniciar();
