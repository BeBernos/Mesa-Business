// Plano (spec §7.7): a semana em grade (dias × refeições), o mês por semanas, a busca ("quando tem frango?"),
// imprimir a semana e o fechamento do mês com o pedido do próximo plano ao Claude.
import { S, rerender, hoje, resumoDia, comeu, pesoRecente, agoraMin, minDe } from "../../js/state.js";
import { log } from "../../js/sync.js";
import { semanas, listaDeCompras, buscarNoPlano, fmtQtd, DIAS_SEMANA, diaSemana, ddmm, metaAgua, somaDias, custoDaLista, quantidadesDoLote, notasDe, pessoaDe } from "../../js/plan.js";
import { passo, md } from "../../js/ui.js";
import { lerDia, notaSintomasDia, linkClaude } from "../../js/diario.js";
import { esc, icon, litros, topo, abrirFolha } from "../ui.js";

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

let sel = null; // número da semana aberta (null = a de hoje)
let termo = "";
const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());

function semanaAberta() {
  const ws = semanas(S.plano);
  return ws.find((w) => w.n === sel) || ws.find((w) => hoje() >= w.de && hoje() <= w.ate) || ws.find((w) => hoje() < w.de) || ws[ws.length - 1];
}

/** Bolinha de uma refeição: comi (cheia), passou sem marcar (contorno), troquei (marca), ainda vai ser (apagada). */
function bola(d, m) {
  const feito = comeu(d, S.pessoa, m.id);
  const troca = Number(log.get("swap", d, S.pessoa, m.id)?.v || 0) > 0;
  const passou = d < hoje() || (d === hoje() && minDe(m.hora) < agoraMin() - 60);
  const estado = feito ? "comi" : passou ? "pulei" : "vem";
  return `<i class="bola ${estado} ${troca ? "troca" : ""}" title="${esc(m.nome)}: ${estado === "comi" ? "comi" : estado === "pulei" ? "sem marcar" : "ainda vai ser"}${troca ? " · trocada" : ""}"></i>`;
}

function grade(w) {
  const dias = S.plano.dias.filter((d) => d.data >= w.de && d.data <= w.ate);
  const meta = metaAgua(S.plano, S.pessoa, pesoRecente(S.pessoa));
  return `<div class="grade">${dias.map((d) => {
    const ms = resumoDia(d.data, S.pessoa).refeicoes;
    const agua = Number(log.get("water", d.data, S.pessoa)?.v || 0);
    return `<button class="dia-g ${d.data === hoje() ? "hoje" : ""}" data-act="plano-dia" data-d="${d.data}" aria-label="${DIAS_SEMANA[diaSemana(d.data)]} ${ddmm(d.data)}: ${ms.filter((m) => comeu(d.data, S.pessoa, m.id)).length} de ${ms.length} refeições">
      <span class="dn"><small>${cap(DIAS_SEMANA[diaSemana(d.data)].slice(0, 3).toLowerCase())}</small><b class="num">${+d.data.slice(8, 10)}</b></span>
      <span class="bolas">${ms.map((m) => bola(d.data, m)).join("")}</span>
      <span class="agua-g ${agua >= meta ? "ok" : ""}">${agua ? `${litros(agua)} L` : ""}</span></button>`;
  }).join("")}</div>`;
}

function resultados() {
  if (termo.trim().length < 2) return "";
  const rs = buscarNoPlano(S.plano, termo).filter((r) => r.pessoa === S.pessoa);
  if (!rs.length) return `<p class="muted">Nada com “${esc(termo)}” neste plano.</p>`;
  return `<div class="rows">${rs.slice(0, 30).map((r) => `<button class="row ${r.data < hoje() ? "passado" : ""}" data-act="busca-ir" data-d="${r.data}">
    <span class="num dn-b"><b>${cap(DIAS_SEMANA[diaSemana(r.data)].slice(0, 3).toLowerCase())}</b> ${ddmm(r.data)}</span>
    <span class="grow"><div>${esc(r.titulo)}</div><div class="sub">${esc(r.nome)} ${esc(r.hora)}${r.opcao ? ` · opção ${r.opcao}` : ""}${r.achou.length ? ` · ${esc(r.achou.join(", ").toLowerCase())}` : ""}</div></span>${icon("chevron-right")}</button>`).join("")}</div>`;
}

export function render() {
  const ws = semanas(S.plano);
  const w = semanaAberta();
  const p = pessoaDe(S.plano, S.pessoa);
  const notas = notasDe(S.plano, "plano", S.pessoa).concat(notasDe(S.plano, "cozinha", S.pessoa));
  return `<div class="page">${topo("Plano", `${S.plano.titulo} · ${ddmm(S.plano.inicio)} a ${ddmm(S.plano.fim)}`)}
    <div class="chips" role="tablist">${ws.map((x) => `<button class="chip ${x.n === w.n ? "on" : ""}" role="tab" aria-selected="${x.n === w.n}" data-act="plano-semana" data-n="${x.n}">Sem ${x.n}</button>`).join("")}</div>
    <div class="sec" style="margin-top:.75rem"><span>Semana ${w.n} · ${ddmm(w.de)} a ${ddmm(w.ate)}</span><span>${esc(p.nome)}</span></div>
    ${grade(w)}
    <p class="muted legenda-g"><i class="bola comi"></i>comi <i class="bola pulei"></i>sem marcar <i class="bola vem troca"></i>trocada · toque no dia para abrir</p>
    <div class="go" style="margin-top:.75rem"><button class="btn" data-act="imprimir">${icon("printer", "sm")}Imprimir a semana</button>
      <button class="btn" data-act="fechar-mes">${icon("chart-line", "sm")}Fechar o mês</button></div>
    ${S.plano.lotes.length ? `<div class="sec" style="margin-top:1.25rem"><span>Cozinha da semana</span></div><div class="rows">${S.plano.lotes.map((l, i) => `<button class="row" data-act="lote" data-i="${i}">${icon("cooking-pot")}<span class="grow"><div>${esc(l.titulo)}</div><div class="sub">${l.passos.length} passos${l.quando ? ` · ${esc(l.quando)}` : ""}</div></span>${icon("chevron-right")}</button>`).join("")}</div>` : ""}
    ${notas.length ? `<div class="sec" style="margin-top:1.25rem"><span>Por que o plano é assim</span></div>${notas.map((n) => `<details class="nota-plano"><summary>${esc(n.titulo)}</summary><div class="md">${md(n.texto)}</div></details>`).join("")}` : ""}
    <div class="sec" style="margin-top:1.25rem"><span>Buscar no plano</span></div>
    <input class="input" name="busca-plano" type="search" placeholder="Quando tem frango? kiwi? omelete?" value="${esc(termo)}" autocomplete="off" aria-label="Buscar no plano">
    <div id="busca-plano-r" style="margin-top:.5rem">${resultados()}</div></div>`;
}
addEventListener("input", (e) => {
  if (e.target.name !== "busca-plano") return;
  termo = e.target.value;
  const r = document.getElementById("busca-plano-r");
  if (r) r.innerHTML = resultados();
});

// ---------- imprimir: cardápio da semana (todas as pessoas) + compras ----------
function imprimirSemana() {
  const w = semanaAberta();
  const dias = S.plano.dias.filter((d) => d.data >= w.de && d.data <= w.ate);
  const ps = S.plano.pessoas;
  const cel = (d, p) => (d.refeicoes[p.id] || []).map((m) => `<div><b>${esc(m.hora)} ${esc(m.nome)}</b> ${esc(m.titulo || m.itens.map((it) => it.nome).join(", "))}</div>`).join("");
  const compras = listaDeCompras(S.plano, w.de, w.ate);
  document.getElementById("impressao")?.remove();
  const el = document.createElement("div");
  el.id = "impressao";
  el.innerHTML = `<h1>${esc(S.plano.titulo)} · semana ${w.n} (${ddmm(w.de)} a ${ddmm(w.ate)})</h1>
    <table><thead><tr><th></th>${ps.map((p) => `<th>${esc(p.nome)}</th>`).join("")}</tr></thead>
    <tbody>${dias.map((d) => `<tr><th>${DIAS_SEMANA[diaSemana(d.data)]}<br>${ddmm(d.data)}</th>${ps.map((p) => `<td>${cel(d, p)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <h2>Compras da semana</h2><div class="cols">${compras.map((c) => `<div><h3>${esc(c.categoria)}</h3>${c.itens.map((it) => `<div>☐ ${esc(it.nome)} <b>${it.qtd != null ? esc(fmtQtd(it.qtd, it.unid)) : ""}</b></div>`).join("")}</div>`).join("")}</div>`;
  document.body.append(el);
  const fim = () => { el.remove(); removeEventListener("afterprint", fim); };
  addEventListener("afterprint", fim);
  print();
}

// ---------- fechamento do mês guiado ----------
function abrirFecharMes() {
  const hj = hoje();
  const ate = hj < S.plano.fim ? hj : S.plano.fim;
  const dias = S.plano.dias.filter((d) => d.data <= ate);
  const linhas = S.plano.pessoas.map((p) => {
    let plan = 0, feitas = 0, agua = 0, diasAgua = 0, nFech = 0, sint = 0;
    const aceite = { bem: 0, pouco: 0, recusou: 0 };
    for (const d of dias) {
      const ms = resumoDia(d.data, p.id).refeicoes;
      plan += ms.length;
      for (const m of ms) if (comeu(d.data, p.id, m.id)) { feitas++; aceite[log.get("aceite", d.data, p.id, m.id)?.v || "bem"]++; }
      const a = Number(log.get("water", d.data, p.id)?.v || 0);
      if (a > 0) { agua += a; diasAgua++; }
      const f = log.get("day", d.data, p.id);
      if (f) { nFech++; sint += notaSintomasDia(lerDia(f.v)); }
    }
    const pesos = log.all("weight", (x) => x.person === p.id && x.day >= S.plano.inicio && x.day <= hj && Number(x.v) > 0).sort((a, b) => (a.day < b.day ? -1 : 1));
    const kg = (v) => String(Number(v)).replace(".", ",");
    const peso = pesos.length ? `peso ${kg(pesos[0].v)} → ${kg(pesos[pesos.length - 1].v)} kg` : null;
    return { p, txt: [plan ? `adesão ${Math.round((feitas / plan) * 100)}%` : null, p.crianca && feitas ? `comeu bem ${aceite.bem} · pouco ${aceite.pouco} · não quis ${aceite.recusou}` : null,
      !p.crianca && diasAgua ? `água ${litros(Math.round(agua / diasAgua))} L/dia (média dos dias anotados)` : null, peso,
      nFech ? `sintomas ${String(Math.round((sint / nFech) * 10) / 10).replace(".", ",")} de 15` : null].filter(Boolean).join(" · ") };
  });
  const pc = S.meta?.precosCesta;
  const mes = MESES_LONGOS[+somaDias(S.plano.fim, 1).slice(5, 7) - 1]; // o mês em que o próximo plano começa
  const custo = pc && custoDaLista(listaDeCompras(S.plano, S.plano.inicio, S.plano.fim), pc.precos);
  const real = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const pedido = `Monte o plano da Mesa para o próximo mês (${mes}). Use contexto_da_familia (adesão, peso, água, sintomas, fechamentos, tratamento, testes, custo), plano_atual e formato_do_plano; ` +
    "depois iniciar_rascunho, adicionar_dias e publicar_rascunho com so_validar=true — mostre o resumo e só publique depois que eu confirmar.";
  abrirFolha(`<small class="muted">${esc(S.plano.titulo)} · ${ddmm(S.plano.inicio)} a ${ddmm(ate)}</small><h2 class="h2">Fechar o mês</h2>
    <div class="regras" style="margin-top:.75rem">${linhas.map((l) => `<div class="glass card"><b>${esc(l.p.nome)}</b><div class="muted">${esc(l.txt || "sem registros ainda")}</div></div>`).join("")}</div>
    ${custo?.comPreco ? `<p class="muted">Custo do plano: <b>${real(custo.total)}</b> (${custo.comPreco} de ${custo.itens} itens com preço da Cesta).</p>` : ""}
    <p class="muted" style="margin-top:.75rem">O Claude lê tudo isso pelo conector e monta o próximo plano; você confirma antes de publicar.</p>
    <div class="foot"><button class="btn" data-act="mais-fechar">Agora não</button><a class="btn cta" href="${esc(linkClaude(pedido))}" target="_blank" rel="noopener">${icon("sparkles", "sm")}Pedir o próximo plano</a></div>`);
}

export const acts = {
  "plano-semana": (b) => { sel = +b.dataset.n; rerender(); },
  "plano-dia": (b) => { S.data = b.dataset.d; location.hash = "hoje"; },
  "busca-ir": (b) => { S.data = b.dataset.d; location.hash = "hoje"; },
  imprimir: () => imprimirSemana(),
  lote: (b) => {
    const l = S.plano.lotes[+b.dataset.i], w = semanaAberta();
    const qs = quantidadesDoLote(S.plano, l, w.de, w.ate);
    abrirFolha(`<small class="muted">${l.quando ? `${esc(l.quando)} · ` : ""}semana ${w.n}</small><h2 class="h2">${esc(l.titulo)}</h2>
      ${qs.length ? `<div class="glass card" style="margin-top:.75rem"><div class="muted" style="margin-bottom:.5rem">Quanto fazer · família, semana ${w.n}</div>
        <div class="lote-qtd">${qs.map((q) => `<span>${esc(q.nome)}</span><b class="num">${esc(fmtQtd(q.qtd, q.unid))}</b>${q.pronto ? `<small>${esc(q.pronto)}</small>` : ""}`).join("")}</div></div>` : ""}
      <div class="steps">${l.passos.map((p, i) => passo(md(p).replace("<p>", "").replace("</p>", ""), p, `lote-${b.dataset.i}-${i}`, 'data-act="passo"')).join("")}</div>
      <div class="foot"><button class="btn" data-act="mais-fechar">Fechar</button><button class="btn cta" data-act="cozinha">${icon("chef-hat", "sm")}Modo cozinha</button></div>`);
  },
  "fechar-mes": () => abrirFecharMes(),
};
