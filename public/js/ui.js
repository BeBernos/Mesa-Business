// Pequenos utilitários de interface: escape, ícones, markdown leve, folhas, toast.

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const icon = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="/img/icons.svg#i-${n}"/></svg>`;
export const fmt = (n) => (n == null ? "–" : Math.round(n).toLocaleString("pt-BR"));
export const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

/** **negrito**, parágrafos e quebras de linha — o suficiente para as notas do plano. */
export function md(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export const ICON_REFEICAO = { cafe: "coffee", almoco: "utensils", jantar: "moon", lanche: "apple", ceia: "cookie", treino: "dumbbell" };
export const ICON_CATEGORIA = { "Açougue": "beef", "Peixaria": "beef", "Hortifruti": "carrot", "Laticínios": "milk", "Padaria": "sandwich", "Mercearia": "wheat", "Congelados": "package", "Suplementos": "pill", "Farmácia": "pill" };

export function ring(pct, big, of, size = 124) {
  const r = 52, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 124 124"><circle class="trk" cx="62" cy="62" r="${r}"/>
    <circle class="bar" cx="62" cy="62" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}"/></svg>
    <div class="mid"><div class="big">${big}</div><div class="of">${of}</div></div></div>`;
}

let toastTimer;
/** Aviso rápido embaixo. Com `acao` ({ rotulo, fn }) ganha um botão (ex.: "Desfazer") e fica mais tempo. */
export function toast(msg, ms = 2600, acao = null) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("act", !!acao);
  if (acao) {
    const b = document.createElement("button");
    b.textContent = acao.rotulo;
    b.onclick = () => { t.classList.remove("on"); acao.fn(); };
    t.append(b);
  }
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), acao ? Math.max(ms, 5000) : ms);
}

// ---------- folhas ----------
const stack = [];
export function openSheet(html, { full = false, onClose, voltar, lado = false } = {}) {
  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const sheet = document.createElement("section");
  sheet.className = "sheet" + (full ? " full" : "") + (lado ? " lado" : "");
  if (lado) { scrim.classList.add("lado"); document.body.classList.add("com-lado"); }
  sheet.setAttribute("role", "dialog");
  sheet.innerHTML = (full ? "" : `<div class="grab"></div>`) + html;
  document.body.append(scrim, sheet);
  const entry = { scrim, sheet, onClose, voltar, extra: 0 };
  stack.push(entry);
  scrim.addEventListener("click", () => closeSheet());
  history.pushState({ sheet: stack.length }, "");
  dragToClose(sheet);
  return sheet;
}
export function closeSheet(fromPop = false) {
  const e = stack.pop();
  if (!e) return;
  e.sheet.classList.add("closing");
  e.scrim.classList.add("closing");
  setTimeout(() => { e.sheet.remove(); e.scrim.remove(); }, 220);
  if (e.sheet.classList.contains("lado")) document.body.classList.remove("com-lado");
  if (e.onClose) e.onClose();
  if (!fromPop) history.go(-1 - e.extra);
}
/** Página dentro da folha (ex.: um assunto dos Ajustes): o "voltar" do Android chama `voltar` da folha em vez de fechá-la. */
export function entrarSub() {
  const e = stack[stack.length - 1];
  if (!e) return;
  e.extra++;
  history.pushState({ sub: e.extra }, "");
}
export const sheetOpen = () => stack.length > 0;
export const topSheet = () => stack[stack.length - 1]?.sheet || null;
addEventListener("popstate", () => {
  const e = stack[stack.length - 1];
  if (e?.extra) { e.extra--; e.voltar?.(); return; }
  if (stack.length) closeSheet(true);
});

function dragToClose(sheet) {
  if (sheet.classList.contains("full")) return;
  let y0 = null, dy = 0;
  const grab = (e) => e.target.closest(".grab, .sh");
  sheet.addEventListener("touchstart", (e) => { if (grab(e)) { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = "none"; } }, { passive: true });
  sheet.addEventListener("touchmove", (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener("touchend", () => {
    if (y0 === null) return;
    sheet.style.transition = "transform .2s"; y0 = null;
    if (dy > 110) closeSheet(); else sheet.style.transform = "";
  });
}

export function sheetHead(title, sub = "") {
  return `<div class="sh"><div><div class="h2">${title}</div>${sub ? `<div class="muted" style="font-size:13.5px;margin-top:2px">${sub}</div>` : ""}</div>
    <button class="icon-btn" data-act="close-sheet" aria-label="Fechar">${icon("x")}</button></div>`;
}

// ---------- temporizador do modo cozinha (botão "⏱ 20 min" no passo) ----------
// shortcut: conta na própria página (com a tela acesa no modo cozinha); com o app fechado o aviso pode atrasar — se incomodar, agendar pelo Worker.
const timers = new Map();
export function alternarTimer(btn, min, rotulo) {
  const id = btn.dataset.timer;
  if (timers.has(id)) { clearInterval(timers.get(id)); timers.delete(id); btn.classList.remove("on"); btn.innerHTML = `${icon("timer", "sm")}${min} min`; return; }
  const fim = Date.now() + min * 60000;
  btn.classList.add("on");
  const tique = async () => {
    const r = Math.max(0, Math.round((fim - Date.now()) / 1000));
    btn.innerHTML = `${icon("pause", "sm")}${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
    if (r > 0) return;
    clearInterval(timers.get(id)); timers.delete(id);
    btn.classList.remove("on"); btn.innerHTML = `${icon("check", "sm")}pronto`;
    buzz([300, 120, 300, 120, 300]);
    toast(`⏱ Pronto: ${rotulo}`, 8000);
    try { if (Notification.permission === "granted") (await navigator.serviceWorker.ready).showNotification("⏱ Pronto", { body: rotulo, tag: `timer-${id}`, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", vibrate: [300, 120, 300] }); } catch (e) {}
  };
  timers.set(id, setInterval(tique, 1000));
  tique();
}
/** Passo de preparo com o botão de temporizador quando o texto fala em minutos. html = conteúdo do passo; attrs = atributos do botão do passo. */
export function passo(html, texto, id, attrs) {
  const min = (/(\d{1,3})\s*(?:a\s*\d{1,3}\s*)?(?:min|minutos)\b/i.exec(texto) || [])[1];
  return `<button class="step" ${attrs}>${html}</button>${min ? `<button class="timer-btn" data-act="timer" data-timer="${id}" data-min="${+min}" data-rotulo="${esc(String(texto).slice(0, 80))}" aria-label="Temporizador de ${+min} minutos">${icon("timer", "sm")}${+min} min</button>` : ""}`;
}
