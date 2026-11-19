// Utilitários compartilhados: escape, ícones, markdown leve, toast simples e o temporizador do modo cozinha.

export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const icon = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="/img/icons.svg#i-${n}"/></svg>`;
export const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

/** **negrito**, parágrafos e quebras de linha — o suficiente para as notas do plano. */
export function md(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`)
    .join("");
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
