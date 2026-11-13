import { S, rerender, hoje } from "../state.js";
import { notasDe, ddmm, dataCurta, DIAS_SEMANA, diaSemana, semanas, veredito, VEREDITOS, historicoTestes, comidaXSintoma } from "../plan.js";
import { esc, icon, md, openSheet, closeSheet, sheetHead, toast, buzz } from "../ui.js";
import { log } from "../sync.js";
import { topo, pessoasSwitch } from "./hoje.js";

const NIVEIS = [["nenhum", "Nenhum", "var(--ok)"], ["leve", "Leve", "var(--carb)"], ["moderado", "Moderado", "var(--warn)"], ["forte", "Forte", "var(--bad)"]];
const corNivel = (v) => (NIVEIS.find((n) => n[0] === v) || NIVEIS[0])[2];

const TOM_TESTE = { passou: "var(--ok)", leve: "var(--warn)", nao: "var(--bad)", andamento: "var(--text-2)", sem: "var(--text-3)" };
const seloTeste = (v) => `<span class="badge" style="color:${TOM_TESTE[v]};background:color-mix(in srgb, ${TOM_TESTE[v]} 13%, transparent);flex:none">${VEREDITOS[v]}</span>`;

// ---------- feedback: alimenta o Claude no próximo plano (registro "feedback": k "dia" e k "semana") ----------
const ESCALAS = [["energia", "Energia", "baixa", "alta"], ["fome", "Fome", "pouca", "muita"], ["intestino", "Intestino", "ruim", "ótimo"]];
const lerJson = (r) => { try { return r ? JSON.parse(r.v) : {}; } catch (e) { return {}; } };
const fbDia = (pid) => lerJson(log.get("feedback", hoje(), pid, "dia"));
/** Início da semana do plano que contém hoje (ou hoje, fora do plano): a chave do fechamento semanal. */
const semanaAtual = () => (semanas(S.plano).find((w) => hoje() >= w.de && hoje() <= w.ate) || { de: hoje() }).de;

function feedbackHtml(p) {
  const f = fbDia(p.id);
  const sem = lerJson(log.get("feedback", semanaAtual(), p.id, "semana"));
  return `<section class="card">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Como foi hoje?</span>${f.energia || f.fome || f.intestino ? `<span class="badge ac">${icon("check", "sm")}salvo</span>` : ""}</div>
    <div class="stack" style="margin-top:12px;gap:14px">${ESCALAS.map(([k, nome, de, ate]) => `<div>
      <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px"><b style="font-weight:600">${nome}</b><span class="faint" style="font-size:12px">${de} → ${ate}</span></div>
      <div class="segs">${[1, 2, 3, 4, 5].map((n) => `<button class="${f[k] === n ? "on" : ""}" data-act="fb" data-k="${k}" data-v="${n}" aria-label="${nome} ${n} de 5">${n}</button>`).join("")}</div></div>`).join("")}</div>
    <form data-form="fb-nota" style="display:flex;gap:8px;margin-top:14px">
      <input class="input" name="nota" value="${esc(f.nota || "")}" placeholder="Algo a contar? (opcional)" autocomplete="off" style="height:44px">
      <button class="btn sm" type="submit">Salvar</button></form>
    <button class="row" data-act="fb-semana" style="padding:14px 0 0;min-height:0;margin-top:14px;border-top:1px solid var(--line)">
      <span class="ico ac">${icon("notebook-pen", "sm")}</span><span class="grow"><div class="ttl">Fechamento da semana</div>
      <div class="sub">${sem.funcionou || sem.naoFuncionou || sem.mudar ? "preenchido · toque para editar" : "o que funcionou, o que não funcionou, o que mudar"}</div></span>${icon("chevron-right")}</button>
  </section>`;
}

function historicoPeso(pid) {
  const p = S.plano.pessoas.find((x) => x.id === pid);
  const m = new Map();
  for (const r of log.all("weight", (r) => r.person === pid)) if (Number.isFinite(+r.v)) m.set(r.day, +r.v);
  // o peso oficial é o do Pulse (espelhado aqui no registro): o histórico que vem no plano só vale para quem não tem nenhum
  if (!m.size) {
    for (const [d, v] of p?.peso?.historico || []) m.set(d, v);
    if (p?.peso?.atual && p.peso.data) m.set(p.peso.data, p.peso.atual);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function grafico(pts) {
  if (pts.length < 2) return "";
  const W = 320, H = 120, px = 8, py = 14;
  const vs = pts.map((p) => p[1]);
  const mn = Math.min(...vs) - 0.3, mx = Math.max(...vs) + 0.3;
  const t0 = Date.parse(pts[0][0]), t1 = Date.parse(pts[pts.length - 1][0]) || t0 + 1;
  const xy = pts.map(([d, v]) => [px + ((Date.parse(d) - t0) / (t1 - t0 || 1)) * (W - 2 * px), py + (1 - (v - mn) / (mx - mn)) * (H - 2 * py - 14)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H - 14} L${xy[0][0].toFixed(1)},${H - 14} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="gr" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--ac)" stop-opacity=".22"/><stop offset="1" stop-color="var(--ac)" stop-opacity="0"/></linearGradient></defs>
    <path class="ar" d="${area}"/><path class="ln" d="${line}" vector-effect="non-scaling-stroke"/>
    ${xy.map(([x, y], i) => `<circle class="pt ${i === xy.length - 1 ? "last" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === xy.length - 1 ? 4.5 : 3}" vector-effect="non-scaling-stroke"/>`).join("")}
    <text x="${px}" y="${H - 1}">${ddmm(pts[0][0])}</text><text x="${W - px}" y="${H - 1}" text-anchor="end">${ddmm(pts[pts.length - 1][0])}</text></svg>`;
}

export function render() {
  const p = S.plano.pessoas.find((x) => x.id === S.pessoa);
  const hist = historicoPeso(p.id);
  const ult = hist[hist.length - 1], ant = hist[hist.length - 2];
  const delta = ult && ant ? +(ult[1] - ant[1]).toFixed(1) : null;
  const pesoCard = `<section class="card">
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Peso</span>${p.peso?.meta ? `<span class="badge">meta ${esc(p.peso.meta)}</span>` : ""}</div>
    ${ult ? `<div class="weight" style="margin-top:10px"><div><div class="v">${ult[1].toLocaleString("pt-BR")}<small>kg</small></div>
        <div class="delta flat">${delta == null ? "primeiro registro" : `${delta > 0 ? "↑ +" : delta < 0 ? "↓ " : ""}${delta.toLocaleString("pt-BR")} kg desde ${ddmm(ant[0])}`}</div></div>
        <span class="faint" style="font-size:12.5px">${dataCurta(ult[0])}</span></div>${grafico(hist.slice(-12))}`
      : `<p class="muted" style="margin-top:8px">Nenhum peso registrado ainda.</p>`}
    <button class="btn block" style="margin-top:16px" data-act="peso">${icon("scale")}Registrar peso</button>
  </section>`;

  // testes de reintrodução
  const testes = S.plano.testes.filter((t) => !t.pessoa || t.pessoa === p.id);
  const h = hoje();
  const testesHtml = testes.length ? `<div class="section-title"><h2>Testes de reintrodução</h2></div>
    ${testes.map((t) => `<section class="card">
      <div style="display:flex;align-items:center;gap:10px"><span class="ico" style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;background:var(--ac-soft-2);color:var(--ac-ink)">${icon("flask-conical")}</span>
        <div class="grow" style="min-width:0"><div class="h3">${esc(t.alimento || t.grupo)}</div>${t.grupo && t.alimento ? `<div class="muted" style="font-size:13px">${esc(t.grupo)}</div>` : ""}</div>
        ${seloTeste(veredito(t.doses.map((d) => log.get("test", d.data, p.id, `${t.alimento || t.grupo}-${d.n}`)?.v), t.doses.length))}</div>
      ${t.texto ? `<div class="md" style="margin-top:12px">${md(t.texto)}</div>` : ""}
      <div class="stack" style="margin-top:14px;gap:14px">${t.doses.map((d) => {
        const r = log.get("test", d.data, p.id, `${t.alimento || t.grupo}-${d.n}`);
        const v = r ? r.v : "";
        return `<div class="dose ${d.data === h ? "today" : ""}"><div class="n"><b>${+d.data.slice(8, 10)}</b><span>${DIAS_SEMANA[diaSemana(d.data)]}</span></div>
          <div><div style="font-weight:600">Dose ${d.n} · ${esc(d.quantidade || "")}${d.refeicao ? ` <span class="faint" style="font-weight:500">· ${esc(d.refeicao)}</span>` : ""}</div>
          ${d.data <= h ? `<div class="seg">${[["ok", "Sem sintoma"], ["leve", "Leve"], ["forte", "Forte"]].map(([k, l]) => `<button class="${v === k ? "on" : ""}" data-v="${k}" data-act="teste" data-d="${d.data}" data-k="${esc(`${t.alimento || t.grupo}-${d.n}`)}">${l}</button>`).join("")}</div>`
            : `<div class="faint" style="font-size:13px;margin-top:2px">${esc(d.texto || "")}</div>`}</div></div>`;
      }).join("")}</div>
      ${t.criterio ? `<div class="note" style="margin-top:16px">${icon("info")}<div class="md">${md(t.criterio)}</div></div>` : ""}
    </section>`).join("")}` : "";

  // testes de outros meses (o registro guarda tudo; o plano só traz os deste mês)
  const doPlano = new Set(testes.map((t) => t.alimento || t.grupo));
  const antigos = historicoTestes(log.all("test", (r) => r.person === p.id)).filter((t) => !doPlano.has(t.alimento));
  const antigosHtml = antigos.length ? `<div class="section-title"><h2>Testes anteriores</h2></div>
    <div class="rows">${antigos.map((t) => `<div class="row"><span class="grow"><div class="ttl">${esc(t.alimento)}</div><div class="sub">${t.doses.length} dose${t.doses.length > 1 ? "s" : ""} · até ${dataCurta(t.ultima)}</div></span>${seloTeste(t.veredito)}</div>`).join("")}</div>` : "";

  // comida × sintoma: o que mais aparece nos dias com sintoma
  const sintomas = log.all("symptom", (r) => r.person === p.id).map((r) => { try { return { day: r.day, ...JSON.parse(r.v) }; } catch (e) { return null; } }).filter(Boolean);
  const padroes = comidaXSintoma(S.plano, p.id, (k, d, id) => log.get(k, d, p.id, id)?.v ?? null, sintomas, h);
  const padroesHtml = padroes.length ? `<div class="section-title"><h2>Comida × sintoma</h2></div>
    <section class="card tight"><div class="stack" style="gap:12px">${padroes.map((x) => `<div><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px"><b style="font-weight:600">${esc(x.alimento)}</b>
        <span class="num" style="color:var(--text-2)">${x.comSintoma} de ${x.dias} dias</span></div>
        <div class="bar-line" style="margin-top:6px"><i style="--c:var(--warn);width:${(x.comSintoma / x.dias) * 100}%"></i></div>
        <div class="faint" style="font-size:12px;margin-top:4px">sem ele: ${x.semEleComSintoma} de ${x.semEle} dias com sintoma</div></div>`).join("")}</div>
      <p class="faint" style="font-size:12.5px;margin-top:12px">É só um padrão do diário com o que foi marcado como comido, não uma prova. O Claude vê isso ao montar o próximo plano.</p></section>` : "";

  // diário
  const registros = log.all("symptom", (r) => r.person === p.id).map((r) => { try { return { ...JSON.parse(r.v), day: r.day, k: r.k }; } catch (e) { return null; } })
    .filter(Boolean).sort((a, b) => (b.day + (b.hora || "")).localeCompare(a.day + (a.hora || ""))).slice(0, 12);
  const diario = `<div class="section-title"><h2>Diário</h2><button class="link" data-act="sintoma">+ Registrar</button></div>
    ${registros.length ? `<div class="rows">${registros.map((r) => `<div class="row"><span class="lvl" style="background:${corNivel(r.nivel)}"></span>
        <span class="grow"><div class="ttl">${esc(r.texto)}</div><div class="sub">${dataCurta(r.day)}${r.hora ? ` · ${esc(r.hora)}` : ""} · ${esc((NIVEIS.find((n) => n[0] === r.nivel) || NIVEIS[0])[1])}</div></span>
        <button class="icon-btn" data-act="sintoma-del" data-d="${r.day}" data-k="${esc(r.k)}" aria-label="Apagar">${icon("trash-2", "sm")}</button></div>`).join("")}</div>`
      : `<button class="card tap row" style="padding:16px" data-act="sintoma"><span class="ico ac">${icon("notebook-pen")}</span><span class="grow"><div class="ttl">Anote o que comeu fora do plano ou sentiu</div><div class="sub">Ajuda a ver padrões e a ajustar o próximo plano.</div></span></button>`}`;

  const extras = [...p.suplementos.map((s) => ["pill", s]), ...p.restricoes.map((s) => ["triangle-alert", s])];
  const extrasHtml = extras.length ? `<div class="section-title"><h2>Suplementos e cuidados</h2></div>
    <div class="rows">${extras.map(([ic, s]) => `<div class="row"><span class="ico">${icon(ic, "sm")}</span><span class="grow">${esc(s)}</span></div>`).join("")}</div>` : "";

  const notas = notasDe(S.plano, "saude", p.id);
  const notasHtml = notas.length ? `<div class="section-title"><h2>Para saber</h2></div>
    ${notas.map((n) => `<details class="fold"><summary><span class="tone ${n.tom}"></span><span>${esc(n.titulo)}</span>${icon("chevron-down", "chev")}</summary><div class="md">${md(n.texto)}</div></details>`).join("")}` : "";

  return `<div class="page">
    ${topo("Saúde", esc(p.resumo || p.nome), `<div class="gap-s"></div>${pessoasSwitch()}`)}
    <div class="gap-s"></div>
    ${feedbackHtml(p)}
    <div class="gap-s"></div>
    ${pesoCard}
    ${testesHtml}
    ${antigosHtml}
    ${diario}
    ${padroesHtml}
    ${extrasHtml}
    ${notasHtml}
  </div>`;
}

export const acts = {
  fb: (b) => {
    const f = fbDia(S.pessoa);
    f[b.dataset.k] = f[b.dataset.k] === +b.dataset.v ? undefined : +b.dataset.v;
    log.set("feedback", hoje(), S.pessoa, "dia", JSON.stringify(f));
    buzz();
    rerender();
  },
  "fb-semana": () => {
    const s = lerJson(log.get("feedback", semanaAtual(), S.pessoa, "semana"));
    const campo = (n, t, ph) => `<label class="field" style="margin-bottom:14px"><span>${t}</span><textarea class="input" name="${n}" rows="3" placeholder="${ph}" style="font-family:var(--font);font-size:15px;min-height:90px">${esc(s[n] || "")}</textarea></label>`;
    openSheet(`${sheetHead("Fechamento da semana", `${esc(S.plano.pessoas.find((x) => x.id === S.pessoa).nome)} · desde ${dataCurta(semanaAtual())}`)}
      <form class="sb" data-form="fb-semana">
        ${campo("funcionou", "O que funcionou?", "Ex.: o shake de manhã segurou a fome até o almoço")}
        ${campo("naoFuncionou", "O que não funcionou?", "Ex.: jantar tarde demais na terça")}
        ${campo("mudar", "O que mudar ou enjoou?", "Ex.: enjoei do iogurte com kiwi")}
        <button class="btn primary block" type="submit">Salvar</button><div class="gap-m"></div></form>`);
  },
  peso: () => {
    const hist = historicoPeso(S.pessoa);
    const ult = hist[hist.length - 1];
    openSheet(`${sheetHead("Registrar peso", esc(S.plano.pessoas.find((x) => x.id === S.pessoa).nome))}
      <form class="sb" data-form="peso">
        <input class="input big num" name="kg" inputmode="decimal" placeholder="${ult ? ult[1].toLocaleString("pt-BR") : "00,0"}" autofocus>
        <div class="faint center" style="margin:8px 0 18px;font-size:13px">kg · de manhã, em jejum, depois do banheiro</div>
        <label class="field"><span>Data</span><input class="input" type="date" name="data" value="${hoje()}"></label>
        <div class="gap-m"></div><button class="btn primary block" type="submit">Salvar</button></form>`);
  },
  sintoma: () => {
    openSheet(`${sheetHead("Registrar no diário")}
      <form class="sb" data-form="sintoma">
        <label class="field"><span>O que comeu ou aconteceu?</span><input class="input" name="texto" placeholder="Ex.: pizza no aniversário, gases à noite" autocomplete="off" required></label>
        <div class="gap-m"></div><div class="field"><span>Sintoma</span>
          <div class="seg" style="margin:0">${NIVEIS.map(([k, l], i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-v="${k}" data-act="nivel">${l}</button>`).join("")}</div></div>
        <input type="hidden" name="nivel" value="nenhum">
        <div class="gap-m"></div><label class="field"><span>Quando</span><div style="display:flex;gap:10px"><input class="input" type="date" name="data" value="${hoje()}"><input class="input" type="time" name="hora" value="${new Date().toTimeString().slice(0, 5)}"></div></label>
        <div class="gap-l"></div><button class="btn primary block" type="submit">Salvar</button></form>`);
  },
  nivel: (b) => {
    b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    b.closest("form").nivel.value = b.dataset.v;
  },
  "sintoma-del": (b) => { if (confirm("Apagar este registro?")) { log.del("symptom", b.dataset.d, S.pessoa, b.dataset.k); rerender(); } },
  teste: (b) => {
    const cur = log.get("test", b.dataset.d, S.pessoa, b.dataset.k);
    if (cur && cur.v === b.dataset.v) log.del("test", b.dataset.d, S.pessoa, b.dataset.k);
    else log.set("test", b.dataset.d, S.pessoa, b.dataset.k, b.dataset.v);
    buzz();
    rerender();
  },
};

export const forms = {
  "fb-nota": (f) => {
    log.set("feedback", hoje(), S.pessoa, "dia", JSON.stringify({ ...fbDia(S.pessoa), nota: f.nota.value.trim() }));
    rerender();
    toast("Anotado");
  },
  "fb-semana": (f) => {
    const v = { funcionou: f.funcionou.value.trim(), naoFuncionou: f.naoFuncionou.value.trim(), mudar: f.mudar.value.trim() };
    log.set("feedback", semanaAtual(), S.pessoa, "semana", JSON.stringify(v));
    closeSheet();
    rerender();
    toast("Fechamento salvo — o Claude vai ler no próximo plano");
  },
  peso: (f) => {
    const kg = parseFloat(String(f.kg.value).replace(",", "."));
    if (!(kg > 5 && kg < 400)) return toast("Digite um peso válido");
    log.set("weight", f.data.value || hoje(), S.pessoa, "", kg.toFixed(1));
    closeSheet();
    rerender();
    toast("Peso salvo");
  },
  sintoma: (f) => {
    const texto = f.texto.value.trim();
    if (!texto) return;
    log.set("symptom", f.data.value || hoje(), S.pessoa, Date.now().toString(36), JSON.stringify({ texto, nivel: f.nivel.value, hora: f.hora.value }));
    closeSheet();
    rerender();
    toast("Anotado");
  },
};
