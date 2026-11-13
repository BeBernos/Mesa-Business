import { S, rerender, hoje, resumoDia, comeu } from "../state.js";
import { log } from "../sync.js";
import { DIAS_SEMANA, diaSemana, semanas, dataCurta, notasDe, ddmm, quantidadesDoLote, fmtQtd, listaDeCompras } from "../plan.js";
import { esc, icon, fmt, md, openSheet, sheetHead, passo } from "../ui.js";
import { topo, pessoasSwitch } from "./hoje.js";

let semanaSel = null;

function semanaAtual() {
  const ws = semanas(S.plano);
  if (semanaSel && ws.some((w) => w.n === semanaSel)) return ws.find((w) => w.n === semanaSel);
  return ws.find((w) => S.data >= w.de && S.data <= w.ate) || ws[0];
}

// ---------- painel do plano: adesão por semana, média do que foi comido contra a meta, peso e água ----------
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function painel() {
  const h = hoje();
  const pid = S.pessoa;
  const pessoa = S.plano.pessoas.find((x) => x.id === pid);
  const passados = S.plano.dias.filter((d) => d.data <= h && d.refeicoes[pid]?.length);
  if (!passados.length) return "";
  const porSemana = semanas(S.plano).map((w) => {
    const ds = passados.filter((d) => d.data >= w.de && d.data <= w.ate);
    const plan = ds.reduce((n, d) => n + d.refeicoes[pid].length, 0);
    const feitas = ds.reduce((n, d) => n + d.refeicoes[pid].filter((m) => comeu(d.data, pid, m.id)).length, 0);
    return { w, plan, pct: plan ? Math.round((feitas / plan) * 100) : null };
  }).filter((x) => x.plan);
  const resumos = passados.map((d) => resumoDia(d.data, pid)).filter((r) => r.refeicoes.some((m) => comeu(r.dia.data, pid, m.id)));
  const pesos = log.all("weight", (r) => r.person === pid && r.day >= S.plano.inicio && r.day <= h && Number(r.v) > 0).sort((a, b) => (a.day < b.day ? -1 : 1));
  const aguas = passados.map((d) => Number(log.get("water", d.data, pid)?.v || 0)).filter(Boolean);
  const tile = (rot, v, sub) => `<div class="tile"><div class="faint" style="font-size:12px">${rot}</div><div class="num" style="font-size:20px;font-weight:700;margin-top:2px">${v}</div><div class="faint" style="font-size:12px">${sub}</div></div>`;
  const tiles = [];
  if (pessoa.crianca) {
    const ac = passados.flatMap((d) => d.refeicoes[pid].map((m) => log.get("aceite", d.data, pid, m.id)?.v)).filter(Boolean);
    const n = (v) => ac.filter((x) => x === v).length;
    if (ac.length) tiles.push(tile("Comeu bem", n("bem"), `de ${ac.length} refeições`), tile("Pouco · recusou", `${n("pouco")} · ${n("recusou")}`, "refeições"));
  } else if (resumos.length) {
    const kcal = media(resumos.map((r) => r.feito.kcal)), meta = media(resumos.map((r) => r.meta.kcal || 0));
    const prot = media(resumos.map((r) => r.feito.proteina)), metaP = media(resumos.map((r) => r.meta.proteina || 0));
    tiles.push(tile("Kcal por dia", Math.round(kcal).toLocaleString("pt-BR"), meta ? `meta ${Math.round(meta).toLocaleString("pt-BR")}` : "comido"));
    tiles.push(tile("Proteína", `${Math.round(prot)} g`, metaP ? `meta ${Math.round(metaP)} g` : "por dia"));
  }
  if (pesos.length >= 2) {
    const dv = +(pesos[pesos.length - 1].v - pesos[0].v).toFixed(1);
    tiles.push(tile("Peso no plano", `${dv > 0 ? "+" : ""}${dv.toLocaleString("pt-BR")} kg`, `${ddmm(pesos[0].day)} → ${ddmm(pesos[pesos.length - 1].day)}`));
  } else if (pesos.length) tiles.push(tile("Peso", `${Number(pesos[0].v).toLocaleString("pt-BR")} kg`, ddmm(pesos[0].day)));
  if (aguas.length) tiles.push(tile("Água", `${(media(aguas) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`, "média dos dias marcados"));
  return `<section class="card painel">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Como está indo o plano</span><span class="faint" style="font-size:12px">${passados.length} dia${passados.length > 1 ? "s" : ""}</span></div>
    <div class="stack" style="gap:8px;margin-top:12px">${porSemana.map((x) => `<div class="sem-linha"><span>Sem ${x.w.n}</span><div class="bar-line"><i style="--c:var(--ac);width:${x.pct}%"></i></div><b class="num">${x.pct}%</b></div>`).join("")}</div>
    <div class="faint" style="font-size:12px;margin-top:6px">refeições marcadas como feitas</div>
    ${tiles.length ? `<div class="tiles">${tiles.join("")}</div>` : ""}
    ${resumos.length && !pessoa.crianca ? `<div class="faint" style="font-size:12px;margin-top:8px">Médias só dos dias com alguma refeição marcada.</div>` : ""}
  </section>`;
}

export function render() {
  const ws = semanas(S.plano);
  const w = semanaAtual();
  const h = hoje();
  const dias = S.plano.dias.filter((d) => d.data >= w.de && d.data <= w.ate);
  const lista = dias.map((d) => {
    const r = resumoDia(d.data, S.pessoa);
    const alm = r.refeicoes.find((m) => m.tipo === "almoco");
    const jan = r.refeicoes.find((m) => m.tipo === "jantar");
    const tipo = S.plano.tiposDeDia[d.tipo[S.pessoa]] || d.tipo[S.pessoa];
    const teste = S.plano.testes.some((t) => t.doses.some((x) => x.data === d.data) && (!t.pessoa || t.pessoa === S.pessoa));
    return `<button class="card tap wday ${d.data === h ? "today" : ""}" style="width:100%;text-align:left;${d.data === h ? "box-shadow:var(--shadow-2),0 0 0 1.5px color-mix(in srgb,var(--ac) 55%,transparent)" : ""}" data-act="ir-dia" data-d="${d.data}">
      <div class="dt"><div class="w">${DIAS_SEMANA[diaSemana(d.data)]}</div><div class="n">${+d.data.slice(8, 10)}</div></div>
      <div style="min-width:0">
        <div class="chips" style="gap:6px;margin-bottom:6px"><span class="badge ${d.tipo[S.pessoa] === "D" ? "" : "ac"}" style="height:24px;font-size:11.5px">${esc(tipo)}</span>${teste ? `<span class="badge" style="height:24px;font-size:11.5px">${icon("flask-conical", "sm")}teste</span>` : ""}</div>
        ${alm ? `<div class="ln ellipsis"><span>Almoço</span> ${esc(alm.titulo || alm.nome)}</div>` : ""}
        ${jan ? `<div class="ln ellipsis"><span>Jantar</span> ${esc(jan.titulo || jan.nome)}</div>` : ""}
      </div>
      <div class="end num" style="text-align:right"><div style="font-weight:650">${fmt(r.plano.kcal)}</div><div class="faint" style="font-size:12px">kcal</div></div>
    </button>`;
  }).join("");

  const lotes = S.plano.lotes.map((l, i) => `<button class="card tap row" style="padding:14px 16px" data-act="lote" data-i="${i}">
    <span class="ico ac">${icon("cooking-pot")}</span><span class="grow"><div class="ttl">${esc(l.titulo)}</div><div class="sub">${l.passos.length} passos${l.quando ? ` · ${esc(l.quando)}` : ""}</div></span>${icon("chevron-right")}</button>`).join("");

  const notas = notasDe(S.plano, "plano", S.pessoa).concat(notasDe(S.plano, "cozinha", S.pessoa));
  const sobre = notas.length ? `<div class="section-title"><h2>Por que o plano é assim</h2></div>
    ${notas.map((n) => `<details class="fold"><summary><span class="tone ${n.tom}"></span>${esc(n.titulo)}${icon("chevron-down", "chev")}</summary><div class="md">${md(n.texto)}</div></details>`).join("")}` : "";

  return `<div class="page">
    ${topo("Semana", esc(S.plano.titulo), `<div class="gap-s"></div>${pessoasSwitch()}`)}
    ${painel()}
    <div class="segs" style="margin-top:12px">${ws.map((x) => `<button class="${x.n === w.n ? "on" : ""}" data-act="semana" data-n="${x.n}" aria-label="Semana ${x.n}, a partir de ${dataCurta(x.de)}">Sem ${x.n}</button>`).join("")}</div>
    <div class="gap-m"></div>
    <div class="stack">${lista}</div>
    ${lotes ? `<div class="section-title"><h2>Cozinha da semana</h2></div><div class="stack">${lotes}</div>` : ""}
    <button class="btn block" style="margin-top:18px" data-act="imprimir">${icon("printer")}Imprimir a semana (cardápio e compras)</button>
    ${sobre}
  </div>`;
}

// ---------- imprimir / PDF: cardápio da semana (todas as pessoas) + lista de compras, para a geladeira ----------
function imprimirSemana() {
  const w = semanaAtual();
  const dias = S.plano.dias.filter((d) => d.data >= w.de && d.data <= w.ate);
  const ps = S.plano.pessoas;
  const cel = (d, p) => (d.refeicoes[p.id] || []).map((m) => `<div><b>${m.hora} ${esc(m.nome)}</b> ${esc(m.titulo || m.itens.map((it) => it.nome).join(", "))}</div>`).join("");
  const compras = listaDeCompras(S.plano, w.de, w.ate);
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
  setTimeout(() => { if (document.body.contains(el) && !matchMedia("print").matches) fim(); }, 60000);
}

export const acts = {
  semana: (b) => { semanaSel = +b.dataset.n; rerender(); },
  "ir-dia": (b) => { S.data = b.dataset.d; S.tab = "hoje"; semanaSel = null; rerender(); scrollTo(0, 0); },
  lote: (b) => {
    const l = S.plano.lotes[+b.dataset.i];
    const w = semanaAtual();
    const qs = quantidadesDoLote(S.plano, l, w.de, w.ate);
    openSheet(`${sheetHead(esc(l.titulo), `${l.quando ? `${esc(l.quando)} · ` : ""}semana ${w.n}`)}
      <div class="sb">${qs.length ? `<div class="card tight" style="margin-bottom:16px"><div class="eyebrow" style="margin-bottom:10px">Quanto fazer · família, semana ${w.n}</div>
        <div class="lote-qtd">${qs.map((q) => `<span>${esc(q.nome)}</span><b>${esc(fmtQtd(q.qtd, q.unid))}</b>${q.pronto ? `<small>${esc(q.pronto)}</small>` : ""}`).join("")}</div></div>` : ""}
        <div class="steps">${l.passos.map((s, i) => passo(md(s).replace(/^<p>|<\/p>$/g, ""), s, `lote-${b.dataset.i}-${i}`, `data-act="passo"`)).join("")}</div><div class="gap-l"></div></div>`);
  },
  imprimir: () => imprimirSemana(),
};
