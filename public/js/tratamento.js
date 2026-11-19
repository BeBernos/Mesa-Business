// Tratamento (ex.: berberina + alicina) e sintomas estruturados — regras puras, usadas pelo app e pelo Worker.
// Spec Mesa 3.0 §7.4. O app não pede consulta: só mostra os sinais de alerta e o que o tratamento combinou.
import { tipoRefeicao } from "./plan.js";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const REFEICOES = { cafe: "café da manhã", almoco: "almoço", lanche: "lanche", jantar: "jantar", ceia: "ceia" };
const dataValida = (d) => DATA.test(d || "") && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const str = (s, n) => String(s ?? "").trim().slice(0, n);
const dif = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** Cadastro validado ({ nome, inicio, dias, doses: [{ id, nome, quando }] }) ou null. `quando` = refeição ou "HH:MM". */
export function cfgTratamento(b) {
  if (!b || typeof b !== "object" || !str(b.nome, 60) || !dataValida(b.inicio)) return null;
  const dias = Math.round(Number(b.dias));
  const doses = (Array.isArray(b.doses) ? b.doses : [])
    .filter((d) => d && str(d.nome, 40) && (REFEICOES[d.quando] || HM.test(d.quando || "")))
    .slice(0, 8)
    .map((d, i) => ({ id: str(d.id, 16) || `d${i + 1}`, nome: str(d.nome, 40), quando: d.quando }));
  return { nome: str(b.nome, 60), inicio: b.inicio, dias: dias >= 1 ? Math.min(120, dias) : 28, doses, fim: b.fim && dataValida(b.fim) ? b.fim : null };
}

/** Em que dia do tratamento está `data`: { n, total, ultimos (3 últimos dias), acabou, antes }. */
export function diaDoTratamento(t, data) {
  const n = dif(t.inicio, data) + 1;
  return { n, total: t.dias, ultimos: n > t.dias - 3 && n <= t.dias, acabou: n > t.dias, antes: n < 1 };
}

/** Doses do dia, na ordem da hora: dose "no almoço" vai junto do almoço; sem almoço no dia, vai para o fim do dia. */
export function dosesDoDia(t, data, refeicoes = []) {
  if (!t) return [];
  const d = diaDoTratamento(t, data);
  if (d.antes || d.acabou || (t.fim && data > t.fim)) return [];
  return t.doses.map((x) => {
    if (HM.test(x.quando)) return { ...x, refeicao: null, hora: x.quando };
    const m = refeicoes.find((r) => tipoRefeicao(r) === x.quando);
    return { ...x, refeicao: m ? m.id : null, hora: m ? m.hora : "23:59" };
  }).sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));
}

export const SINTOMAS = { inchaco: "Inchaço / distensão", gases: "Gases", dor: "Dor ou cólica", refluxo: "Refluxo / arroto", cansaco: "Cansaço ou névoa", outro: "Outro" };
export const ALERTAS = { sangue: "Sangue nas fezes", peso: "Perda de peso sem querer", febre: "Febre", dornoite: "Dor que acorda à noite" };
export const INTENSIDADES = { leve: "leve", media: "média", forte: "forte" };
const NIVEL_ANTIGO = { leve: "leve", moderado: "media", forte: "forte" };
export const NIVEL_PARA_ANTIGO = { leve: "leve", media: "moderado", forte: "forte" };

/** Lê um registro de sintoma (formato novo ou antigo { texto, nivel, hora }). */
export function lerSintoma(v) {
  let o = {};
  try { o = JSON.parse(v) || {}; } catch (e) { o = { texto: String(v || "") }; }
  const tipo = SINTOMAS[o.tipo] || ALERTAS[o.tipo] ? o.tipo : null;
  // sinal de alerta não tem intensidade (ninguém escolheu uma)
  const intensidade = ALERTAS[o.tipo] ? null : INTENSIDADES[o.intensidade] ? o.intensidade : NIVEL_ANTIGO[o.nivel] || null;
  const nome = tipo ? SINTOMAS[tipo] || ALERTAS[tipo] : "";
  const texto = o.tipo ? str(o.detalhe ?? "", 200) : str(o.texto, 200);
  return { tipo, intensidade, hora: HM.test(o.hora || "") ? o.hora : "", texto, alerta: !!ALERTAS[tipo],
    rotulo: [nome, texto].filter(Boolean).join(": ") + (intensidade ? ` (${INTENSIDADES[intensidade]})` : "") };
}

/** Sinais de alerta anotados nos últimos 14 dias (os mais novos primeiro). linhas: registro { kind, day, v }. */
export function alertasRecentes(linhas, hoje) {
  return linhas.filter((l) => l.kind === "symptom" && dif(l.day, hoje) <= 14 && dif(l.day, hoje) >= 0)
    .map((l) => ({ dia: l.day, ...lerSintoma(l.v) })).filter((s) => s.alerta).sort((a, b) => (a.dia < b.dia ? 1 : -1));
}
