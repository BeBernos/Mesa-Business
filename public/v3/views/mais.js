// Botão "+" da Hoje (spec §7.4): anotar na hora um sintoma, um sinal de alerta, um efeito colateral do tratamento
// ou um copo d'água. E o tratamento da pessoa (cadastro no servidor, cópia no celular para funcionar offline).
import { S, rerender, agoraMin, hoje } from "../../js/state.js";
import { log, api, LS } from "../../js/sync.js";
import { somarAgua } from "../../js/acoes.js";
import { SINTOMAS, ALERTAS, INTENSIDADES, NIVEL_PARA_ANTIGO, diaDoTratamento } from "../../js/tratamento.js";
import { esc, icon, abrirFolha, fecharFolha, toast } from "../ui.js";

// ---------- tratamento: o que o servidor tem, com cópia local ----------
const trats = new Map();
const buscando = new Set();
/** Tratamento da pessoa (null = nenhum). Primeira chamada usa a cópia do celular e pede o do servidor. */
export function tratamentoDe(pid) {
  if (!trats.has(pid)) trats.set(pid, LS.get(`v3_trat_${pid}`, null));
  if (!buscando.has(pid)) {
    buscando.add(pid);
    api(`/api/tratamento/${encodeURIComponent(pid)}`).then((t) => { guardarTrat(pid, t); rerender(); }).catch(() => {});
  }
  return trats.get(pid);
}
export function guardarTrat(pid, t) { trats.set(pid, t || null); LS.set(`v3_trat_${pid}`, t || null); }
/** Tratamento em curso no dia aberto (nem antes do início, nem depois do fim). */
export function tratamentoAtivo(pid, data = S.data) {
  const t = tratamentoDe(pid);
  if (!t) return null;
  const d = diaDoTratamento(t, data);
  return d.antes || d.acabou || (t.fim && data > t.fim) ? null : t;
}

// ---------- folha do + ----------
let F = null;
const agoraHM = () => { const m = agoraMin(); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const crianca = () => !!S.plano.pessoas.find((x) => x.id === S.pessoa)?.crianca;

function opcoes() {
  const linha = (act, ic, t, sub) => `<button class="row" data-act="${act}">${icon(ic)}<span class="grow"><div>${t}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</span>${icon("chevron-right")}</button>`;
  return `<h2 class="h2">Anotar agora</h2><div class="rows" style="margin-top:.75rem">
    ${linha("mais-sintoma", "heart-pulse", "Sintoma", "Inchaço, gases, dor, refluxo, cansaço…")}
    ${tratamentoAtivo(S.pessoa) ? linha("mais-efeito", "pill", "Efeito colateral do tratamento") : ""}
    ${crianca() ? "" : linha("mais-agua", "droplet", "Um copo d'água", "+250 ml")}
    ${linha("mais-alerta", "triangle-alert", "Sinal de alerta", "Sangue nas fezes, febre, perda de peso, dor à noite")}</div>`;
}

function formSintoma() {
  const tipos = F.alerta ? ALERTAS : SINTOMAS;
  return `<small class="muted">${F.alerta ? "Sinal de alerta" : "Sintoma"} · ${esc(S.plano.pessoas.find((x) => x.id === S.pessoa)?.nome || "")}</small>
    <h2 class="h2">${F.alerta ? "O que aconteceu?" : "O que você está sentindo?"}</h2>
    <div class="chips">${Object.entries(tipos).map(([k, l]) => `<button class="chip ${F.tipo === k ? "on" : ""}" data-act="sint-tipo" data-v="${k}" aria-pressed="${F.tipo === k}">${l}</button>`).join("")}</div>
    ${F.alerta ? "" : `<div class="sec"><span>Intensidade</span></div><div class="chips">${Object.entries(INTENSIDADES).map(([k, l]) =>
      `<button class="chip ${F.int === k ? "on" : ""}" data-act="sint-int" data-v="${k}" aria-pressed="${F.int === k}">${l}</button>`).join("")}</div>`}
    <div class="sec"><span>Quando e detalhes</span></div>
    <div class="lado2"><input class="input" name="detalhe" placeholder="Opcional: o que comeu antes, onde dói…" maxlength="200" value="${esc(F.texto)}" aria-label="Detalhes">
      <input class="input" type="time" name="hora" value="${esc(F.hora)}" aria-label="Hora"></div>
    ${F.alerta ? `<p class="muted" style="margin-top:.75rem">A Mesa não substitui consulta: sinal de alerta pede avaliação de um médico.</p>` : ""}
    <div class="foot"><button class="btn" data-act="mais-fechar">Cancelar</button><button class="btn cta" data-act="sint-salvar" ${F.tipo ? "" : "disabled"}>Anotar</button></div>`;
}

const formEfeito = () => `<small class="muted">Tratamento · ${esc(tratamentoAtivo(S.pessoa)?.nome || "")}</small><h2 class="h2">Efeito colateral</h2>
  <input class="input" name="efeito" placeholder="Ex.: enjoo leve depois do almoço" maxlength="200" aria-label="Efeito colateral" style="margin-top:.75rem">
  <div class="foot"><button class="btn" data-act="mais-fechar">Cancelar</button><button class="btn cta" data-act="efeito-salvar">Anotar</button></div>`;

function pintar(html) {
  const d = document.querySelector("dialog.folha[open]");
  if (!d) return;
  const t = d.querySelector("#toast");
  d.innerHTML = html;
  if (t) d.append(t);
}
// os campos de texto não redesenham a folha (para não perder o foco); só guardam
addEventListener("input", (e) => {
  if (!F || !e.target.closest("dialog.folha")) return;
  if (e.target.name === "detalhe") F.texto = e.target.value;
  if (e.target.name === "hora") F.hora = e.target.value;
});

export const acts = {
  mais: () => { F = null; abrirFolha(opcoes(), { aoFechar: () => { F = null; rerender(); } }); },
  "mais-fechar": () => fecharFolha(),
  "mais-sintoma": () => { F = { alerta: false, tipo: null, int: "leve", hora: agoraHM(), texto: "" }; pintar(formSintoma()); },
  "mais-alerta": () => { F = { alerta: true, tipo: null, int: "forte", hora: agoraHM(), texto: "" }; pintar(formSintoma()); },
  "mais-efeito": () => { F = { efeito: true }; pintar(formEfeito()); },
  "mais-agua": () => { const data = hoje(), { pessoa } = S; somarAgua(data, pessoa, 250); fecharFolha(); toast("+250 ml de água", () => somarAgua(data, pessoa, -250)); },
  "sint-tipo": (b) => { F.tipo = b.dataset.v; pintar(formSintoma()); },
  "sint-int": (b) => { F.int = b.dataset.v; pintar(formSintoma()); },
  "sint-salvar": () => {
    if (!F?.tipo) return;
    const data = hoje(), { pessoa } = S, k = Date.now().toString(36); // o + anota agora, no dia de hoje
    const nome = SINTOMAS[F.tipo] || ALERTAS[F.tipo];
    // tipo/intensidade/detalhe (novo) + texto/nivel (o proativo e o comida × sintoma leem assim)
    log.set("symptom", data, pessoa, k, JSON.stringify({ tipo: F.tipo, intensidade: F.alerta ? null : F.int, hora: F.hora, detalhe: F.texto.trim(),
      texto: [nome, F.texto.trim()].filter(Boolean).join(": "), ...(F.alerta ? {} : { nivel: NIVEL_PARA_ANTIGO[F.int] }) }));
    const alerta = F.alerta;
    fecharFolha();
    toast(alerta ? "Anotado. Sinal de alerta: procure um médico." : `Anotado: ${nome.toLowerCase()}`, () => log.del("symptom", data, pessoa, k));
  },
  "efeito-salvar": () => {
    const t = document.querySelector("dialog.folha [name=efeito]")?.value.trim();
    if (!t) return toast("Escreva o que sentiu");
    const data = hoje(), { pessoa } = S, k = Date.now().toString(36); // o + anota agora, no dia de hoje
    log.set("sideeffect", data, pessoa, k, JSON.stringify({ texto: t.slice(0, 200), hora: agoraHM() }));
    fecharFolha();
    toast("Efeito anotado", () => log.del("sideeffect", data, pessoa, k));
  },
  dose: (b) => {
    const { data, pessoa } = S, k = b.dataset.k;
    const on = log.get("dose", data, pessoa, k)?.v === "1";
    if (on) log.del("dose", data, pessoa, k); else log.set("dose", data, pessoa, k, "1");
    toast(on ? "Dose desmarcada" : "Dose anotada", () => (on ? log.set("dose", data, pessoa, k, "1") : log.del("dose", data, pessoa, k)));
  },
};

