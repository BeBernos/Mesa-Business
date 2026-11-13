// Estado compartilhado entre as telas.
import { LS, log } from "./sync.js";
import { pessoaDe, diaDe, metaDoDia, totais, somaDias, consumido, lerAgendaPulse, tipoPeloPulse } from "./plan.js";

export const S = {
  tz: LS.get("app_tz", "America/Sao_Paulo"),
  deviceId: null,
  cfg: LS.get("app_cfg", null), // configuração deste celular
  meta: LS.get("app_meta", null), // histórico de planos vindo do servidor
  plano: null, // plano normalizado em exibição
  planoInfo: null, // entrada do histórico do plano em exibição
  viewing: null, // id de um plano antigo sendo visto
  tab: "hoje",
  pessoa: null,
  data: null,
  online: true,
  installPrompt: null,
  devices: null,
  upcoming: null,
  theme: LS.get("app_theme", "auto"),
};

let renderFn = () => {};
export const setRender = (f) => { renderFn = f; };
export const rerender = () => renderFn();

export const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: S.tz });
export function agoraMin() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: S.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const [h, m] = p.split(":").map(Number);
  return h * 60 + m;
}
export const minDe = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

export const pessoa = () => (S.plano ? pessoaDe(S.plano, S.pessoa) : null);
export const dia = () => (S.plano ? diaDe(S.plano, S.data) : null);
// Rafael, Marina e Theo têm cores afinadas para claro/escuro no CSS; outras pessoas usam a cor do plano.
export const cor = (pid) => (["rafael", "marina", "theo"].includes(pid) ? `var(--${pid})` : S.plano?.pessoas.find((p) => p.id === pid)?.cor || "var(--rafael)");

export const comeu = (data, pid, mealId) => !!log.get("eaten", data, pid, mealId);
/** O que ficou de fora da refeição (registro "partial"): { fora: [nomes], outra: texto, outraKcal }. */
export function parcial(data, pid, mealId) {
  const r = log.get("partial", data, pid, mealId);
  try { return r ? JSON.parse(r.v) : null; } catch (e) { return null; }
}
/** Peso mais recente registrado (kg) — o espelho do Pulse — ou null. */
export function pesoRecente(pid) {
  const r = log.all("weight", (x) => x.person === pid && Number(x.v) > 0).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  return r ? Number(r.v) : null;
}
/** Agenda de treino que o Pulse mandou para o dia (treino com horário, descanso) ou null. */
export const agendaPulse = (data, pid) => lerAgendaPulse(log.get("pulse", data, pid)?.v);
export function treinou(data, pid) {
  const r = log.get("trained", data, pid);
  return r ? r.v !== "0" : true;
}

/** A opção escolhida para a refeição naquele dia (0 = a do plano). Mantém o id para o "comi" continuar valendo. */
export function escolhida(data, pid, m) {
  const i = +(log.get("swap", data, pid, m.id)?.v || 0);
  const alt = i > 0 && m.alternativas?.[i - 1];
  return alt ? { ...alt, id: m.id, alternativas: m.alternativas, escolha: i } : { ...m, escolha: 0 };
}

/** Resumo de um dia para uma pessoa: refeições, metas, consumido. */
export function resumoDia(data, pid) {
  const d = diaDe(S.plano, data);
  const ms = ((d && d.refeicoes[pid]) || []).map((m) => escolhida(data, pid, m));
  const pulse = agendaPulse(data, pid);
  const tipo = tipoPeloPulse(d ? d.tipo[pid] : "T", pulse);
  const naoTreinou = d && d.seNaoTreinar[pid] && !treinou(data, pid);
  const meta = metaDoDia(S.plano, pid, naoTreinou ? "D" : tipo);
  const feito = totais(ms.filter((m) => comeu(data, pid, m.id)).map((m) => {
    const p = parcial(data, pid, m.id);
    return p ? consumido(m, p.fora || [], p.outraKcal) : m;
  }));
  return { dia: d, refeicoes: ms, tipo, meta, plano: totais(ms), feito, naoTreinou, pulse };
}

/** Data inicial: hoje se estiver no plano, senão o dia mais próximo. */
export function dataInicial(plano) {
  const h = hoje();
  if (!plano || !plano.dias.length) return h;
  if (h < plano.dias[0].data) return plano.dias[0].data;
  if (h > plano.dias[plano.dias.length - 1].data) return plano.dias[plano.dias.length - 1].data;
  return plano.dias.some((d) => d.data === h) ? h : somaDias(h, 0);
}
