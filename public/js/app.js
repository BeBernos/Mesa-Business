import { S, setRender, rerender, hoje, dataInicial, cor } from "./state.js";
import { normalizarPlano } from "./plan.js";
import { $, esc, icon, toast, closeSheet, sheetOpen, topSheet, alternarTimer } from "./ui.js";
import { api, log, LS } from "./sync.js";
import * as hojeV from "./views/hoje.js";
import * as semanaV from "./views/semana.js";
import * as comprasV from "./views/compras.js";
import * as saudeV from "./views/saude.js";
import * as ajustesV from "./views/ajustes.js";
import * as atualizarV from "./views/atualizar.js";
import * as bloqueioV from "./views/bloqueio.js";
import * as novidadesV from "./views/novidades.js";
import * as buscaV from "./views/busca.js";

const VIEWS = { hoje: hojeV, semana: semanaV, compras: comprasV, saude: saudeV };
const ACTS = Object.assign({}, hojeV.acts, semanaV.acts, comprasV.acts, saudeV.acts, ajustesV.acts, atualizarV.acts, bloqueioV.acts, novidadesV.acts, buscaV.acts, {
  "close-sheet": () => closeSheet(),
  timer: (b) => alternarTimer(b, +b.dataset.min, b.dataset.rotulo || "temporizador"),
  tab: (b) => { if (topSheet()?.classList.contains("lado")) closeSheet(); S.tab = b.dataset.tab; render(); scrollTo(0, 0); },
  pessoa: (b) => { S.pessoa = b.dataset.p; render(); },
  "voltar-atual": () => { S.viewing = null; carregarPlano(); },
});
const FORMS = Object.assign({}, hojeV.forms, comprasV.forms, saudeV.forms, ajustesV.forms);

// ---------- id do aparelho ----------
S.deviceId = LS.get("app_device_id", null);
if (!S.deviceId) { S.deviceId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12); LS.set("app_device_id", S.deviceId); }
log.device = S.deviceId;
ajustesV.aplicarTema();

// ---------- desenho ----------
const NAV = [["hoje", "sun", "Hoje"], ["semana", "calendar-days", "Semana"], ["compras", "shopping-cart", "Compras"], ["saude", "heart-pulse", "Saúde"]];

function nav() {
  return `<nav class="nav">${NAV.map(([k, ic, l]) => `<button class="${S.tab === k ? "on" : ""}" data-act="tab" data-tab="${k}"><span class="pill">${icon(ic)}</span>${l}</button>`).join("")}</nav>`;
}

function vazio() {
  return `<div class="page"><div class="empty">
    <div class="art logo"><img src="/img/logo.svg" alt=""></div>
    <div class="h1">Tudo pronto</div>
    <p>Falta só o plano do mês. Ligue o conector do Claude (Ajustes → Claude) e peça a dieta — ou suba o arquivo aqui. Os outros celulares recebem na hora.</p>
    <div class="gap-s"></div>
    <button class="btn primary" data-act="atualizar">${icon("upload")}Subir plano</button>
    <button class="btn ghost" data-act="ajustes">${icon("settings")}Ajustes</button></div></div>`;
}

function antigo() {
  return `<div class="legacy"><iframe src="/p/${esc(S.planoInfo.id)}.html" title="Plano"></iframe></div>
    <div style="position:fixed;left:12px;right:12px;bottom:calc(var(--nav-h) + 12px);z-index:15" class="card tight">
      <div style="display:flex;align-items:center;gap:12px"><span class="grow" style="font-size:13.5px"><b>Plano no formato antigo.</b> Suba o próximo no formato novo para ver o app completo.</span>
      <button class="btn sm primary" data-act="atualizar">Atualizar</button><button class="icon-btn" data-act="ajustes" aria-label="Ajustes">${icon("settings")}</button></div></div>`;
}

function render() {
  if (bloqueioV.bloqueado()) return;
  const app = $("#app");
  document.documentElement.style.setProperty("--ac", S.pessoa ? cor(S.pessoa) : "var(--rafael)");
  let html;
  if (S.planoInfo && S.planoInfo.kind !== "v2") html = antigo();
  else if (!S.plano) html = S.carregando ? `<div class="loader" style="margin-top:42dvh"><i></i><i></i><i></i></div>` : vazio();
  else {
    const v = VIEWS[S.tab] || hojeV;
    html = v.render();
  }
  if (S.viewing && S.plano) html = `<div class="page"><div class="note alerta" style="margin-top:calc(var(--safe-t) + 10px)">${icon("history")}<div style="flex:1">Vendo um plano antigo: <b>${esc(S.planoInfo.title)}</b></div><button class="btn sm" data-act="voltar-atual">Voltar</button></div></div>` + html;
  app.innerHTML = html + (S.plano || S.planoInfo ? nav() : "");
  const v = VIEWS[S.tab];
  if (S.plano && v && v.afterRender) v.afterRender();
}
setRender(render);

// ---------- eventos ----------
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const f = ACTS[b.dataset.act];
  if (f) { e.preventDefault(); f(b, e); }
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("submit", (e) => {
  const f = FORMS[e.target.dataset.form];
  if (!f) return;
  e.preventDefault();
  f(e.target);
  if (e.target.dataset.form === "extra" || e.target.dataset.form === "lembrete") e.target.reset();
});
log.onChange(() => { if (!sheetOpen()) render(); });
window.addEventListener("plano:trocar", async (e) => { if (e.detail?.refresh) await carregarMeta(); await carregarPlano(); });

// ---------- planos ----------
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
    if (e.auth || e.locked) throw e;
    S.online = false;
  }
}

const cachePlanos = new Map();
async function carregarPlano() {
  const info = escolherPlano();
  const trocou = info?.id !== S.planoInfo?.id;
  S.planoInfo = info;
  if (!info || info.kind !== "v2") { S.plano = null; render(); return; }
  if (!trocou && S.plano) { render(); return; }
  // abrir rápido: o plano já validado fica guardado no celular (vale para a mesma versão do app, que pode mudar a validação)
  const salvo = LS.get("app_plano_norm", null);
  if (salvo?.id === info.id && salvo.versao === novidadesV.VERSAO) S.plano = salvo.plano;
  else try {
    S.carregando = true;
    render();
    let raw = cachePlanos.get(info.id);
    if (!raw) { const r = await fetch(`/api/plan/${info.id}`, { credentials: "same-origin" }); if (!r.ok) throw new Error(r.status); raw = await r.text(); cachePlanos.set(info.id, raw); }
    const { plano, rascunho } = normalizarPlano(raw);
    S.plano = plano || rascunho;
    if (!S.viewing) LS.set("app_plano_norm", { id: info.id, versao: novidadesV.VERSAO, plano: S.plano });
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

// ---------- login ----------
function telaLogin() {
  $("#app").innerHTML = `<div class="login-wrap"><form class="login" id="login">
    <img class="logo" src="/img/logo.svg" alt="">
    <div><div class="eyebrow" style="color:rgba(255,255,255,.75)"><span class="marca"><i></i><i></i><i></i></span>Rafael · Marina · Theo</div>
      <div class="h1" style="margin-top:8px">Mesa</div><p style="margin-top:8px">Digite a senha da família. Só precisa fazer isso uma vez neste celular.</p></div>
    <input class="input" type="password" id="senha" placeholder="Senha da família" autocomplete="current-password" required>
    <button class="btn primary block" type="submit">Entrar</button>
    <p id="login-erro" style="color:#FFD0D0;font-size:14px;min-height:1em"></p></form></div>`;
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#senha").value }) });
      iniciar();
    } catch (err) { $("#login-erro").textContent = err.message; }
  });
  setTimeout(() => $("#senha")?.focus(), 80);
}

// ---------- aparelho ----------
async function carregarAparelho() {
  try {
    S.cfg = await api(`/api/devices/${S.deviceId}`);
    LS.set("app_cfg", S.cfg);
    return false;
  } catch (e) {
    if (e.offline || e.auth || e.status !== 404) return false;
    await ajustesV.putDevice({ name: "Celular", persons: [], lead: 10, meals: true, updates: true, summary: { on: false, time: "06:30" }, reminders: [] });
    return true; // aparelho novo
  }
}

// ---------- parâmetros de URL (notificações, atalhos, compartilhar) ----------
async function parametros(search = location.search) {
  const q = new URLSearchParams(search);
  if (q.get("pessoa")) S.pessoa = q.get("pessoa");
  if (q.get("dia")) S.data = q.get("dia");
  if (q.get("pessoa") || q.get("dia")) { S.tab = "hoje"; render(); }
  // perguntas da Mesa proativa abrem na aba certa (e o fechamento da semana já aberto)
  if (["hoje", "semana", "compras", "saude"].includes(q.get("aba"))) { S.tab = q.get("aba"); render(); scrollTo(0, 0); }
  if (q.has("fechamento") && S.plano) saudeV.acts["fb-semana"]();
  if (q.has("atualizado")) { await carregarMeta(); await carregarPlano(); toast("Plano novo no ar ✨"); }
  if (q.has("upload")) atualizarV.abrirAtualizar();
  if (q.get("share") === "1") {
    try {
      const c = await caches.open("pf-share");
      const r = await c.match("/__shared");
      if (r) { const t = await r.text(); await c.delete("/__shared"); atualizarV.abrirAtualizar(t); }
    } catch (e) { toast("Não recebi o arquivo"); }
  }
  if ([...q.keys()].length) history.replaceState(null, "", "/");
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

// ---------- sincronização periódica ----------
let ultimoPull = 0;
async function sincronizar(forcar = false) {
  if (!forcar && Date.now() - ultimoPull < 15000) return;
  ultimoPull = Date.now();
  try {
    const antes = S.meta?.history?.[0]?.id;
    await carregarMeta();
    if (S.meta?.history?.[0]?.id !== antes) { await carregarPlano(); if (antes) toast("Plano novo no ar ✨"); }
    await log.pull();
  } catch (e) {
    if (e.auth) telaLogin();
    else if (e.locked) bloqueioV.telaBloqueio(iniciar);
    return;
  }
  bloqueioV.marcarUso();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (S.cfg && bloqueioV.vencido()) return bloqueioV.telaBloqueio(iniciar);
  sincronizar(true);
  render();
});
addEventListener("online", () => sincronizar(true));

// ---------- gestos: deslizar para os lados troca o dia (aba Hoje); puxar do topo atualiza ----------
let g = null;
const ptr = document.createElement("div");
ptr.className = "ptr";
ptr.innerHTML = icon("refresh-cw");
document.body.append(ptr);
document.addEventListener("touchstart", (e) => {
  g = null;
  if (sheetOpen() || e.touches.length !== 1 || !S.plano || e.target.closest(".days, .people, .seg, input, textarea, .kitchen, .nav")) return;
  g = { x: e.touches[0].clientX, y: e.touches[0].clientY, topo: scrollY <= 0, dx: 0, dy: 0 };
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (!g) return;
  g.dx = e.touches[0].clientX - g.x; g.dy = e.touches[0].clientY - g.y;
  if (g.topo && g.dy > 0 && Math.abs(g.dy) > Math.abs(g.dx)) {
    const p = Math.min(1, g.dy / 90);
    ptr.style.transform = `translate(-50%, ${Math.min(70, g.dy * 0.6)}px) rotate(${p * 270}deg)`;
    ptr.style.opacity = p;
  }
}, { passive: true });
document.addEventListener("touchend", async () => {
  const x = g; g = null;
  if (!x) return;
  ptr.style.opacity = 0; ptr.style.transform = "";
  if (x.topo && x.dy > 90 && Math.abs(x.dy) > Math.abs(x.dx) * 1.5) {
    ptr.classList.add("on");
    await sincronizar(true);
    ptr.classList.remove("on");
    return toast("Atualizado");
  }
  if (S.tab === "hoje" && Math.abs(x.dx) > 70 && Math.abs(x.dy) < 45) {
    const i = S.plano.dias.findIndex((d) => d.data === S.data) + (x.dx < 0 ? 1 : -1);
    const d = S.plano.dias[i];
    if (!d) return;
    S.data = d.data;
    render();
    document.querySelector(".timeline")?.animate([{ opacity: 0, transform: `translateX(${x.dx < 0 ? 24 : -24}px)` }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
  }
});
setInterval(() => { if (document.visibilityState === "visible") sincronizar(S.tab === "compras"); }, 20000);
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installPrompt = e; });

// ---------- início ----------
let swOk = false;
async function iniciar() {
  if (!swOk) { swOk = true; registrarSW(); }
  // celular que já entrou antes e ficou horas sem uso: trava antes de mostrar o que está guardado
  if (S.cfg && bloqueioV.vencido()) return bloqueioV.telaBloqueio(iniciar);
  S.pessoa = S.cfg?.viewPerson || null;
  // mostra o que já está guardado enquanto confere o servidor
  if (S.meta) await carregarPlano();
  try {
    const s = await api("/api/session");
    if (s.tz) { S.tz = s.tz; LS.set("app_tz", s.tz); }
    if (s.idleHours) LS.set("app_idle_h", s.idleHours);
    if (s.locked) return bloqueioV.telaBloqueio(iniciar);
  } catch (e) {
    if (e.auth) return telaLogin();
    S.online = false;
    render();
    parametros();
    return;
  }
  await carregarMeta();
  const novo = await carregarAparelho();
  if (!S.pessoa && S.cfg?.viewPerson) S.pessoa = S.cfg.viewPerson;
  await carregarPlano();
  log.pull().then(() => render()).catch(() => {});
  ajustesV.garantirInscricao().catch(() => {});
  bloqueioV.marcarUso();
  if (novo) { novidadesV.mostrarSeNovo({ aparelhoNovo: true }); ajustesV.abrirAjustes("celular"); }
  else if (!novidadesV.mostrarSeNovo({ depois: () => setTimeout(bloqueioV.oferecerDigital, 300) })) bloqueioV.oferecerDigital();
  parametros();
}
iniciar();
