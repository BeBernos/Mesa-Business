// Este celular no servidor: cadastro do aparelho, notificações (Web Push), próximos avisos, conector do Claude e sair.
// Só lógica — a tela fica em public/v3/views/ajustes.js.
import { S } from "./state.js";
import { api, LS, log } from "./sync.js";

export const PRESETS = [
  { text: "Montar a marmita de amanhã", time: "21:30", days: [1, 2] },
  { text: "Preparo em lote da semana", time: "09:00", days: [0] },
  { text: "Conferir a lista de compras", time: "09:00", days: [6] },
  { text: "Pesar em jejum", time: "07:00", days: [6] },
  { text: "Beber água", time: "15:00", days: [0, 1, 2, 3, 4, 5, 6] },
];
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** Grava o cadastro do aparelho (S.cfg + patch) e devolve o que o servidor guardou. */
export async function putDevice(patch = {}) {
  const body = { ...(S.cfg || {}), ...patch };
  delete body.hasPush;
  delete body.sub;
  if (patch.sub) body.sub = patch.sub;
  const saved = await api(`/api/devices/${S.deviceId}`, { method: "PUT", body: JSON.stringify(body) });
  S.cfg = saved;
  LS.set("app_cfg", saved);
  return saved;
}

/** Primeiro uso neste celular: cadastra o aparelho com os padrões (avisos de refeição, plano novo; sem pessoas ainda). */
export const criarAparelho = () => putDevice({ name: "Celular", persons: [], lead: 10, meals: true, updates: true, summary: { on: false, time: "06:30" }, reminders: [] });

export const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const permissao = () => (pushSuportado() ? Notification.permission : "unsupported");

/** Mantém a inscrição de push deste celular no servidor (o navegador às vezes troca sozinho). */
export async function garantirInscricao(forcar = false) {
  if (!pushSuportado() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api("/api/vapid");
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && b64u(sub.options.applicationServerKey) !== publicKey) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey) });
  const j = sub.toJSON();
  if (forcar || LS.get("app_endpoint", "") !== j.endpoint || !S.cfg?.hasPush) {
    await putDevice({ sub: j });
    LS.set("app_endpoint", j.endpoint);
  }
}

/** Pede a permissão e liga as notificações. Devolve uma mensagem para mostrar. */
export async function ativarPush() {
  if (!pushSuportado()) return "Este navegador não suporta notificações. Abra no Chrome.";
  if ((await Notification.requestPermission()) !== "granted") return "Sem permissão para notificar";
  try { await garantirInscricao(true); return "Notificações ativadas 🔔"; } catch (e) { return "Falhou: " + e.message; }
}

export const proximosAvisos = () => api(`/api/devices/${S.deviceId}/upcoming`);
export const testarAviso = () => api(`/api/devices/${S.deviceId}/test`, { method: "POST" });
export const aparelhosDaFamilia = () => api("/api/devices");
export const enderecoClaude = async (novo = false) => (await api("/api/mcp", novo ? { method: "POST" } : {})).url;

/** Sai deste celular: apaga o aparelho, a inscrição de push, a sessão e o que está guardado aqui. */
export async function sair() {
  try { await api(`/api/devices/${S.deviceId}`, { method: "DELETE" }); } catch (e) {}
  try { const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch (e) {}
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  ["app_cfg", "app_meta", "app_endpoint", "app_passkey", "app_ativo", "app_plano_norm"].forEach(LS.del);
  log.reset();
  location.replace("/v3/");
}
