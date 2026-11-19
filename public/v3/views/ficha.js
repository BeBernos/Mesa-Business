// Ficha da refeição numa folha: ingredientes (cru/pronto), só parte, comeu outra coisa, opções, porções da família.
// Grava pelas regras de js/acoes.js.
import { S, rerender, resumoDia, comeu, parcial, escolhida, cor } from "../../js/state.js";
import { log } from "../../js/sync.js";
import { fmtQtd, cozido, consumido } from "../../js/plan.js";
import { salvarParte, trocarOpcao, definirAceite, foto, restaurar } from "../../js/acoes.js";
import { esc, icon, fmt, abrirFolha, fecharFolha, toast } from "../ui.js";
import { marcarComi } from "./hoje.js";
import { urso } from "../desenhos.js";

const refeicaoAtual = (id) => resumoDia(S.data, S.pessoa).refeicoes.find((m) => m.id === id);
const crianca = () => !!S.plano.pessoas.find((x) => x.id === S.pessoa)?.crianca;
export const ACEITE = [["bem", "comeu bem"], ["pouco", "comeu pouco"], ["recusou", "não quis"]];
/** Três carinhas do Ursinho para "como a criança comeu"; a escolhida fica cheia. */
export const aceiteBotoes = (id) => `<div class="aceite" role="group" aria-label="Como comeu">${ACEITE.map(([k, l]) =>
  `<button class="carinha" data-act="aceite" data-m="${esc(id)}" data-v="${k}" aria-pressed="${aceiteDe(id) === k}">${urso(k, 30)}<span>${l}</span></button>`).join("")}</div>`;
export const aceiteDe = (id) => (comeu(S.data, S.pessoa, id) ? log.get("aceite", S.data, S.pessoa, id)?.v || "bem" : "");

/** O que o cartão mostra embaixo do nome: só parte / outra coisa / troca de opção (HTML escapado). */
export function extraDoCartao(m) {
  const p = comeu(S.data, S.pessoa, m.id) && parcial(S.data, S.pessoa, m.id);
  const out = [];
  if (p && (p.fora?.length || p.outra)) out.push(`${p.outra ? "outra coisa" : "comeu parte"}${crianca() ? "" : ` · ~${fmt(consumido(m, p.fora || [], p.outraKcal, p.outraProt).kcal)} kcal`}`);
  if (m.alternativas?.length) out.push(m.escolha ? `trocada · opção ${m.numero || m.escolha + 1}` : `${m.alternativas.length + 1} opções`);
  return out.map(esc).join(" · ");
}

function opcoes(m) {
  if (!m.alternativas?.length) return "";
  const base = S.plano.dias.find((d) => d.data === S.data)?.refeicoes[S.pessoa]?.find((x) => x.id === m.id);
  const todas = [base, ...m.alternativas].map((o, i) => ({ o, i })).filter((x) => x.o).sort((a, b) => (a.o.numero || 0) - (b.o.numero || 0));
  return `<div class="sec" id="opcoes"><span>Opções</span><span>toque para trocar</span></div>
    <div class="rows">${todas.map(({ o, i }) => `<button class="row ${m.escolha === i ? "on" : ""}" data-act="trocar" data-m="${esc(m.id)}" data-i="${i}" aria-pressed="${m.escolha === i}">
      <span class="box">${icon("check", "sm")}</span><span class="grow"><div>${esc(o.titulo || o.nome)}</div><div class="sub">${o.itens.slice(0, 3).map((it) => esc(it.nome.toLowerCase())).join(" · ")}</div></span>
      ${!crianca() && o.kcal != null ? `<span class="end num">${fmt(o.kcal)} kcal</span>` : ""}</button>`).join("")}</div>`;
}

function porcoes(m) {
  if (!m.familia) return "";
  const outros = S.plano.pessoas.filter((p) => p.id !== S.pessoa).map((p) => {
    const ms = S.plano.dias.find((d) => d.data === S.data)?.refeicoes[p.id] || [];
    const par = ms.find((x) => x.tipo === m.tipo && x.familia) || ms.find((x) => x.tipo === m.tipo);
    return par ? { p, m: escolhida(S.data, p.id, par) } : null;
  }).filter(Boolean);
  if (!outros.length) return "";
  return `<div class="sec"><span>Mesma comida, outras porções</span></div><div class="porcoes">${outros.map(({ p, m: x }) =>
    `<div class="glass card"><div class="sub" style="color:${cor(p.id)}">${esc(p.nome)}</div>${x.itens.slice(0, 4).map((it) => `<div>${esc(it.nome)} <b class="num">${esc(fmtQtd(it.qtd, it.unid))}</b></div>`).join("")}</div>`).join("")}</div>`;
}

function html(m) {
  const feito = comeu(S.data, S.pessoa, m.id);
  const kid = crianca();
  const p = parcial(S.data, S.pessoa, m.id);
  const fora = new Set(p?.fora || []);
  const rotulo = m.alternativas?.length ? `Opção ${m.numero || m.escolha + 1} de ${m.alternativas.length + 1}` : "";
  const macros = kid ? [] : [["kcal", m.kcal, " kcal"], ["prot", m.proteina, " g prot"], ["carbo", m.carbo, " g carbo"], ["gord", m.gordura, " g gord"]].filter((x) => x[1] != null);
  const parte = !kid && p && (p.fora?.length || p.outra) ? `<div class="glass card aviso"><span class="grow">${p.outra ? `Comeu outra coisa: <b>${esc(p.outra)}</b>` : `Comeu parte: sem ${esc(p.fora.join(", ").toLowerCase())}`} · ~${fmt(consumido(m, p.fora || [], p.outraKcal, p.outraProt).kcal)} kcal</span>
    <button class="btn txt" data-act="parte-limpar" data-m="${esc(m.id)}">Desfazer</button></div>` : "";
  return `<small class="muted">${esc(m.nome)} · ${esc(m.hora)}</small><h2 class="h2">${esc(m.titulo || m.nome)}</h2>
    <div class="chips">${m.familia ? `<span class="chip">${icon("house", "sm")}família</span>` : ""}${rotulo ? `<button class="chip" data-act="ver-opcoes">${esc(rotulo)}</button>` : ""}${macros.map(([, v, u]) => `<span class="chip num">${fmt(v)}${u}</span>`).join("")}</div>
    ${m.nota ? `<p class="muted">${esc(m.nota)}</p>` : ""}
    ${kid ? `<div class="sec"><span>Como foi?</span></div>${aceiteBotoes(m.id)}` : ""}
    ${parte}
    <div class="sec"><span>Ingredientes</span><span>peso cru${kid ? "" : " · toque no que não comeu"}</span></div>
    <div class="rows">${m.itens.map((it, n) => {
      const ck = cozido(S.plano, it);
      const end = `<span class="end"><b class="num">${esc(fmtQtd(it.qtd, it.unid))}</b>${ck ? `<small>${esc(ck)}</small>` : ""}</span>`;
      const nome = `<span class="grow"><div>${esc(it.nome)}</div>${it.obs ? `<div class="sub">${esc(it.obs)}</div>` : ""}</span>`;
      if (kid) return `<div class="row">${nome}${end}</div>`;
      const off = fora.has(it.nome);
      return `<button class="row ${off ? "" : "on"}" data-act="item" data-m="${esc(m.id)}" data-n="${n}" aria-pressed="${!off}" aria-label="${esc(it.nome)}: ${off ? "não comeu" : "comeu"}"><span class="box">${icon("check", "sm")}</span>${nome}${end}</button>`;
    }).join("")}</div>
    ${kid ? "" : `<button class="btn block outra-btn" data-act="outra" data-m="${esc(m.id)}">${icon("utensils", "sm")}Comeu outra coisa? Buscar ou estimar</button>`}
    ${opcoes(m)}${porcoes(m)}
    <div class="foot"><button class="btn" data-act="cozinha" data-m="${esc(m.id)}">${icon("chef-hat", "sm")}Modo cozinha</button>
      <button class="btn ${feito ? "" : "cta"}" data-act="comi-ficha" data-m="${esc(m.id)}">${feito ? "Desmarcar" : "Comi"}</button></div>`;
}

let aoAbrir = null;
export function abrirFicha(id) {
  const m = refeicaoAtual(id);
  if (!m) return;
  aoAbrir = { id, foto: foto(S.data, S.pessoa, id) }; // o "Desfazer" do só parte volta para cá
  abrirFolha(html(m), { aoFechar: rerender });
}
export function repintarFicha(id) {
  const d = document.querySelector("dialog.folha[open]");
  const m = refeicaoAtual(id);
  if (!d || !m) return;
  const y = d.scrollTop;
  const t = d.querySelector("#toast"); // o aviso mora na folha enquanto ela está aberta
  d.innerHTML = html(m);
  if (t) d.append(t);
  d.scrollTop = y;
}

export const acts = {
  ficha: (b) => {
    abrirFicha(b.dataset.m);
    const f = b.dataset.foco;
    if (f === "opcoes") document.getElementById("opcoes")?.scrollIntoView({ block: "start" });
  },
  "comi-ficha": (b) => { fecharFolha(); marcarComi(b.dataset.m); },
  item: (b) => {
    const m = refeicaoAtual(b.dataset.m);
    const nome = m.itens[+b.dataset.n].nome;
    const fora = new Set(parcial(S.data, S.pessoa, m.id)?.fora || []);
    fora.has(nome) ? fora.delete(nome) : fora.add(nome);
    const antes = foto(S.data, S.pessoa, m.id);
    salvarParte(S.data, S.pessoa, m, { fora: [...fora] });
    toast(fora.size ? "Comeu parte" : "Comeu tudo", () => { restaurar(S.data, S.pessoa, m.id, antes); repintarFicha(m.id); });
    repintarFicha(m.id);
  },
  "parte-limpar": (b) => {
    const id = b.dataset.m;
    // abriu sem "só parte": volta exatamente ao que era (inclusive "comi"); abriu já com parte: fica "comeu tudo"
    if (aoAbrir?.id === id && aoAbrir.foto.find(([k]) => k === "partial")[1] == null) restaurar(S.data, S.pessoa, id, aoAbrir.foto);
    else log.del("partial", S.data, S.pessoa, id);
    repintarFicha(id);
  },
  "ver-opcoes": () => document.getElementById("opcoes")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  trocar: (b) => {
    const i = +b.dataset.i;
    trocarOpcao(S.data, S.pessoa, b.dataset.m, i);
    repintarFicha(b.dataset.m);
    toast(i ? "Opção trocada para hoje" : "Voltou para a opção do plano");
  },
  aceite: (b) => {
    const { m, v } = b.dataset;
    definirAceite(S.data, S.pessoa, m, v);
    repintarFicha(m);
    rerender();
    document.querySelectorAll(`[data-act=aceite][data-m="${CSS.escape(m)}"][data-v=${v}][aria-pressed=true] .urso`).forEach((u) => u.classList.add("pulo"));
  },
};

export const forms = {};
