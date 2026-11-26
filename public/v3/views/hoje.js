// Hoje: um dia = uma linha do tempo. Anéis, garrafa, macros, avisos do dia, refeições (tocar no corpo abre a ficha,
// tocar no círculo marca, segurar abre as ações), preparo e regras. Grava pelas regras de js/acoes.js.
import { S, hoje, agoraMin, minDe, resumoDia, comeu, pesoRecente, rerender, treinou } from "../../js/state.js";
import { log } from "../../js/sync.js";
import { md } from "../../js/ui.js";
import { foto, restaurar, alternarComi, somarAgua } from "../../js/acoes.js";
import { extraDoCartao, aceiteBotoes } from "./ficha.js";
import { urso, boneco, ceu } from "../desenhos.js";
import { dosesDoDia, diaDoTratamento, lerSintoma, alertasRecentes, REFEICOES } from "../../js/tratamento.js";
import { tratamentoAtivo, tratamentoDe, guardarTrat } from "./mais.js";
import { analisesDe, semanaAFechar } from "./diario.js";
import { api } from "../../js/sync.js";
import { DIAS_SEMANA, DIAS_LONGOS, MESES, diaSemana, somaDias, difDias, fmtQtd, metaAgua, horaPeloPulse, testesDoDia, destaqueDe } from "../../js/plan.js";
import { esc, icon, aneis, garrafa, macros, dias, refeicao, cartaoDaVez, linhaDoTempo, toast, topo, abrirFolha, nota } from "../ui.js";

const saudacao = () => { const h = agoraMin() / 60; return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());
const dataLonga = (d) => `${cap(DIAS_LONGOS[diaSemana(d)])}, ${+d.slice(8, 10)} ${MESES[+d.slice(5, 7) - 1]}`;
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** A semana (seg–dom) do dia aberto, só com os dias que estão no plano. */
function semana() {
  const seg = somaDias(S.data, -((diaSemana(S.data) + 6) % 7));
  const h = hoje();
  return Array.from({ length: 7 }, (_, i) => somaDias(seg, i))
    .filter((d) => S.plano.dias.some((x) => x.data === d))
    .map((d) => ({ data: d, rotulo: cap(DIAS_SEMANA[diaSemana(d)].slice(0, 3).toLowerCase()), n: +d.slice(8, 10), past: d < h }));
}

/** Dias seguidos com a água na meta, até o dia aberto (ele conta se já bateu). */
function sequenciaAgua(meta) {
  const bateu = (d) => Number(log.get("water", d, S.pessoa)?.v || 0) >= meta;
  let n = bateu(S.data) ? 1 : 0;
  for (let i = 1; i < 90 && bateu(somaDias(S.data, -i)); i++) n++;
  return n;
}

const aviso = (corpo, tom = "") => `<div class="glass card aviso-dia ${tom}">${corpo}</div>`;

/** Próximo plano já publicado (dá para ver antes de começar), ou o atual acabando. */
function proximoPlano() {
  if (!S.planoInfo || !S.meta?.history) return "";
  const h = hoje();
  const prox = S.meta.history.filter((p) => p.kind === "v2" && p.from > h && p.id !== S.planoInfo.id).sort((a, b) => (a.from < b.from ? -1 : 1))[0];
  if (prox) {
    const n = difDias(h, prox.from);
    return aviso(`<b>O plano de ${MESES_LONGOS[+prox.from.slice(5, 7) - 1]} já chegou.</b> Começa ${n === 1 ? "amanhã" : `em ${n} dias`} (${+prox.from.slice(8, 10)}/${prox.from.slice(5, 7)}).
      <button class="btn txt" data-act="ver-plano" data-id="${esc(prox.id)}">Ver o plano</button>`);
  }
  const faltam = S.planoInfo.to ? difDias(h, S.planoInfo.to) : 99;
  return faltam >= 0 && faltam <= 3 ? aviso(`<b>O plano acaba ${faltam === 0 ? "hoje" : faltam === 1 ? "amanhã" : `em ${faltam} dias`}.</b> Peça o próximo ao Claude pelo conector.`, "alerta") : "";
}

/** Sinal de alerta anotado nos últimos 14 dias: não bloqueia nada, só diz com clareza para procurar um médico. */
function alertaMedico() {
  const a = alertasRecentes(log.all("symptom", (x) => x.person === S.pessoa), hoje())[0];
  return a ? aviso(`<b>${esc(a.rotulo)} em ${a.dia.slice(8, 10)}/${a.dia.slice(5, 7)}.</b> Isso pede avaliação: procure um médico. A dieta e o tratamento não substituem a consulta.`, "alerta medico") : "";
}

/** Análise do Claude ainda não lida: cartão na Hoje até abrir. */
function cartaoAnalise() {
  const a = analisesDe(S.pessoa).find((x) => !x.lida);
  return a ? aviso(`<div class="lado-a-lado"><span><b>${esc(a.titulo)}</b><br>O Claude deixou uma análise para você.</span><button class="btn cta" data-act="ler-analise" data-id="${esc(a.id)}">Ler</button></div>`) : "";
}

/** A partir das 21:30: "Como foi o dia?"; domingo a partir das 20:00: "Como foi a semana?" (adultos). */
function fecharDiaOuSemana(p, futuro) {
  if (p.crianca || futuro || S.data !== hoje()) return "";
  const agora = agoraMin(), out = [];
  if (agora >= 21 * 60 + 30 && !log.get("day", S.data, S.pessoa)) out.push(aviso(`<div class="lado-a-lado"><b>Como foi o dia?</b><button class="btn cta" data-act="fechar-dia">Fechar o dia</button></div>`));
  const sem = semanaAFechar(S.pessoa);
  const horaDaSemana = (diaSemana(S.data) === 0 && agora >= 20 * 60) || sem.ate < S.data; // domingo à noite, ou segunda de manhã com a anterior aberta
  if (horaDaSemana && !log.get("week", sem.ate, S.pessoa)) out.push(aviso(`<div class="lado-a-lado"><b>Como foi a semana?</b><button class="btn" data-act="fechar-semana">Fechar a semana</button></div>`));
  return out.join("");
}

/** Cartão "Tratamento · dia X de N"; nos 3 últimos dias pergunta o que fazer. */
function cartaoTratamento() {
  const t = tratamentoAtivo(S.pessoa);
  if (!t) return "";
  const d = diaDoTratamento(t, S.data);
  const berberina = /berberina/i.test(t.nome) ? `<details class="info"><summary>Sobre a berberina</summary>Tomar junto com comida; usar por prazo definido; interage com remédios de uso contínuo (diabetes, pressão, anticoagulantes, entre outros) — se usa algum, confirme com o médico ou farmacêutico.</details>` : "";
  const pergunta = d.ultimos ? `<p style="margin:.625rem 0 .375rem">Faltam ${d.total - d.n + 1} dia(s). Como estão os sintomas? O que fazer depois?</p>
    <div class="go"><button class="btn" data-act="trat-estender">Estender 2 semanas</button><button class="btn" data-act="trat-parar">Parar no fim</button><button class="btn" data-act="trat-reintro">Começar a reintrodução</button></div>` : "";
  return `<div class="glass card trat"><div class="lado-a-lado"><b>Tratamento · dia ${d.n} de ${d.total}</b><span class="muted">${esc(t.nome)}</span></div>
    <i class="barra" style="--p:${Math.min(1, d.n / d.total)}"></i>${pergunta}${berberina}</div>`;
}

function avisosDoDia(r, p, futuro) {
  const out = [alertaMedico(), cartaoAnalise(), fecharDiaOuSemana(p, futuro), cartaoTratamento(), proximoPlano()];
  if (p.crianca && p.restricoes.length) out.push(`<div class="balao-urso">${urso("oi", 44)}<div class="balao"><b>${esc(p.restricoes.join(" · "))}</b><br>Vale para tudo o que ${esc(p.nome)} comer, também fora do plano.</div></div>`);
  const ctx = r.dia.contexto[S.pessoa];
  if (ctx) out.push(aviso(esc(ctx)));
  const destaque = destaqueDe(r.dia.destaque, testesDoDia(S.plano, S.data, S.pessoa).length > 0);
  if (destaque) out.push(aviso(esc(destaque)));
  for (const a of r.dia.avisos.filter((a) => !a.pessoa || a.pessoa === S.pessoa)) out.push(aviso(`${a.titulo ? `<b>${esc(a.titulo)}</b>` : ""}${md(a.texto)}`, a.tom === "alerta" ? "alerta" : ""));
  if (!r.dia.avisos.length) for (const { teste, dose } of testesDoDia(S.plano, S.data, S.pessoa)) {
    out.push(aviso(`<b>Teste · ${esc(teste.alimento || teste.grupo)} · dose ${dose.n}/${teste.doses.length}</b><br>${esc(dose.texto || dose.quantidade)}`, "alerta"));
  }
  if (r.dia.seNaoTreinar[S.pessoa] && !futuro) {
    const t = treinou(S.data, S.pessoa);
    out.push(aviso(`<div class="lado-a-lado"><b>Treinou hoje?</b><span class="go"><button class="btn ${t ? "cta" : ""}" data-act="treino" data-t="1" aria-pressed="${t}">Sim</button>
      <button class="btn ${!t ? "cta" : ""}" data-act="treino" data-t="0" aria-pressed="${!t}">Não</button></span></div>${!t ? md(r.dia.seNaoTreinar[S.pessoa]) : ""}`));
  }
  const gasto = Number(log.get("burn", S.data, S.pessoa)?.v || 0);
  if (gasto > 0) out.push(aviso(`<div class="lado-a-lado"><b>Cardio no Pulse</b><span class="num">${Math.round(gasto)} kcal</span></div>`));
  return out.filter(Boolean).join("");
}

export function render() {
  const p = S.plano.pessoas.find((x) => x.id === S.pessoa);
  const r = resumoDia(S.data, S.pessoa);
  const crianca = !!p.crianca;
  const ehHoje = S.data === hoje();
  const futuro = S.data > hoje();
  const treino = r.pulse?.treino && r.pulse.hora && !r.naoTreinou ? ` · treino ${r.pulse.hora}` : "";
  const titulo = ehHoje ? (crianca ? `Oi, ${p.nome}!` : `${saudacao()}, ${p.nome}`) : dataLonga(S.data);
  const sub = ehHoje ? dataLonga(S.data) + treino : (futuro ? "Planejado" : "Dia anterior") + treino;
  if (!r.dia) return `<div class="page">${topo(titulo, sub)}${dias(semana(), S.data)}<p class="muted">Sem cardápio para este dia.</p></div>`;

  const ml = Number(log.get("water", S.data, S.pessoa)?.v || 0);
  const metaMl = metaAgua(S.plano, S.pessoa, pesoRecente(S.pessoa));
  const base = futuro ? r.plano : r.feito;
  const painel = crianca ? "" : `<div class="top2 ${futuro ? "so" : ""}">${aneis({ kcal: base.kcal, metaKcal: r.meta.kcal, prot: base.proteina, metaProt: r.meta.proteina,
      carbo: base.carbo, metaCarbo: r.plano.carbo, gord: base.gordura, metaGord: r.plano.gordura, rotulo: futuro ? "kcal no plano" : "" })}
      ${futuro ? "" : garrafa({ ml, meta: metaMl })}</div>
    ${(() => { const n = futuro ? 0 : sequenciaAgua(metaMl); return n >= 3 ? `<div class="hoje-agua">${icon("droplet", "sm")}${n} dias seguidos na meta da água</div>` : ""; })()}
    ${macros({ feito: base, meta: { proteina: r.meta.proteina, carbo: r.plano.carbo, gordura: r.plano.gordura } })}`;

  const agora = agoraMin();
  // o horário que a tela mostra (o treino do Pulse pode adiantar ou atrasar o pré/pós-treino) também decide o "agora"
  const horas = r.refeicoes.map((m) => (!r.naoTreinou && r.pulse?.treino && horaPeloPulse(m, r.pulse.hora)) || m.hora);
  const vez = ehHoje ? r.refeicoes.find((m, i) => !comeu(S.data, S.pessoa, m.id) && minDe(horas[i]) >= agora - 45) : null;
  const feitas = r.refeicoes.filter((m) => comeu(S.data, S.pessoa, m.id)).length;
  const itens = r.refeicoes.map((m, i) => {
    const v = { id: m.id, hora: horas[i], nome: m.nome, kcal: m.kcal, desc: m.titulo || m.itens.map((it) => it.nome.toLowerCase()).join(", "), extra: extraDoCartao(m),
      itens: m.itens.map((it) => [it.nome, fmtQtd(it.qtd, it.unid)]) };
    if (crianca) return m === vez ? cartaoDaVez(v, { semKcal: true, go: aceiteBotoes(m.id) })
      : refeicao(v, { feita: comeu(S.data, S.pessoa, m.id), semKcal: true, antes: boneco(m.tipo), depois: aceiteBotoes(m.id) });
    return m === vez ? cartaoDaVez(v, { semKcal: crianca, acoes: [{ rotulo: "Só parte", act: "ficha" }, ...(m.alternativas?.length ? [{ rotulo: "Trocar", act: "ficha" }] : [])] })
      : refeicao(v, { feita: comeu(S.data, S.pessoa, m.id), semKcal: crianca });
  });
  // linha do tempo: refeições + doses do tratamento (junto da refeição) + sintomas anotados (no horário)
  const linha = r.refeicoes.map((m, i) => ({ hora: horas[i], ordem: 0, html: itens[i] }));
  const t = tratamentoAtivo(S.pessoa);
  for (const d of dosesDoDia(t, S.data, r.refeicoes.map((m, i) => ({ ...m, hora: horas[i] })))) {
    const tomada = log.get("dose", S.data, S.pessoa, d.id)?.v === "1";
    const quando = d.refeicao ? "" : /^\d/.test(d.quando) ? ` · ${d.quando}` : ` · ${REFEICOES[d.quando]} (sem essa refeição hoje)`;
    linha.push({ hora: d.hora, ordem: 1, html: `<div class="nota dose" style="--c:var(--fat)">💊 <span class="grow">${esc(d.nome)}${esc(quando)}</span>
      ${futuro ? "" : `<button class="btn txt" data-act="dose" data-k="${esc(d.id)}" aria-pressed="${tomada}">${tomada ? "✓ tomada" : "Tomei"}</button>`}</div>` });
  }
  for (const x of log.all("symptom", (y) => y.day === S.data && y.person === S.pessoa)) {
    const s = lerSintoma(x.v);
    linha.push({ hora: s.hora || "23:58", ordem: 2, html: nota(`${s.alerta ? "⚠️ " : ""}${s.hora ? `${s.hora} · ` : ""}${esc(s.rotulo)}`, s.alerta ? "var(--prot)" : "var(--carb)") });
  }
  for (const x of log.all("sideeffect", (y) => y.day === S.data && y.person === S.pessoa)) {
    let e = {}; try { e = JSON.parse(x.v); } catch (err) {}
    linha.push({ hora: e.hora || "23:58", ordem: 2, html: nota(`${e.hora ? `${esc(e.hora)} · ` : ""}efeito: ${esc(e.texto || "")}`, "var(--fat)") });
  }
  linha.sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : a.ordem - b.ordem));
  const preparo = r.dia.preparo.length ? `<button class="row glass" data-act="preparo" style="margin-top:.75rem;border-radius:1rem">${icon("chef-hat")}<span class="grow"><div>Preparo de hoje</div><div class="sub">${r.dia.preparo.length} passos · modo cozinha</div></span>${icon("chevron-right")}</button>` : "";
  const regras = !crianca && S.plano.regras.length ? `<div class="sec" style="margin-top:1.25rem"><span>Regras do plano</span></div><div class="regras">${S.plano.regras.map((t) => `<div class="nota-regra">${md(t)}</div>`).join("")}</div>` : "";

  // no computador: duas colunas (painel e avisos | linha do tempo); no celular, uma embaixo da outra
  return `${crianca ? ceu() : ""}<div class="page hoje-pc"><div class="col-a">${topo(titulo, sub, crianca ? urso("oi", 52) : "")}${dias(semana(), S.data)}${painel}
    <div class="avisos">${avisosDoDia(r, p, futuro)}</div></div>
    <div class="col-b"><div class="sec"><span>Refeições</span><span>${futuro ? `${r.refeicoes.length} no plano` : `${feitas} de ${r.refeicoes.length}`}</span></div>
    ${linha.length ? linhaDoTempo(linha.map((x) => x.html)) : `<p class="muted">Nada planejado para ${esc(p.nome)} neste dia.</p>`}${preparo}${regras}</div></div>
    ${!ehHoje ? "" : `<button class="fab" data-act="mais" aria-label="Anotar sintoma, água ou efeito">${icon("plus")}</button>`}`;
}

// ---------- "comi" com desfazer (regras em js/acoes.js) ----------
export function marcarComi(id) {
  const { data, pessoa } = S;
  const antes = foto(data, pessoa, id);
  const on = alternarComi(data, pessoa, id, !!S.plano.pessoas.find((x) => x.id === pessoa)?.crianca);
  toast(on ? "Boa! Marcado" : "Desmarcado", () => restaurar(data, pessoa, id, antes));
}

/** Folha de ações ao segurar uma refeição (sem abrir a ficha). */
export function abrirAcoes(id) {
  const m = resumoDia(S.data, S.pessoa).refeicoes.find((x) => x.id === id);
  if (!m) return;
  const feito = comeu(S.data, S.pessoa, id);
  const linha = (act, ic, t, extra = "") => `<button class="row" data-act="${act}" data-m="${esc(id)}" ${extra}>${icon(ic)}<span class="grow">${t}</span></button>`;
  abrirFolha(`<small class="muted">${esc(m.hora)}</small><h2 class="h2">${esc(m.nome)}</h2><div class="rows" style="margin-top:.75rem">
    ${linha("comi-ficha", "check", feito ? "Desmarcar" : "Comi")}${linha("ficha", "notebook-pen", "Só parte")}
    ${m.alternativas?.length ? linha("ficha", "refresh-cw", "Trocar", 'data-foco="opcoes"') : ""}${S.plano.pessoas.find((x) => x.id === S.pessoa)?.crianca ? "" : linha("outra", "utensils", "Outra coisa")}
    ${linha("ficha", "list-checks", "Ver a ficha")}</div>`);
}

/** Decisão do fim do tratamento: grava a escolha (o Claude vê em respostasDasPerguntas) e ajusta o cadastro. */
async function decidir(v, mudar) {
  const t = tratamentoDe(S.pessoa);
  if (!t) return;
  if (mudar) {
    try { guardarTrat(S.pessoa, await api(`/api/tratamento/${encodeURIComponent(S.pessoa)}`, { method: "PUT", body: JSON.stringify({ ...t, ...mudar }) })); }
    catch (e) { return toast("Não consegui salvar (sem internet?)"); }
  }
  log.set("checkin", S.data, S.pessoa, "tratamento", v); // só depois de valer no servidor
  rerender();
  toast(v === "estender" ? "Tratamento estendido por 2 semanas" : v === "parar" ? "Combinado: para no fim" : "Anotado — peça ao Claude o plano de reintrodução");
}

export const acts = {
  "trat-estender": () => decidir("estender", { dias: tratamentoDe(S.pessoa).dias + 14, fim: null }),
  "trat-parar": () => { const t = tratamentoDe(S.pessoa); decidir("parar", { fim: somaDias(t.inicio, t.dias - 1) }); },
  "trat-reintro": () => decidir("reintroducao"),
  comi: (b) => marcarComi(b.dataset.m),
  dia: (b) => { S.data = b.dataset.d; rerender(); },
  agua: (b) => {
    const { data, pessoa } = S, n = Number(b.dataset.v);
    somarAgua(data, pessoa, n);
    toast(`+${n} ml de água`, () => somarAgua(data, pessoa, -n));
  },
  treino: (b) => log.set("trained", S.data, S.pessoa, "", b.dataset.t),
};

// ---------- segurar = ações (o clique que vem depois não marca nem abre a ficha) ----------
let seg = null, engolirClique = false;
addEventListener("pointerdown", (e) => {
  engolirClique = false; // no toque, segurar não gera clique: a sobra não pode comer o próximo toque
  const c = e.target.closest(".tl .corpo");
  if (!c) return;
  seg = { x: e.clientX, y: e.clientY, t: setTimeout(() => { engolirClique = true; seg = null; navigator.vibrate?.(15); abrirAcoes(c.dataset.m); }, 500) };
});
const cancelar = () => { if (seg) { clearTimeout(seg.t); seg = null; } };
addEventListener("pointerup", cancelar);
addEventListener("pointercancel", cancelar);
addEventListener("pointermove", (e) => { if (seg && Math.hypot(e.clientX - seg.x, e.clientY - seg.y) > 10) cancelar(); });
addEventListener("click", (e) => { if (engolirClique) { engolirClique = false; e.stopPropagation(); e.preventDefault(); } }, true);
addEventListener("contextmenu", (e) => { if (e.target.closest(".tl .corpo")) e.preventDefault(); });

// ---------- gestos: deslizar troca o dia (70 px); puxar do topo atualiza (90 px) ----------
let g = null;
addEventListener("touchstart", (e) => {
  g = null;
  if (location.hash.slice(1) && location.hash !== "#hoje") return;
  if (!S.plano || e.touches.length !== 1 || document.querySelector("dialog.folha[open], .cozinha") || e.target.closest(".days, .who, input, textarea, .nav")) return;
  g = { x: e.touches[0].clientX, y: e.touches[0].clientY, topo: scrollY <= 0, dx: 0, dy: 0 };
}, { passive: true });
addEventListener("touchmove", (e) => { if (g) { g.dx = e.touches[0].clientX - g.x; g.dy = e.touches[0].clientY - g.y; } }, { passive: true });
addEventListener("touchend", () => {
  const x = g; g = null;
  if (!x) return;
  if (x.topo && x.dy > 90 && Math.abs(x.dy) > Math.abs(x.dx) * 1.5) return dispatchEvent(new Event("mesa:atualizar"));
  if (Math.abs(x.dx) > 70 && Math.abs(x.dy) < 45) {
    const d = S.plano.dias[S.plano.dias.findIndex((d) => d.data === S.data) + (x.dx < 0 ? 1 : -1)];
    if (!d) return;
    S.data = d.data;
    rerender();
    document.querySelector(".tl")?.animate([{ opacity: 0, transform: `translateX(${x.dx < 0 ? 24 : -24}px)` }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
  }
});
