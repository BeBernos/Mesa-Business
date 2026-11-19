// Diário (Mesa 3.0, spec §7.4–7.6): fechamento do dia e da semana, sintomas por semana e o pedido de análise ao Claude.
// Regras puras, usadas pelo app e testadas no node --test.
import { SINTOMAS } from "./tratamento.js";

const str = (s, n) => String(s ?? "").trim().slice(0, n);
const entre = (v, a, b) => (Number.isInteger(v) && v >= a && v <= b ? v : null);
export const HUMORES = { bem: "😊", mais_ou_menos: "😐", mal: "😣" };
export const FOMES = { pouca: "pouca", bem: "na medida", muita: "muita" };

/** Fechamento do dia validado: { humor, fome, texto, sintomas: { tipo: 0–3 }, bristol 1–7, energia 1–5 }. */
export function lerDia(v) {
  let o = {};
  try { o = (typeof v === "string" ? JSON.parse(v) : v) || {}; } catch (e) { o = {}; }
  const sintomas = {};
  for (const [k, n] of Object.entries(o.sintomas || {})) if (SINTOMAS[k] && Number.isFinite(Number(n))) sintomas[k] = Math.max(0, Math.min(3, Math.round(Number(n))));
  return { humor: HUMORES[o.humor] ? o.humor : null, fome: FOMES[o.fome] ? o.fome : null, texto: str(o.texto, 280), sintomas,
    bristol: entre(Number(o.bristol), 1, 7), energia: entre(Number(o.energia), 1, 5) };
}

/** Soma das notas 0–3 dos sintomas no fechamento do dia (0 = nada). */
export const notaSintomasDia = (f) => Object.values(f?.sintomas || {}).reduce((a, n) => a + (Number(n) || 0), 0);

/** Segunda-feira da semana de `data` (semana de segunda a domingo). */
export function segundaDe(data) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Média da nota de sintomas por semana, só dos dias fechados: [{ semana, media, dias }] em ordem. */
export function mediasPorSemana(dias) {
  const por = new Map();
  for (const d of dias) {
    if (!d.fechamento) continue;
    const s = segundaDe(d.data);
    if (!por.has(s)) por.set(s, []);
    por.get(s).push(notaSintomasDia(d.fechamento));
  }
  return [...por.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([semana, ns]) => ({ semana, media: Math.round((ns.reduce((a, n) => a + n, 0) / ns.length) * 10) / 10, dias: ns.length }));
}

const mais = (data, n) => new Date(Date.parse(data + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Piorou 3 semanas seguidas (spec: "piora por 3 semanas → procure um médico"): as 4 últimas semanas completas,
 *  uma atrás da outra, com pelo menos 3 dias fechados cada, subindo toda semana e pelo menos 1,5 ponto no total. */
export function piorouTresSemanas(ms, hoje) {
  const atual = segundaDe(hoje);
  const u = ms.filter((s) => s.semana < atual && s.dias >= 3).slice(-4);
  if (u.length < 4) return false;
  const seguidas = u.every((s, i) => i === 0 || s.semana === mais(u[i - 1].semana, 7));
  const subindo = u.every((s, i) => i === 0 || s.media > u[i - 1].media);
  return seguidas && subindo && u[3].media - u[0].media >= 1.5;
}

/** Que semana fechar agora: na segunda de manhã, a anterior se ainda estiver aberta; senão, a atual.
 *  O fechamento fica guardado no domingo que termina a semana (`ate`). fechada(ate) diz se já existe. */
export function semanaParaFechar(data, minutos, fechada) {
  const seg = segundaDe(data);
  if (seg === data && minutos < 12 * 60 && !fechada(mais(seg, -1))) return { de: mais(seg, -7), ate: mais(seg, -1) };
  return { de: seg, ate: mais(seg, 6) };
}

/** Pedido já escrito para o Claude (com o conector da Mesa ligado no claude.ai). */
export function pedidoDeAnalise({ nome, de, ate }) {
  return `Analise ${nome === "família" ? "a semana da família" : `a semana de ${nome}`} na Mesa (${de} a ${ate}). ` +
    "Use contexto_da_familia para ler os fechamentos do dia e da semana, adesão, água, sintomas, tratamento e doses. " +
    "Diga em linguagem simples o que funcionou, o que não funcionou e o que mudar na próxima semana. " +
    "Depois grave a análise no app com gravar_analise (primeiro com so_validar=true, mostre o texto e só grave depois que eu confirmar).";
}

/** Abre o Claude com o pedido escrito (a pessoa só envia). */
export const linkClaude = (texto) => `https://claude.ai/new?q=${encodeURIComponent(String(texto).slice(0, 1500))}`;
