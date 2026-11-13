import { S, rerender, hoje, agoraMin, minDe, resumoDia, comeu, treinou, cor, escolhida, parcial, pesoRecente } from "../state.js";
import { DIAS_SEMANA, DIAS_LONGOS, MESES, diaSemana, fmtQtd, cozido, testesDoDia, consumido, metaAgua, difDias, horaPeloPulse } from "../plan.js";
import { esc, icon, fmt, md, ring, openSheet, closeSheet, sheetHead, topSheet, buzz, toast, passo, ICON_REFEICAO } from "../ui.js";
import { log } from "../sync.js";

// ---------- partes reaproveitadas por outras telas ----------
export function pessoasSwitch() {
  return `<div class="people" role="tablist">${S.plano.pessoas.map((p) => `
    <button class="person ${S.pessoa === p.id ? "on" : ""}" style="--pc:${cor(p.id)}" data-act="pessoa" data-p="${esc(p.id)}" role="tab">
      <span class="av">${esc(p.nome[0])}</span>${esc(p.nome)}</button>`).join("")}</div>`;
}

export function topo(titulo, eyebrow, extra = "") {
  const semPush = S.cfg && !S.cfg.hasPush;
  const fila = log.esperando();
  return `<header class="top"><div class="top-row">
      <div style="min-width:0"><div class="eyebrow"><span class="marca" aria-hidden="true"><i></i><i></i><i></i></span>${eyebrow}</div><div class="h1">${titulo}</div></div>
      <div class="top-acts"><button class="icon-btn" data-act="busca" aria-label="Buscar no plano">${icon("search", "lg")}</button>
      <button class="icon-btn" data-act="ajustes" aria-label="Ajustes">${icon("settings", "lg")}${semPush ? `<span class="dot"></span>` : ""}</button></div>
    </div>${fila ? `<div class="fila" role="status">${icon("cloud-off", "sm")}${fila === 1 ? "1 alteração esperando internet" : `${fila} alterações esperando internet`}</div>` : ""}${extra}</header>`;
}

const saudacao = () => { const h = agoraMin() / 60; return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; };
export const dataLonga = (d) => `${DIAS_LONGOS[diaSemana(d)]}, ${+d.slice(8, 10)} de ${MESES[+d.slice(5, 7) - 1]}`;

function faixaDias() {
  const h = hoje();
  return `<div class="days" id="days">${S.plano.dias.map((d) => {
    const t = d.tipo[S.pessoa];
    const descanso = t === "D";
    return `<button class="day ${d.data === S.data ? "on" : ""} ${d.data === h ? "today" : ""} ${d.data < h ? "past" : ""}" data-act="data" data-d="${d.data}" ${d.data === S.data ? 'id="day-on"' : ""}>
      <span class="wd">${DIAS_SEMANA[diaSemana(d.data)].slice(0, 3)}</span><span class="dn">${+d.data.slice(8, 10)}</span><span class="tp ${descanso ? "rest" : ""}"></span></button>`;
  }).join("")}</div>`;
}

function preview(m) {
  const its = m.itens.slice(0, 3).map((it) => `${esc(it.nome.toLowerCase())} <b>${esc(fmtQtd(it.qtd, it.unid))}</b>`).join(" · ");
  return its + (m.itens.length > 3 ? ` <span class="faint">+${m.itens.length - 3}</span>` : "");
}

function emQuanto(min) {
  if (min <= 0) return "agora";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `em ${h}h${m ? String(m).padStart(2, "0") : ""}` : `em ${m} min`;
}

// ---------- tela ----------
export function render() {
  const p = S.plano.pessoas.find((x) => x.id === S.pessoa);
  const r = resumoDia(S.data, S.pessoa);
  const ehHoje = S.data === hoje();
  const futuro = S.data > hoje();
  const agora = agoraMin();

  let proxima = null;
  if (ehHoje) proxima = r.refeicoes.find((m) => !comeu(S.data, S.pessoa, m.id) && minDe(m.hora) >= agora - 45);

  const titulo = ehHoje ? `${saudacao()}, ${esc(p.nome)}` : esc(dataLonga(S.data).replace(/^./, (c) => c.toUpperCase()));
  const eyebrow = ehHoje ? esc(dataLonga(S.data)) : futuro ? "Planejado" : "Dia anterior";

  if (!r.dia) {
    return `<div class="page">${topo(titulo, eyebrow, `<div class="gap-s"></div>${pessoasSwitch()}${faixaDias()}`)}
      <div class="empty" style="min-height:40dvh"><p>Sem cardápio para este dia.</p></div></div>`;
  }

  // resumo
  const ctx = r.dia.contexto[S.pessoa];
  const base = futuro ? r.plano : r.feito;
  const pct = r.meta.kcal ? base.kcal / r.meta.kcal : 0;
  const feitas = r.refeicoes.filter((m) => comeu(S.data, S.pessoa, m.id)).length;
  const tipoNome = S.plano.tiposDeDia[r.naoTreinou ? "D" : r.tipo] || r.tipo;
  const crianca = p.crianca;
  const hero = crianca ? heroCrianca(r, p, proxima, agora, ctx) : `<section class="card hero">
    <div class="hero-grid">
      ${ring(pct, fmt(base.kcal), futuro ? `kcal no plano` : `de ${fmt(r.meta.kcal)} kcal`)}
      <div class="macros">
        <div class="macro"><div class="lbl"><span>Proteína</span><b>${fmt(base.proteina)}${r.meta.proteina ? ` / ${fmt(r.meta.proteina)}` : ""} g</b></div>
          <div class="bar-line"><i style="--c:var(--prot);width:${r.meta.proteina ? Math.min(100, (base.proteina / r.meta.proteina) * 100) : 0}%"></i></div></div>
        ${futuro ? `<div class="macro"><div class="lbl"><span>Meta do dia</span><b>${fmt(r.meta.kcal)} kcal</b></div>
          <div class="bar-line"><i style="--c:var(--kcal);width:${Math.min(100, pct * 100)}%"></i></div></div>`
        : `<div class="macro"><div class="lbl"><span>Refeições</span><b>${feitas} / ${r.refeicoes.length}</b></div>
          <div class="bar-line"><i style="--c:var(--ac);width:${r.refeicoes.length ? (feitas / r.refeicoes.length) * 100 : 0}%"></i></div></div>`}
        <div class="chips"><span class="badge ac">${icon(r.tipo === "D" || r.naoTreinou ? "bed" : "dumbbell")}${esc(tipoNome)}${r.pulse?.treino && r.pulse.hora && !r.naoTreinou ? ` · ${r.pulse.hora}` : ""}</span>${r.pulse ? `<span class="badge" title="${esc(r.pulse.nome || "")}">pelo Pulse</span>` : ""}</div>
      </div>
    </div>
    ${proxima ? `<div class="hero-foot">${icon("clock", "sm")}<span>Próxima: <b>${esc(proxima.nome)}</b> às ${proxima.hora} · ${emQuanto(minDe(proxima.hora) - agora)}</span></div>`
      : ctx ? `<div class="hero-foot">${icon("sparkles", "sm")}<span>${esc(ctx)}</span></div>` : ""}
  </section>`;

  // avisos do dia
  const avisos = [];
  if (crianca && p.restricoes.length) avisos.push(`<div class="note alerta">${icon("triangle-alert")}<div><div class="t">${esc(p.restricoes.join(" · "))}</div>Vale para tudo o que ${esc(p.nome)} comer, também fora do plano.</div></div>`);
  if (proxima && ctx) avisos.push(`<div class="note info">${icon("info")}<div>${esc(ctx)}</div></div>`);
  if (r.dia.destaque) avisos.push(`<div class="note info">${icon("sparkles")}<div>${esc(r.dia.destaque)}</div></div>`);
  for (const a of r.dia.avisos.filter((a) => !a.pessoa || a.pessoa === S.pessoa)) {
    avisos.push(`<div class="note ${a.tom}">${icon(a.tom === "ok" ? "circle-check" : a.tom === "alerta" ? "flask-conical" : "info")}<div>${a.titulo ? `<div class="t">${esc(a.titulo)}</div>` : ""}<div class="md">${md(a.texto)}</div></div></div>`);
  }
  if (!r.dia.avisos.length) for (const { teste, dose } of testesDoDia(S.plano, S.data, S.pessoa)) {
    avisos.push(`<div class="note alerta">${icon("flask-conical")}<div><div class="t">Teste · ${esc(teste.alimento || teste.grupo)} · dose ${dose.n}/${teste.doses.length}</div>${esc(dose.texto || dose.quantidade)}</div></div>`);
  }
  if (r.dia.seNaoTreinar[S.pessoa]) {
    const t = treinou(S.data, S.pessoa);
    avisos.push(`<div class="card tight"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <span style="font-weight:600">Treinou hoje?</span>
      <div class="seg" style="margin:0"><button class="${t ? "on" : ""}" data-v="ok" data-act="treino" data-t="1">Sim</button><button class="${!t ? "on" : ""}" data-v="leve" data-act="treino" data-t="0">Não</button></div></div>
      ${!t ? `<div class="md" style="margin-top:10px">${md(r.dia.seNaoTreinar[S.pessoa])}</div>` : ""}</div>`);
  }

  // gasto do cardio registrado no Pulse (app de treino) hoje
  const gasto = log.get("burn", S.data, S.pessoa);
  if (gasto && Number(gasto.v) > 0) {
    avisos.push(`<div class="card tight"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <span style="font-weight:600">Cardio no Pulse</span><span class="num" style="font-weight:650">${Math.round(Number(gasto.v))} kcal</span></div>
      <div class="faint" style="font-size:12.5px;margin-top:4px">Gasto registrado no treino de hoje.</div></div>`);
  }

  // próximo plano (ou o aviso de que o atual está acabando)
  const prox = proximoPlano();
  if (prox) avisos.unshift(prox);

  // água: toque rápido de 250 ml (não aparece em dia futuro)
  if (!futuro) {
    const ml = Number(log.get("water", S.data, S.pessoa)?.v || 0);
    const meta = metaAgua(S.plano, S.pessoa, pesoRecente(S.pessoa));
    const L = (v) => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    avisos.push(`<div class="card tight agua"><span class="ico">${icon("droplet")}</span>
      <div class="grow"><div class="lbl"><span>Água</span><b class="num">${L(ml)} / ${L(meta)} L</b></div>
        <div class="bar-line"><i style="--c:var(--ok);width:${Math.min(100, (ml / meta) * 100)}%"></i></div></div>
      ${ml ? `<button class="icon-btn" data-act="agua" data-v="-250" aria-label="Tirar um copo (250 ml)">${icon("minus")}</button>` : ""}
      <button class="btn sm" data-act="agua" data-v="250" aria-label="Mais um copo (250 ml)">${icon("plus")}copo</button></div>`);
  }

  // linha do tempo
  const linhas = r.refeicoes.map((m) => {
    const feito = comeu(S.data, S.pessoa, m.id);
    const prox = proxima && proxima.id === m.id;
    const quando = prox ? emQuanto(minDe(m.hora) - agora) : "";
    return `<div class="meal ${feito ? "done" : ""} ${prox ? "next" : ""}">
      <div class="rail"><span class="time">${m.hora}</span><span class="kind">${icon(ICON_REFEICAO[m.tipo] || "utensils")}</span></div>
      <div class="body" role="button" tabindex="0" data-act="refeicao" data-id="${esc(m.id)}">
        <div style="min-width:0">
          <div class="nm">${esc(m.nome)}${prox ? `<span class="now">· ${quando}</span>` : ""}</div>
          <div class="tt">${esc(m.titulo || m.nome)}</div>
          <div class="its">${preview(m)}</div>
          <div class="mx">${crianca ? aceiteHtml(m, feito) : ""}${!crianca && m.kcal != null ? `<span><i style="--c:var(--kcal)"></i>${fmt(m.kcal)} kcal</span>` : ""}${!crianca && m.proteina != null ? `<span><i style="--c:var(--prot)"></i>${fmt(m.proteina)}g prot</span>` : ""}${m.familia ? `<span>${icon("house", "sm")}família</span>` : ""}${m.alternativas?.length ? `<span>${icon("refresh-cw", "sm")}${m.escolha ? `trocada · opção ${m.numero || m.escolha + 1}` : `${m.alternativas.length + 1} opções`}</span>` : ""}${parteHtml(m, feito)}${pulseHtml(m, r)}</div>
        </div>
        <button class="check ${feito ? "on" : ""}" data-act="comi" data-id="${esc(m.id)}" aria-label="${feito ? "Desmarcar" : "Marcar como feita"}">${icon("check")}</button>
      </div></div>`;
  }).join("");

  const preparo = r.dia.preparo.length ? `<button class="card tap row" style="padding:14px 16px;margin-top:12px" data-act="preparo">
      <span class="ico ac">${icon("chef-hat")}</span><span class="grow"><div class="ttl">Preparo de hoje</div><div class="sub">${r.dia.preparo.length} passos · modo cozinha</div></span>${icon("chevron-right")}</button>` : "";

  const regras = S.plano.regras.length ? `<div class="section-title"><h2>Regras do plano</h2></div>
    <div class="stack">${S.plano.regras.map((t) => `<div class="note">${icon("info")}<div class="md">${md(t)}</div></div>`).join("")}</div>` : "";

  return `<div class="page">
    ${topo(titulo, eyebrow, `<div class="gap-s"></div>${pessoasSwitch()}${faixaDias()}`)}
    <div class="gap-s"></div>
    ${hero}
    ${avisos.length ? `<div class="stack" style="margin-top:12px">${avisos.join("")}</div>` : ""}
    <div class="section-title"><h2>Refeições</h2><span class="faint num" style="font-size:13px">${fmt(r.plano.kcal)} kcal · ${fmt(r.plano.proteina)}g prot</span></div>
    <div class="timeline">${linhas}</div>
    ${preparo}
    ${regras}
  </div>`;
}

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function proximoPlano() {
  if (S.viewing || !S.planoInfo || !S.meta?.history) return "";
  const h = hoje();
  const prox = S.meta.history.filter((p) => p.kind === "v2" && p.from > h && p.id !== S.planoInfo.id).sort((a, b) => (a.from < b.from ? -1 : 1))[0];
  if (prox) {
    const n = difDias(h, prox.from);
    return `<div class="note info">${icon("calendar-days")}<div style="flex:1"><div class="t">O plano de ${MESES_LONGOS[+prox.from.slice(5, 7) - 1]} já chegou</div>
      Começa ${n === 1 ? "amanhã" : `em ${n} dias`} (${+prox.from.slice(8, 10)}/${prox.from.slice(5, 7)}). Dá para ver o cardápio e já fazer a compra da 1ª semana.
      <div class="chips" style="margin-top:10px"><button class="btn sm" data-act="ver-proximo" data-id="${prox.id}">Ver o plano</button><button class="btn sm" data-act="ver-proximo" data-id="${prox.id}" data-tab="compras">${icon("shopping-cart")}Compras</button></div></div></div>`;
  }
  const fim = S.planoInfo.to;
  const faltam = fim ? difDias(h, fim) : 99;
  if (faltam >= 0 && faltam <= 3) {
    return `<div class="note alerta">${icon("calendar-days")}<div style="flex:1"><div class="t">O plano acaba ${faltam === 0 ? "hoje" : faltam === 1 ? "amanhã" : `em ${faltam} dias`}</div>
      Peça o próximo ao Claude: com o conector (Ajustes → Claude) ele lê o feedback do mês e publica aqui.</div></div>`;
  }
  return "";
}

export function afterRender() {
  const on = document.getElementById("day-on");
  if (on) on.scrollIntoView({ inline: "center", block: "nearest" });
}

// ---------- ficha da refeição ----------
function refeicaoAtual(id) {
  const r = resumoDia(S.data, S.pessoa);
  return r.refeicoes.find((m) => m.id === id);
}

function porcoesFamilia(m) {
  if (!m.familia) return "";
  const outros = S.plano.pessoas.filter((p) => p.id !== S.pessoa).map((p) => {
    const ms = (S.plano.dias.find((d) => d.data === S.data)?.refeicoes[p.id]) || [];
    const par = ms.find((x) => x.tipo === m.tipo && x.familia) || ms.find((x) => x.tipo === m.tipo);
    return par ? { p, m: escolhida(S.data, p.id, par) } : null;
  }).filter(Boolean);
  if (!outros.length) return "";
  const comuns = new Set(m.itens.map((it) => it.nome));
  return `<div class="section-title"><h2>Mesma comida, outras porções</h2></div>
    <div class="portion" style="--n:${outros.length}">${outros.map(({ p, m: x }) => `<div><div class="who" style="--pc:${cor(p.id)}"><i></i>${esc(p.nome)}</div>
      <div class="q">${[...x.itens].sort((a, b) => comuns.has(b.nome) - comuns.has(a.nome)).slice(0, 4).map((it) => `${esc(it.nome)} <b>${esc(fmtQtd(it.qtd, it.unid))}</b>`).join("<br>")}</div></div>`).join("")}</div>`;
}

/** Lista das opções da refeição (a do plano + alternativas), com a escolhida marcada. */
function opcoesHtml(m) {
  if (!m.alternativas?.length) return "";
  const base = S.plano.dias.find((d) => d.data === S.data)?.refeicoes[S.pessoa]?.find((x) => x.id === m.id);
  // na ordem do plano (Opção 1, 2, 3); data-i continua sendo a posição: 0 = a do dia, 1.. = alternativas
  const todas = [base, ...m.alternativas].map((o, i) => ({ o, i })).filter((x) => x.o).sort((a, b) => (a.o.numero || 0) - (b.o.numero || 0));
  return `<div class="section-title" id="opcoes"><h2>Opções</h2><span class="faint" style="font-size:12.5px">toque para trocar</span></div>
    <div class="rows">${todas.map(({ o, i }) => `<button class="row" data-act="trocar" data-id="${esc(m.id)}" data-i="${i}" aria-pressed="${m.escolha === i}">
      <span class="box" style="${m.escolha === i ? "background:var(--ac);box-shadow:none;color:#fff" : ""}">${icon("check")}</span>
      <span class="grow"><div class="ttl">${esc(o.titulo || o.nome)}</div><div class="sub">${o.itens.slice(0, 3).map((it) => esc(it.nome.toLowerCase())).join(" · ")}</div></span>
      <span class="end">${o.kcal != null ? `${fmt(o.kcal)} kcal` : ""}${o.proteina != null ? `<div class="faint" style="font-size:12px">${fmt(o.proteina)}g prot</div>` : ""}</span></button>`).join("")}</div>`;
}

/** Pré/pós-treino: o horário que combina com o treino marcado no Pulse, quando difere do plano. */
function pulseHtml(m, r) {
  const h = !r.naoTreinou && r.pulse?.treino && horaPeloPulse(m, r.pulse.hora);
  return h && h !== m.hora ? `<span>${icon("dumbbell", "sm")}treino às ${r.pulse.hora} no Pulse → ${h}</span>` : "";
}

/** Rótulo do cartão quando a pessoa comeu só parte ou outra coisa. */
function parteHtml(m, feito) {
  const p = feito && parcial(S.data, S.pessoa, m.id);
  if (!p) return "";
  const c = consumido(m, p.fora || [], p.outraKcal);
  return `<span>${icon("notebook-pen", "sm")}${p.outra ? "outra coisa" : "comeu parte"} · ~${fmt(c.kcal)} kcal</span>`;
}

const ACEITE = [["bem", "Comeu bem"], ["pouco", "Comeu pouco"], ["recusou", "Recusou"]];
const aceite = (id) => log.get("aceite", S.data, S.pessoa, id)?.v || "";
function aceiteHtml(m, feito) {
  const a = feito && aceite(m.id);
  return a ? `<span style="color:${a === "bem" ? "var(--ok)" : a === "pouco" ? "var(--warn)" : "var(--bad)"};font-weight:600">${ACEITE.find((x) => x[0] === a)[1].toLowerCase()}</span>` : "";
}
function heroCrianca(r, p, proxima, agora, ctx) {
  const vs = r.refeicoes.map((m) => (comeu(S.data, S.pessoa, m.id) ? aceite(m.id) || "bem" : ""));
  const n = (v) => vs.filter((x) => x === v).length;
  return `<section class="card hero">
    <div class="eyebrow">Como ${esc(p.nome)} comeu</div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-top:8px"><span class="num" style="font-size:40px;font-weight:750;line-height:1">${vs.filter(Boolean).length}</span><span class="muted">de ${r.refeicoes.length} refeições marcadas</span></div>
    <div class="chips" style="margin-top:12px">${ACEITE.map(([k, l]) => `<span class="badge">${l} · <b class="num">${n(k)}</b></span>`).join("")}</div>
    ${proxima ? `<div class="hero-foot">${icon("clock", "sm")}<span>Próxima: <b>${esc(proxima.nome)}</b> às ${proxima.hora} · ${emQuanto(minDe(proxima.hora) - agora)}</span></div>`
      : ctx ? `<div class="hero-foot">${icon("sparkles", "sm")}<span>${esc(ctx)}</span></div>` : ""}
  </section>`;
}

function fichaRefeicao(m) {
  const feito = comeu(S.data, S.pessoa, m.id);
  const crianca = S.plano.pessoas.find((x) => x.id === S.pessoa)?.crianca;
  const macros = [["kcal", m.kcal, "kcal", "--kcal"], ["Proteína", m.proteina, "g", "--prot"], ["Carbo", m.carbo, "g", "--carb"], ["Gordura", m.gordura, "g", "--fat"]].filter((x) => x[1] != null);
  // sem alternativas não mostra "Opção X de N": seria um rótulo que não abre nada
  const rotulo = m.alternativas?.length ? `Opção ${m.numero || m.escolha + 1} de ${m.alternativas.length + 1}` : "";
  return `${sheetHead(`${esc(m.nome)} · ${m.hora}`)}
    <div class="sb">
      <div class="h1" style="font-size:26px">${esc(m.titulo || m.nome)}</div>
      <div class="chips" style="margin-top:12px">${m.familia ? `<span class="badge ac">${icon("house")}Comida da família</span>` : ""}${rotulo ? (m.alternativas?.length ? `<button class="badge ac" data-act="ver-opcoes">${esc(rotulo)}${icon("chevron-down", "sm")}</button>` : `<span class="badge">${esc(rotulo)}</span>`) : ""}
        ${(crianca ? [] : macros).map(([l, v, u, c]) => `<span class="badge"><i style="width:8px;height:8px;border-radius:50%;background:var(${c})"></i>${fmt(v)}${u === "kcal" ? " kcal" : u} ${l === "kcal" ? "" : l.toLowerCase()}</span>`).join("")}</div>
      ${m.nota ? `<div class="note info" style="margin-top:14px">${icon("info")}<div>${esc(m.nota)}</div></div>` : ""}
      ${crianca ? `<div class="section-title"><h2>Como foi?</h2></div>
        <div class="seg" style="margin:0">${ACEITE.map(([k, l]) => `<button class="${feito && (aceite(m.id) || "bem") === k ? "on" : ""}" data-act="aceite" data-id="${esc(m.id)}" data-v="${k}">${l}</button>`).join("")}</div>
        <div class="section-title"><h2>Ingredientes</h2><span class="faint" style="font-size:12.5px">peso cru</span></div>` : `<div class="section-title"><h2>Ingredientes</h2><span class="faint" style="font-size:12.5px">peso cru · toque no que não comeu</span></div>`}
      ${crianca ? "" : (() => {
        const p = parcial(S.data, S.pessoa, m.id);
        if (!p || (!p.fora?.length && !p.outra)) return "";
        const c = consumido(m, p.fora || [], p.outraKcal);
        return `<div class="note info" style="margin-bottom:10px">${icon("notebook-pen")}<div style="flex:1">${p.outra ? `Comeu outra coisa: <b>${esc(p.outra)}</b>` : `Comeu parte: sem ${esc(p.fora.join(", ").toLowerCase())}`} · <b>~${fmt(c.kcal)} kcal</b>${c.proteina != null ? `, ${fmt(c.proteina)}g prot` : ""}</div>
          <button class="btn sm" data-act="parte-limpar" data-id="${esc(m.id)}">Desfazer</button></div>`;
      })()}
      <div class="rows items">${m.itens.map((it, n) => {
        const ck = cozido(S.plano, it);
        const fora = (parcial(S.data, S.pessoa, m.id)?.fora || []).includes(it.nome);
        if (crianca) return `<div class="row"><span class="grow"><div class="ttl">${esc(it.nome)}</div>${it.obs ? `<div class="sub">${esc(it.obs)}</div>` : ""}</span><span class="end"><b>${esc(fmtQtd(it.qtd, it.unid))}</b>${ck ? `<small>${ck}</small>` : ""}</span></div>`;
        return `<button class="row ${fora ? "got" : ""}" data-act="item" data-id="${esc(m.id)}" data-n="${n}" aria-pressed="${!fora}" aria-label="${esc(it.nome)}: ${fora ? "não comeu" : "comeu"}">
          <span class="box" style="${fora ? "" : "background:var(--ac);box-shadow:none;color:#fff"}">${icon("check")}</span>
          <span class="grow"><div class="ttl" style="${fora ? "text-decoration:line-through;color:var(--text-3)" : ""}">${esc(it.nome)}</div>${it.obs ? `<div class="sub">${esc(it.obs)}</div>` : ""}</span>
          <span class="end"><b>${esc(fmtQtd(it.qtd, it.unid))}</b>${ck ? `<small>${ck}</small>` : ""}</span></button>`;
      }).join("")}</div>
      ${crianca ? "" : `<form class="card tight" data-form="outra" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
        <input type="hidden" name="id" value="${esc(m.id)}">
        <div class="ttl" style="font-weight:600;font-size:14px">Comeu outra coisa?</div>
        <div style="display:flex;gap:8px"><input class="input" name="texto" placeholder="Ex.: pizza, 2 fatias" autocomplete="off" style="height:44px">
          <input class="input num" name="kcal" inputmode="numeric" placeholder="kcal" style="height:44px;width:84px"></div>
        <button class="btn sm" type="submit">Registrar no lugar desta refeição</button></form>`}
      ${opcoesHtml(m)}
      ${porcoesFamilia(m)}
      <div class="gap-l"></div>
    </div>
    <div class="foot fab-row">
      <button class="btn" data-act="cozinha" data-id="${esc(m.id)}">${icon("chef-hat")}Modo cozinha</button>
      <button class="btn ${feito ? "" : "primary"}" data-act="comi-sheet" data-id="${esc(m.id)}">${icon("check")}${feito ? "Desmarcar" : "Comi"}</button>
    </div>`;
}

// computador largo: a ficha fica fixa ao lado da linha do tempo (tocar em outra refeição troca o conteúdo)
const largo = () => matchMedia("(min-width: 1100px)").matches;
export function abrirRefeicao(id) {
  const m = refeicaoAtual(id);
  if (!m) return;
  const aberta = topSheet();
  if (largo() && aberta?.classList.contains("lado")) { aberta.innerHTML = `<div class="grab"></div>${fichaRefeicao(m)}`; return aberta; }
  return openSheet(fichaRefeicao(m), { lado: largo() && S.tab === "hoje" });
}

export function abrirPreparo() {
  const d = S.plano.dias.find((x) => x.data === S.data);
  openSheet(`${sheetHead("Preparo de hoje", esc(dataLonga(S.data)))}
    <div class="sb"><div class="steps">${d.preparo.map((s, i) => passo(esc(s), s, `dia-${i}`, `data-act="passo" data-i="${i}"`)).join("")}</div><div class="gap-l"></div></div>
    <div class="foot"><button class="btn primary block" data-act="cozinha">${icon("chef-hat")}Abrir modo cozinha</button></div>`);
}

// ---------- modo cozinha: letra grande, tela sempre acesa ----------
let wake = null;
export async function abrirCozinha(id) {
  const d = S.plano.dias.find((x) => x.data === S.data);
  const m = id ? refeicaoAtual(id) : null;
  const el = document.createElement("div");
  el.className = "kitchen";
  el.style.setProperty("--ac", cor(S.pessoa));
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><div class="eyebrow">${m ? `${esc(m.nome)} · ${m.hora}` : "Preparo do dia"}</div><div class="h1" style="margin-top:4px">${esc(m ? m.titulo || m.nome : dataLonga(S.data).replace(/^./, (c) => c.toUpperCase()))}</div></div>
      <button class="icon-btn" style="color:#fff;background:rgba(255,255,255,.08)" data-k="fechar" aria-label="Fechar">${icon("x")}</button></div>
    ${m ? `<div class="gap-m"></div>${m.itens.map((it) => `<button class="kit" data-k="item"><span class="box">${icon("check")}</span>${esc(it.nome)}<b>${esc(fmtQtd(it.qtd, it.unid))}</b></button>`).join("")}` : ""}
    ${d.preparo.length && (!m || ["almoco", "jantar"].includes(m.tipo)) ? `<div class="gap-l"></div><div class="eyebrow" style="margin-bottom:14px">Modo de preparo</div>
      <div class="steps">${d.preparo.map((s, i) => passo(esc(s), s, `cz-${i}`, `data-k="passo"`)).join("")}</div>` : ""}`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    if (b.dataset.k === "fechar") { el.remove(); wake && wake.release().catch(() => {}); wake = null; }
    else if (b.dataset.k === "item") { b.classList.toggle("got"); buzz(); }
    else b.classList.toggle("done");
  });
  document.body.appendChild(el);
  try { wake = await navigator.wakeLock.request("screen"); } catch (e) {}
}

// ---------- comer só parte ----------
function repintarFicha(id) {
  const sheet = topSheet();
  const m = refeicaoAtual(id);
  if (!sheet || !m) return;
  const y = sheet.querySelector(".sb")?.scrollTop;
  sheet.innerHTML = `<div class="grab"></div>${fichaRefeicao(m)}`;
  sheet.querySelector(".sb").scrollTop = y;
}

/** Grava o que ficou de fora. Comer parte conta como refeição feita; tudo de fora (sem "outra coisa") desmarca. */
function salvarParte(m, p) {
  const vazio = !p.fora.length && !p.outra;
  if (vazio) log.del("partial", S.data, S.pessoa, m.id);
  else log.set("partial", S.data, S.pessoa, m.id, JSON.stringify(p));
  const nada = !p.outra && m.itens.every((it) => p.fora.includes(it.nome));
  if (nada) log.del("eaten", S.data, S.pessoa, m.id);
  else if (!vazio) log.set("eaten", S.data, S.pessoa, m.id, "1");
  buzz();
  repintarFicha(m.id);
  rerender();
}

export const forms = {
  outra: (f) => {
    const m = refeicaoAtual(f.id.value);
    const texto = f.texto.value.trim();
    if (!m || !texto) return toast("Escreva o que comeu");
    salvarParte(m, { fora: m.itens.map((it) => it.nome), outra: texto.slice(0, 120), outraKcal: Math.max(0, Math.min(3000, parseInt(f.kcal.value, 10) || 0)) });
    toast("Anotado no lugar da refeição");
  },
};

// ---------- marcar "comi" (com Desfazer por 5 s: toque sem querer no círculo acontece) ----------
function marcarComi(id) {
  const { data, pessoa } = S;
  const antes = ["eaten", "partial", "aceite"].map((k) => [k, log.get(k, data, pessoa, id)?.v]);
  const on = log.toggle("eaten", data, pessoa, id);
  if (!on) { log.del("partial", data, pessoa, id); log.del("aceite", data, pessoa, id); }
  else if (S.plano.pessoas.find((x) => x.id === pessoa)?.crianca) log.set("aceite", data, pessoa, id, "bem");
  buzz(on ? 12 : 6);
  rerender();
  toast(on ? "Boa! Marcado ✓" : "Desmarcado", 5000, {
    rotulo: "Desfazer",
    fn: () => { for (const [k, v] of antes) v == null ? log.del(k, data, pessoa, id) : log.set(k, data, pessoa, id, v); buzz(); rerender(); },
  });
}

// ---------- ações ----------
export const acts = {
  data: (b) => { S.data = b.dataset.d; rerender(); },
  comi: (b, e) => { e.stopPropagation(); marcarComi(b.dataset.id); },
  "comi-sheet": (b) => { closeSheet(); marcarComi(b.dataset.id); },
  refeicao: (b, e) => { if (!e.target.closest(".check")) abrirRefeicao(b.dataset.id); },
  preparo: () => abrirPreparo(),
  passo: (b) => b.classList.toggle("done"),
  cozinha: (b) => { abrirCozinha(b.dataset.id); },
  "ver-opcoes": () => document.getElementById("opcoes")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  trocar: (b) => {
    const i = +b.dataset.i;
    if (i) log.set("swap", S.data, S.pessoa, b.dataset.id, String(i)); else log.del("swap", S.data, S.pessoa, b.dataset.id);
    log.del("partial", S.data, S.pessoa, b.dataset.id); // os itens mudaram com a troca
    buzz();
    const sheet = topSheet();
    const m = refeicaoAtual(b.dataset.id);
    if (sheet && m) { const y = sheet.querySelector(".sb")?.scrollTop; sheet.innerHTML = `<div class="grab"></div>${fichaRefeicao(m)}`; sheet.querySelector(".sb").scrollTop = y; }
    rerender();
    toast(i ? "Opção trocada para hoje" : "Voltou para a opção do plano");
  },
  item: (b) => {
    const id = b.dataset.id;
    const m = refeicaoAtual(id);
    const nome = m.itens[+b.dataset.n].nome;
    const p = parcial(S.data, S.pessoa, id) || {};
    const fora = new Set(p.fora || []);
    if (fora.has(nome)) fora.delete(nome); else fora.add(nome);
    salvarParte(m, { fora: [...fora] });
  },
  "parte-limpar": (b) => { log.del("partial", S.data, S.pessoa, b.dataset.id); repintarFicha(b.dataset.id); rerender(); },
  aceite: (b) => {
    const { id, v } = b.dataset;
    if (comeu(S.data, S.pessoa, id) && (aceite(id) || "bem") === v) { log.del("eaten", S.data, S.pessoa, id); log.del("aceite", S.data, S.pessoa, id); }
    else { log.set("eaten", S.data, S.pessoa, id, "1"); log.set("aceite", S.data, S.pessoa, id, v); }
    buzz();
    repintarFicha(id);
    rerender();
  },
  agua: (b) => {
    const v = Math.max(0, Math.min(8000, Number(log.get("water", S.data, S.pessoa)?.v || 0) + Number(b.dataset.v)));
    if (v) log.set("water", S.data, S.pessoa, "", String(v)); else log.del("water", S.data, S.pessoa);
    buzz(8);
    rerender();
  },
  "ver-proximo": (b) => {
    S.viewing = b.dataset.id;
    if (b.dataset.tab) S.tab = b.dataset.tab;
    window.dispatchEvent(new CustomEvent("plano:trocar"));
    scrollTo(0, 0);
  },
  treino: (b) => { log.set("trained", S.data, S.pessoa, "", b.dataset.t); rerender(); },
};
