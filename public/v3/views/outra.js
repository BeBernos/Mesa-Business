// Comi outra coisa (spec §7.3): buscar numa tabela offline (comuns no Brasil + redes) ou estimar por tipo × tamanho.
// Grava no lugar da refeição pelo salvarParte de sempre, marcado como estimativa (o Claude vê no contexto e refina).
import { S, resumoDia, rerender } from "../../js/state.js";
import { salvarParte, foto, restaurar } from "../../js/acoes.js";
import { esc, fmt, icon, abrirFolha, fecharFolha, toast } from "../ui.js";

// faixa de kcal e proteína (g) por tipo × tamanho; grava a média
export const ESTIMATIVAS = {
  lanche: { rotulo: "Lanche", leve: [300, 450, 15], normal: [500, 700, 25], exagerei: [800, 1200, 40] },
  prato: { rotulo: "Prato", leve: [400, 550, 25], normal: [600, 850, 35], exagerei: [900, 1400, 50] },
  doce: { rotulo: "Doce", leve: [150, 250, 3], normal: [300, 450, 6], exagerei: [500, 800, 10] },
  bebida: { rotulo: "Bebida", leve: [80, 150, 0], normal: [150, 250, 1], exagerei: [300, 500, 2] },
  petisco: { rotulo: "Petisco", leve: [150, 250, 6], normal: [300, 500, 12], exagerei: [600, 900, 20] },
};
const TAMANHOS = [["leve", "Leve"], ["normal", "Normal"], ["exagerei", "Exagerei"]];

let tabela = null; // [{ nome, porcao, kcal, proteina, grupo, chave }]
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let falhouTabela = false;
async function carregarTabela() {
  if (tabela) return tabela;
  try {
    const r = await fetch("/v3/data/alimentos.json");
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    tabela = j.itens.map(([nome, porcao, kcal, proteina, grupo]) => ({ nome, porcao, kcal, proteina, grupo, chave: semAcento(`${nome} ${grupo}`) }));
    falhouTabela = false;
  } catch (e) { falhouTabela = true; } // não guarda a falha: tenta de novo na próxima vez; o Estimar continua valendo
  return tabela;
}
export const buscar = (termo, lista = tabela || []) => {
  const t = semAcento(termo).trim().split(/\s+/).filter(Boolean);
  return t.length ? lista.filter((x) => t.every((p) => x.chave.includes(p))).slice(0, 12) : [];
};

let E = null; // estado da folha aberta
const fmtQ = (q) => (q === 0.5 ? "½" : Number.isInteger(q) ? String(q) : `${Math.floor(q)}½`);

function escolha() {
  if (E.modo === "estimar") {
    const f = E.tipo && E.tam && ESTIMATIVAS[E.tipo][E.tam];
    const tipo = `${ESTIMATIVAS[E.tipo]?.rotulo.toLowerCase()}, ${TAMANHOS.find((t) => t[0] === E.tam)?.[1].toLowerCase()}`;
    return f ? { outra: (E.termo.trim() ? `${E.termo.trim().slice(0, 90)} (${tipo})` : tipo.replace(/^./, (c) => c.toUpperCase())), outraKcal: Math.round((f[0] + f[1]) / 2), outraProt: f[2], faixa: [f[0], f[1]], fonte: "estimar" } : null;
  }
  // com itens achados, é preciso escolher; sem nada na tabela, dá para registrar só o nome (sem kcal)
  if (!E.itens.length) return E.termo.trim() && !buscar(E.termo).length ? { outra: E.termo.trim().slice(0, 120), semKcal: true } : null;
  const outra = E.itens.map((x) => `${x.qtd === 1 ? "" : `${fmtQ(x.qtd)}× `}${x.nome}`).join(" + ").slice(0, 300);
  const comKcal = E.itens.filter((x) => x.kcal != null);
  if (!comKcal.length) return { outra, semKcal: true };
  return { outra, outraKcal: Math.round(comKcal.reduce((s, x) => s + x.kcal * x.qtd, 0)), outraProt: Math.round(comKcal.reduce((s, x) => s + x.proteina * x.qtd, 0)), fonte: "tabela",
    ...(E.itens.length === 1 ? { porcao: E.itens[0].porcao } : {}) };
}

/** O que já foi adicionado, cada um com a sua quantidade. */
const carrinho = () => (E.itens.length ? `<div class="sec" style="margin-top:.75rem"><span>Você comeu</span><span>quantidade</span></div><div class="rows">${E.itens.map((x, i) => `<div class="row">
    <span class="grow"><div>${esc(x.nome)}</div><div class="sub">${x.kcal == null ? "sem kcal" : `${esc(x.porcao)} · ~${fmt(x.kcal * x.qtd)} kcal`}</div></span>
    <span class="go"><button class="btn" data-act="outra-menos" data-i="${i}" aria-label="Menos ${esc(x.nome)}">−</button><b class="num" style="min-width:2rem;text-align:center">${fmtQ(x.qtd)}</b>
    <button class="btn" data-act="outra-mais" data-i="${i}" aria-label="Mais ${esc(x.nome)}">+</button><button class="btn txt" data-act="outra-tirar" data-i="${i}" aria-label="Tirar ${esc(x.nome)}">${icon("x", "sm")}</button></span></div>`).join("")}</div>` : "");

function lista() {
  const r = buscar(E.termo);
  if (!E.termo.trim()) return `<p class="muted">${E.itens.length ? "Comeu mais alguma coisa? Busque e toque para somar." : "Ex.: big mac, coxinha, açaí, pizza, marmita…"}</p>`;
  const livre = `<button class="row" data-act="outra-livre">${icon("plus", "sm")}<span class="grow">Adicionar “${esc(E.termo.trim().slice(0, 90))}” sem kcal</span></button>`;
  if (!tabela && falhouTabela) return `<p class="muted">A lista não carregou agora (sem internet?). Use <b>Estimar</b>.</p><div class="rows">${livre}</div>`;
  if (!tabela) return `<p class="muted">Carregando a lista…</p>`;
  if (!r.length) return `<p class="muted">Não achei na tabela. Use <b>Estimar</b> (guarda o nome que você digitou) ou adicione só o nome, sem kcal.</p><div class="rows">${livre}</div>`;
  const tem = (x) => E.itens.some((y) => y.ref === x);
  return `<div class="rows">${r.map((x) => `<button class="row ${tem(x) ? "on" : ""}" data-act="outra-item" data-i="${(tabela || []).indexOf(x)}" aria-pressed="${tem(x)}">
    <span class="grow"><div>${esc(x.nome)}</div><div class="sub">${esc(x.porcao)}</div></span><span class="end num">~${fmt(x.kcal)} kcal</span></button>`).join("")}</div>`;
}

function resumoDe(e) {
  if (!e) return E.modo === "buscar" && E.termo.trim() && buscar(E.termo).length ? "Toque no item da lista (ou use Estimar)" : "Escolha o que comeu";
  const semConta = E.modo === "buscar" && !e.semKcal && E.itens.some((x) => x.kcal == null) ? ` <span class="muted">(sem contar o que está sem kcal)</span>` : "";
  return e.semKcal ? `${esc(e.outra)} · sem kcal (use Estimar para contar no anel)` : `${esc(e.outra)} · ~${fmt(e.outraKcal)} kcal · ${fmt(e.outraProt)} g prot${e.faixa ? ` <span class="muted">(${e.faixa[0]}–${e.faixa[1]})</span>` : ""}${semConta}`;
}

function corpo() {
  const e = escolha();
  const resumo = resumoDe(e);
  const busca = `<input class="input" name="busca" type="search" placeholder="O que você comeu?" autocomplete="off" value="${esc(E.termo)}" aria-label="Buscar alimento">
    <div id="outra-lista" style="margin-top:.5rem">${lista()}</div>
    <div id="outra-qtd">${carrinho()}</div>`;
  const estimar = `<div class="sec"><span>Tipo</span></div><div class="chips">${Object.entries(ESTIMATIVAS).map(([k, v]) =>
      `<button class="chip ${E.tipo === k ? "on" : ""}" data-act="outra-tipo" data-v="${k}" aria-pressed="${E.tipo === k}">${v.rotulo}</button>`).join("")}</div>
    <div class="sec"><span>Tamanho</span></div><div class="chips">${TAMANHOS.map(([k, l]) =>
      `<button class="chip ${E.tam === k ? "on" : ""}" data-act="outra-tam" data-v="${k}" aria-pressed="${E.tam === k}">${l}</button>`).join("")}</div>`;
  return `<small class="muted">${esc(E.nome)} · no lugar desta refeição</small><h2 class="h2">Comi outra coisa</h2>
    <div class="chips" role="tablist">${[["buscar", "Buscar"], ["estimar", "Estimar"]].map(([k, l]) =>
      `<button class="chip ${E.modo === k ? "on" : ""}" role="tab" aria-selected="${E.modo === k}" data-act="outra-modo" data-modo="${k}">${l}</button>`).join("")}</div>
    <div style="margin-top:.75rem">${E.modo === "estimar" ? estimar : busca}</div>
    <p class="muted" style="margin-top:1rem">Valores aproximados — a Mesa marca como estimativa e o Claude ajusta quando analisar.</p>
    <p class="outra-resumo" aria-live="polite">${resumo}</p>
    <div class="foot"><button class="btn" data-act="outra-fechar">Cancelar</button><button class="btn cta" data-act="outra-salvar" ${e ? "" : "disabled"}>Registrar</button></div>`;
}

function repintar() {
  const d = document.querySelector("dialog.folha[open]");
  if (!d) return;
  const t = d.querySelector("#toast");
  d.innerHTML = corpo();
  if (t) d.append(t);
}

export function abrirOutra(id) {
  const m = resumoDia(S.data, S.pessoa).refeicoes.find((x) => x.id === id);
  if (!m || S.plano.pessoas.find((x) => x.id === S.pessoa)?.crianca) return; // criança não conta caloria
  const este = (E = { id, nome: m.nome, modo: "buscar", termo: "", itens: [], tipo: null, tam: null });
  abrirFolha(corpo(), { aoFechar: () => { if (E === este) E = null; rerender(); } }); // abre na hora; a lista chega depois
  document.querySelector("dialog.folha [name=busca]")?.focus();
  if (!tabela) carregarTabela().then(() => { if (E === este) atualizarLista(); });
}

function atualizarLista() {
  const l = document.getElementById("outra-lista");
  if (l) l.innerHTML = lista();
  const e = escolha();
  const r = document.querySelector("dialog.folha .outra-resumo");
  const b = document.querySelector("dialog.folha [data-act=outra-salvar]");
  if (r) r.innerHTML = resumoDe(e);
  if (b) b.disabled = !e;
}

// digitar só troca a lista (o campo não é redesenhado e não perde o foco)
addEventListener("input", (e) => {
  if (!E || e.target.name !== "busca" || !e.target.closest("dialog.folha")) return;
  E.termo = e.target.value;
  atualizarLista();
});

export const acts = {
  outra: (b) => abrirOutra(b.dataset.m),
  "outra-modo": (b) => { E.modo = b.dataset.modo; repintar(); },
  // tocar num item soma (de novo = +1) e limpa a busca para o próximo
  "outra-item": (b) => {
    const x = tabela[+b.dataset.i], ja = E.itens.find((y) => y.ref === x);
    if (ja) ja.qtd = Math.min(20, ja.qtd + 1); else E.itens.push({ ref: x, nome: x.nome, porcao: x.porcao, kcal: x.kcal, proteina: x.proteina, qtd: 1 });
    E.termo = ""; repintar();
  },
  "outra-livre": () => { E.itens.push({ nome: E.termo.trim().slice(0, 90), porcao: "", kcal: null, proteina: null, qtd: 1 }); E.termo = ""; repintar(); },
  "outra-mais": (b) => { const x = E.itens[+b.dataset.i]; x.qtd = Math.min(20, x.qtd + 0.5); repintar(); },
  "outra-menos": (b) => { const x = E.itens[+b.dataset.i]; x.qtd = Math.max(0.5, x.qtd - 0.5); repintar(); },
  "outra-tirar": (b) => { E.itens.splice(+b.dataset.i, 1); repintar(); },
  "outra-tipo": (b) => { E.tipo = b.dataset.v; repintar(); },
  "outra-tam": (b) => { E.tam = b.dataset.v; repintar(); },
  "outra-fechar": () => fecharFolha(),
  "outra-salvar": () => {
    const e = escolha();
    const m = resumoDia(S.data, S.pessoa).refeicoes.find((x) => x.id === E.id);
    if (!e || !m) return;
    const { data, pessoa } = S;
    const antes = foto(data, pessoa, m.id);
    const { semKcal, ...resto } = e;
    // só o nome (sem kcal) fica marcado "semKcal" — o Claude não lê como zero exato
    salvarParte(data, pessoa, m, { fora: m.itens.map((it) => it.nome), ...resto, outraKcal: resto.outraKcal || 0, ...(semKcal ? { semKcal: true } : { estimativa: true }) });
    fecharFolha();
    toast(`Anotado: ${e.outra}`, () => restaurar(data, pessoa, m.id, antes));
  },
};
