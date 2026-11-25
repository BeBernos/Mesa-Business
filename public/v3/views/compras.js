// Compras (spec §7.7): por seção do mercado, no carrinho / já tenho em casa, extras, seguir as trocas de opção e o custo
// pelos preços da Cesta. Registro "shop"/"shopx" por período: sincroniza entre os celulares e dá para dividir no mercado.
import { S, rerender, hoje, cor } from "../../js/state.js";
import { semanas, listaDeCompras, fmtQtd, slug, custoDaLista, ddmm, somaDias } from "../../js/plan.js";
import { log, LS } from "../../js/sync.js";
import { md } from "../../js/ui.js";
import { esc, icon, topo, toast } from "../ui.js";

let sel = null; // número da semana, "tudo" ou "m:AAAA-MM" (mês do calendário)
let filtro = ""; // "" = família
let seguirTrocas = LS.get("app_cmp_trocas", true); // preferência deste celular
// registro "shop" do período: v "1" = no carrinho, v "casa" = já tem em casa (sai da conta)
const estado = (chave, k) => log.get("shop", chave, "", k)?.v || "";

/** Meses do calendário que o plano cobre (o primeiro e o último podem vir pela metade). */
function meses() {
  const prox = (m) => { const [a, n] = m.split("-").map(Number); return n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, "0")}`; };
  const out = [];
  for (let m = S.plano.inicio.slice(0, 7); m <= S.plano.fim.slice(0, 7); m = prox(m)) {
    const nome = new Date(`${m}-15T12:00`).toLocaleDateString("pt-BR", { month: "long" }).replace(/^./, (c) => c.toUpperCase());
    const fimMes = somaDias(`${prox(m)}-01`, -1);
    out.push({ id: `m:${m}`, nome, de: S.plano.inicio > `${m}-01` ? S.plano.inicio : `${m}-01`, ate: S.plano.fim < fimMes ? S.plano.fim : fimMes });
  }
  return out;
}

function periodo() {
  const ws = semanas(S.plano);
  if (sel === "tudo") return { chave: `tudo-${S.plano.inicio}`, de: S.plano.inicio, ate: S.plano.fim, nome: "Plano inteiro", custo: "no plano inteiro" };
  const mes = typeof sel === "string" && meses().find((x) => x.id === sel);
  if (mes) return { chave: `mes-${mes.id.slice(2)}`, de: mes.de, ate: mes.ate, nome: mes.nome, custo: "no mês", m: mes.id };
  const w = ws.find((x) => x.n === sel) || ws.find((x) => hoje() >= x.de && hoje() <= x.ate) || ws.find((x) => hoje() < x.de) || ws[0];
  return { chave: w.de, de: w.de, ate: w.ate, nome: `Semana ${w.n}`, n: w.n, custo: "nesta semana" };
}
const real = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function render() {
  const ws = semanas(S.plano);
  const per = periodo();
  const opcao = seguirTrocas ? (d, pid, id) => log.get("swap", d, pid, id)?.v || 0 : null;
  const trocas = log.all("swap", (r) => r.day >= per.de && r.day <= per.ate && Number(r.v) > 0 && (!filtro || r.person === filtro)).length;
  const cats = listaDeCompras(S.plano, per.de, per.ate, filtro, opcao);
  const extras = log.all("shopx", (r) => r.day === per.chave).map((r) => { try { return { ...JSON.parse(r.v), k: r.k }; } catch (e) { return null; } }).filter(Boolean);
  if (extras.length) cats.push({ categoria: "Extras", itens: extras.map((x) => ({ nome: x.nome, qtd: null, unid: "", chave: `x-${x.k}`, extra: x.k })) });

  let total = 0, pegos = 0;
  const emCasa = [];
  for (const c of cats) for (const it of c.itens) {
    const e = estado(per.chave, it.chave);
    if (e === "casa") { emCasa.push(it); continue; }
    total++;
    if (e) pegos++;
  }
  const pc = S.meta?.precosCesta;
  const custo = pc && custoDaLista(cats.filter((c) => c.categoria !== "Extras"), pc.precos);
  const qtd = (it) => (it.qtd != null ? esc(fmtQtd(it.qtd, it.unid)) : it.extra ? "" : "a gosto");

  const secoes = cats.map((c) => {
    const its = c.itens.map((it) => ({ ...it, e: estado(per.chave, it.chave) })).filter((it) => it.e !== "casa").sort((a, b) => !!a.e - !!b.e);
    if (!its.length) return "";
    return `<div class="sec" style="margin-top:1.25rem"><span>${esc(c.categoria)}</span><span>${its.filter((x) => x.e).length}/${its.length}</span></div>
      <div class="rows">${its.map((it) => `<div class="row item-c ${it.e ? "pego" : ""}">
        <button class="pegar" data-act="pegar" data-k="${esc(it.chave)}" aria-pressed="${!!it.e}"><span class="box">${icon("check", "sm")}</span><span class="grow">${esc(it.nome)}</span><span class="end num">${qtd(it)}</span></button>
        ${it.e ? "" : `<button class="btn txt" data-act="casa" data-k="${esc(it.chave)}" aria-label="Já tenho ${esc(it.nome)} em casa">${icon("archive", "sm")}</button>`}</div>`).join("")}</div>`;
  }).join("") + (emCasa.length ? `<div class="sec" style="margin-top:1.25rem"><span>Já tem em casa</span><span>${emCasa.length}</span></div>
      <div class="rows">${emCasa.map((it) => `<div class="row item-c casa"><span class="grow">${esc(it.nome)}</span><span class="end num">${qtd(it)}</span>
        <button class="btn txt" data-act="casa" data-k="${esc(it.chave)}" aria-label="Comprar ${esc(it.nome)}">Comprar</button></div>`).join("")}</div>` : "");

  const filtros = [["", "Família"], ...S.plano.pessoas.map((p) => [p.id, p.nome])];
  return `<div class="page compras">${topo("Compras", `${per.nome} · ${ddmm(per.de)} a ${ddmm(per.ate)}`)}
    <div class="chips"><button class="chip ${sel === "tudo" ? "on" : ""}" data-act="cmp-semana" data-n="tudo" aria-pressed="${sel === "tudo"}">Tudo</button>${meses().map((m) => `<button class="chip ${per.m === m.id ? "on" : ""}" data-act="cmp-semana" data-n="${m.id}" aria-pressed="${per.m === m.id}" aria-label="${m.nome}">${m.nome.slice(0, 3)}</button>`).join("")}${ws.map((w) => `<button class="chip ${per.n === w.n ? "on" : ""}" data-act="cmp-semana" data-n="${w.n}" aria-pressed="${per.n === w.n}">Sem ${w.n}</button>`).join("")}</div>
    <div class="chips">${filtros.map(([id, nome]) => `<button class="chip ${filtro === id ? "on" : ""}" style="${id ? `--ac:${cor(id)}` : ""}" data-act="cmp-filtro" data-p="${esc(id)}" aria-pressed="${filtro === id}">${esc(nome)}</button>`).join("")}</div>
    <div class="glass card" style="margin-top:.75rem">
      <div class="lado-a-lado"><b>${pegos === total && total ? "Tudo no carrinho 🎉" : "No carrinho"}</b><span class="num muted">${pegos} de ${total}</span></div>
      <i class="barra-c" style="--p:${total ? pegos / total : 0}"></i>
      ${custo?.comPreco ? `<p style="margin:.625rem 0 0">${icon("wallet", "sm")} <b>${real(custo.total)}</b> ${per.custo} <span class="muted">· ${custo.comPreco} de ${custo.itens} itens com preço da Cesta</span></p>` : ""}
      <p class="muted" style="margin:.625rem 0 0">Sincroniza entre os celulares — dá para dividir a lista no mercado. ${icon("archive", "sm")} = já tenho em casa.</p>
      <label class="lado-a-lado" style="margin-top:.75rem"><span><div>Seguir as trocas de opção</div><small class="muted">${trocas ? `${trocas} troca${trocas > 1 ? "s" : ""} neste período` : "Nenhuma troca neste período"}</small></span>
        <input type="checkbox" data-act="cmp-trocas" ${seguirTrocas ? "checked" : ""} aria-label="Seguir as trocas de opção"></label></div>
    ${secoes}
    <form class="lado2" data-form="extra" style="margin-top:1.25rem"><input class="input" name="extra" placeholder="Adicionar item (ex.: papel-toalha)" autocomplete="off" aria-label="Item extra">
      <button class="btn cta" type="submit">${icon("plus", "sm")}Adicionar</button></form>
    ${S.plano.compras.observacoes.length ? `<div class="regras" style="margin-top:1rem">${S.plano.compras.observacoes.map((o) => `<div class="glass card md">${md(o)}</div>`).join("")}</div>` : ""}
    ${pegos ? `<div style="text-align:center;margin-top:1rem"><button class="btn txt" data-act="cmp-limpar">Desmarcar tudo</button></div>` : ""}</div>`;
}

export const acts = {
  "cmp-semana": (b) => { const n = b.dataset.n; sel = n === "tudo" || n.startsWith("m:") ? n : +n; rerender(); },
  "cmp-filtro": (b) => { filtro = b.dataset.p; rerender(); },
  pegar: (b) => { log.toggle("shop", periodo().chave, "", b.dataset.k); },
  casa: (b) => {
    const per = periodo(), k = b.dataset.k;
    if (estado(per.chave, k) === "casa") log.del("shop", per.chave, "", k);
    else { log.set("shop", per.chave, "", k, "casa"); toast("Fora da lista: já tem em casa", () => log.del("shop", per.chave, "", k)); }
  },
  "cmp-trocas": () => { seguirTrocas = !seguirTrocas; LS.set("app_cmp_trocas", seguirTrocas); rerender(); }, // o clique global cancela o padrão: o valor vira aqui
  "cmp-limpar": () => {
    const per = periodo();
    const marcados = log.all("shop", (x) => x.day === per.chave && x.v !== "casa");
    for (const r of marcados) log.del("shop", per.chave, "", r.k);
    toast("Lista desmarcada", () => { for (const r of marcados) log.set("shop", per.chave, "", r.k, r.v); });
  },
};

// formulário (o Enter do teclado do celular também adiciona)
export const forms = {
  extra: (f) => {
    const nome = f.extra.value.trim();
    if (!nome) return;
    log.set("shopx", periodo().chave, "", `${slug(nome)}-${Date.now().toString(36).slice(-4)}`, JSON.stringify({ nome: nome.slice(0, 60) }));
  },
};
