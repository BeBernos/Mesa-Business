import { S, rerender, hoje, cor } from "../state.js";
import { semanas, listaDeCompras, fmtQtd, dataCurta, slug, custoDaLista, ddmm } from "../plan.js";
import { esc, icon, md, buzz, toast, ICON_CATEGORIA } from "../ui.js";
import { log, LS } from "../sync.js";
import { topo } from "./hoje.js";

let sel = null; // número da semana ou "tudo"
let filtro = ""; // "" = família
let seguirTrocas = LS.get("app_cmp_trocas", true); // a lista segue as opções trocadas (preferência deste celular)
// registro "shop" do período: v "1" = no carrinho, v "casa" = já tem em casa (sai da conta)
const estado = (chave, k) => log.get("shop", chave, "", k)?.v || "";

function periodo() {
  const ws = semanas(S.plano);
  if (sel === "tudo") return { chave: `tudo-${S.plano.inicio}`, de: S.plano.inicio, ate: S.plano.fim, nome: "Plano inteiro" };
  const w = ws.find((x) => x.n === sel) || ws.find((x) => hoje() >= x.de && hoje() <= x.ate) || ws.find((x) => hoje() < x.de) || ws[0];
  return { chave: w.de, de: w.de, ate: w.ate, nome: `Semana ${w.n}`, n: w.n };
}

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
  // custo pelos preços da Cesta (vêm quando a Marina traz a lista da dieta para lá)
  const pc = S.meta?.precosCesta;
  const custo = pc && custoDaLista(cats.filter((c) => c.categoria !== "Extras"), pc.precos);
  const real = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const custoHtml = custo?.comPreco ? `<div class="custo"><span class="ico">${icon("wallet", "sm")}</span><span class="grow"><b>${real(custo.total)}</b> ${per.nome === "Plano inteiro" ? "no plano inteiro" : "nesta semana"}${filtro ? ` (${esc(S.plano.pessoas.find((p) => p.id === filtro)?.nome || "")})` : ""}
      <div class="faint" style="font-size:12px">${custo.comPreco} de ${custo.itens} itens com preço da Cesta · ${ddmm(new Date(pc.quando).toLocaleDateString("en-CA"))}</div></span></div>` : "";
  const qtd = (it) => (it.qtd != null ? esc(fmtQtd(it.qtd, it.unid)) : it.extra ? "" : "a gosto");

  const secoes = cats.map((c) => {
    const its = c.itens.map((it) => ({ ...it, e: estado(per.chave, it.chave) })).filter((it) => it.e !== "casa").sort((a, b) => !!a.e - !!b.e);
    if (!its.length) return "";
    const n = its.filter((x) => x.e).length;
    return `<div class="cat-h"><span class="ico">${icon(ICON_CATEGORIA[c.categoria] || (c.categoria === "Extras" ? "plus" : "package"))}</span>${esc(c.categoria)}<span class="c">${n}/${its.length}</span></div>
      <div class="rows shop">${its.map((it) => `<div class="row ${it.e ? "got" : ""}"><button class="pegar" data-act="pegar" data-k="${esc(it.chave)}" aria-pressed="${!!it.e}">
        <span class="box">${icon("check")}</span><span class="grow ttl">${esc(it.nome)}</span><span class="end">${qtd(it)}</span></button>
        ${it.e ? "" : `<button class="icon-btn" data-act="casa" data-k="${esc(it.chave)}" aria-label="Já tenho ${esc(it.nome)} em casa">${icon("archive", "sm")}</button>`}</div>`).join("")}</div>`;
  }).join("") + (emCasa.length ? `<div class="cat-h"><span class="ico">${icon("archive")}</span>Já tem em casa<span class="c">${emCasa.length}</span></div>
      <div class="rows shop casa">${emCasa.map((it) => `<div class="row"><span class="pegar"><span class="grow ttl">${esc(it.nome)}</span><span class="end">${qtd(it)}</span></span>
        <button class="btn sm" data-act="casa" data-k="${esc(it.chave)}">Comprar</button></div>`).join("")}</div>` : "");

  const filtros = [["", "Família"], ...S.plano.pessoas.map((p) => [p.id, p.nome])];
  return `<div class="page">
    ${topo("Compras", esc(`${per.nome} · ${dataCurta(per.de)} – ${dataCurta(per.ate)}`))}
    <div class="segs"><button class="${sel === "tudo" ? "on" : ""}" data-act="cmp-semana" data-n="tudo" aria-label="Plano inteiro">Tudo</button>${ws.map((w) => `<button class="${per.n === w.n ? "on" : ""}" data-act="cmp-semana" data-n="${w.n}" aria-label="Semana ${w.n}">Sem ${w.n}</button>`).join("")}</div>
    <div class="gap-s"></div>
    <div class="scroll-x">${filtros.map(([id, nome]) => `<button class="chip small ${id ? "pc" : ""} ${filtro === id ? "on" : ""}" style="--pc:${id ? cor(id) : "var(--text)"}" data-act="cmp-filtro" data-p="${esc(id)}">${esc(nome)}</button>`).join("")}</div>
    <div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px"><span style="font-weight:650">${pegos === total && total ? "Tudo no carrinho 🎉" : "No carrinho"}</span><span class="num muted">${pegos} de ${total}</span></div>
      <div class="progress"><i style="width:${total ? (pegos / total) * 100 : 0}%"></i></div>
      ${custoHtml}
      <div class="muted" style="font-size:12.5px;margin-top:10px">Sincroniza entre os celulares — dá pra dividir a lista no mercado. Toque em ${icon("archive", "sm")} no que já tem em casa.</div>
      <label class="row" style="padding:12px 0 0;min-height:0;margin-top:12px;border-top:1px solid var(--line)"><span class="grow"><div class="ttl">Seguir as trocas de opção</div>
        <div class="sub">${trocas ? `${trocas} troca${trocas > 1 ? "s" : ""} neste período` : "Nenhuma troca neste período"} · ${seguirTrocas ? "a lista usa a opção escolhida" : "a lista usa a opção do plano"}</div></span>
        <span class="switch"><input type="checkbox" data-act="cmp-trocas" ${seguirTrocas ? "checked" : ""}><span></span></span></label>
    </div>
    ${secoes}
    <form class="card tight" style="margin-top:18px;display:flex;gap:10px" data-form="extra">
      <input class="input" name="nome" placeholder="Adicionar item (ex.: papel-toalha)" autocomplete="off" style="height:44px">
      <button class="btn sm primary" type="submit" aria-label="Adicionar">${icon("plus")}</button></form>
    ${S.plano.compras.observacoes.length ? `<div class="stack" style="margin-top:18px">${S.plano.compras.observacoes.map((o) => `<div class="note">${icon("info")}<div class="md">${md(o)}</div></div>`).join("")}</div>` : ""}
    ${pegos ? `<div class="center" style="margin-top:18px"><button class="btn ghost sm" data-act="cmp-limpar">Desmarcar tudo</button></div>` : ""}
  </div>`;
}

export const acts = {
  "cmp-semana": (b) => { sel = b.dataset.n === "tudo" ? "tudo" : +b.dataset.n; rerender(); },
  "cmp-filtro": (b) => { filtro = b.dataset.p; rerender(); },
  pegar: (b) => { log.toggle("shop", periodo().chave, "", b.dataset.k); buzz(); rerender(); },
  casa: (b) => {
    const per = periodo();
    if (estado(per.chave, b.dataset.k) === "casa") log.del("shop", per.chave, "", b.dataset.k);
    else { log.set("shop", per.chave, "", b.dataset.k, "casa"); toast("Fora da lista: já tem em casa", 4000, { rotulo: "Desfazer", fn: () => { log.del("shop", per.chave, "", b.dataset.k); rerender(); } }); }
    buzz();
    rerender();
  },
  "cmp-trocas": (b) => { seguirTrocas = b.checked; LS.set("app_cmp_trocas", seguirTrocas); rerender(); },
  "cmp-limpar": () => {
    const per = periodo();
    for (const r of log.all("shop", (x) => x.day === per.chave && x.v !== "casa")) log.del("shop", per.chave, "", r.k);
    rerender();
  },
};

export const forms = {
  extra: (f) => {
    const nome = f.nome.value.trim();
    if (!nome) return;
    const per = periodo();
    log.set("shopx", per.chave, "", `${slug(nome)}-${Date.now().toString(36).slice(-4)}`, JSON.stringify({ nome }));
    rerender();
  },
};
