// Diário (spec §7.4–7.6): fechar o dia e a semana, os dias recentes, sintomas por semana (com o tratamento ao fundo),
// as análises do Claude e o "Pedir análise" (link do claude.ai com o pedido escrito; sem conector, copiar e colar).
import { S, rerender, hoje, resumoDia, pesoRecente, agoraMin } from "../../js/state.js";
import { log, api } from "../../js/sync.js";
import { md } from "../../js/ui.js";
import { lerDia, notaSintomasDia, mediasPorSemana, piorouTresSemanas, segundaDe, semanaParaFechar, pedidoDeAnalise, linkClaude, HUMORES, FOMES } from "../../js/diario.js";
import { SINTOMAS, lerSintoma, diaDoTratamento } from "../../js/tratamento.js";
import { metaAgua, somaDias, diaSemana, DIAS_SEMANA } from "../../js/plan.js";
import { esc, icon, fmt, litros, topo, abrirFolha, fecharFolha, toast } from "../ui.js";
import { tratamentoDe, tratamentoAtivo } from "./mais.js";
import { secoesSaude } from "./saude.js";

const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pessoa = () => S.plano.pessoas.find((x) => x.id === S.pessoa);
const BRISTOL = ["bolinhas duras", "salsicha encaroçada", "salsicha com rachaduras", "lisa e macia", "pedaços macios", "pastosa", "líquida"];

// ---------- análises do Claude (servidor, cache na memória) ----------
const anls = new Map(), buscadoEm = new Map();
export function analisesDe(pid) {
  if (Date.now() - (buscadoEm.get(pid) || 0) > 120e3) {
    buscadoEm.set(pid, Date.now());
    api(`/api/analises/${encodeURIComponent(pid)}`).then((l) => {
      const nova = Array.isArray(l) ? l : [];
      if (JSON.stringify(nova) === JSON.stringify(anls.get(pid))) return; // nada mudou: não redesenha
      anls.set(pid, nova);
      rerender();
    }).catch(() => {});
  }
  return anls.get(pid) || [];
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { buscadoEm.clear(); rerender(); } });

function abrirAnalise(pid, id) {
  const a = (anls.get(pid) || []).find((x) => x.id === id);
  if (!a) return;
  abrirFolha(`<small class="muted">Análise do Claude · ${ddmm(a.data)}</small><h2 class="h2">${esc(a.titulo)}</h2><div class="md analise">${md(a.texto)}</div>
    <div class="foot"><button class="btn cta" data-act="mais-fechar">Fechar</button></div>`, { aoFechar: rerender });
  if (!a.lida) { a.lida = true; api(`/api/analises/${encodeURIComponent(pid)}/${encodeURIComponent(id)}/lida`, { method: "PUT" }).catch(() => {}); }
}

// ---------- dados dos dias ----------
function dia(d, pid) {
  const r = S.plano.dias.some((x) => x.data === d) ? resumoDia(d, pid) : null;
  const feitas = r ? r.refeicoes.filter((m) => log.get("eaten", d, pid, m.id)).length : null;
  return {
    data: d, fechamento: log.get("day", d, pid) ? lerDia(log.get("day", d, pid).v) : null,
    feitas, total: r ? r.refeicoes.length : null, kcal: r?.feito.kcal ?? null, prot: r?.feito.proteina ?? null, metaKcal: r?.meta.kcal ?? null,
    agua: Number(log.get("water", d, pid)?.v || 0),
    sintomas: log.all("symptom", (x) => x.day === d && x.person === pid).map((x) => lerSintoma(x.v)),
  };
}
const ultimosDias = (n, pid) => Array.from({ length: n }, (_, i) => dia(somaDias(hoje(), -i), pid));

export const semanaAFechar = (pid = S.pessoa) => semanaParaFechar(hoje(), agoraMin(), (ate) => !!log.get("week", ate, pid));

/** Resumo da semana a fechar (até hoje, sem dias futuros) para o fechamento e o relatório. */
function resumoSemana(pid) {
  const { de: seg, ate: dom } = semanaAFechar(pid);
  const ds = ultimosDias(14, pid).filter((d) => d.data >= seg && d.data <= dom);
  const comPlano = ds.filter((d) => d.total);
  const soma = (k) => comPlano.reduce((a, d) => a + (d[k] || 0), 0);
  const media = (k) => (comPlano.length ? Math.round(soma(k) / comPlano.length) : null);
  const fechados = ds.filter((d) => d.fechamento);
  return {
    de: seg, ate: dom, dias: ds.length,
    adesao: soma("total") ? Math.round((soma("feitas") / soma("total")) * 100) : null,
    kcal: media("kcal"), prot: media("prot"), metaKcal: comPlano[0]?.metaKcal ?? null,
    agua: ds.length ? Math.round(ds.reduce((a, d) => a + d.agua, 0) / ds.length) : 0,
    peso: pesoRecente(pid), sintomas: fechados.length ? Math.round((fechados.reduce((a, d) => a + notaSintomasDia(d.fechamento), 0) / fechados.length) * 10) / 10 : null,
    anotados: ds.reduce((a, d) => a + d.sintomas.length, 0),
  };
}
function textoResumo(s) {
  return [s.adesao != null ? `adesão ${s.adesao}%` : null, s.kcal != null ? `${fmt(s.kcal)} kcal/dia${s.metaKcal ? ` (meta ${fmt(s.metaKcal)})` : ""}` : null,
    s.prot != null ? `${fmt(s.prot)} g de proteína/dia` : null, `água ${litros(s.agua)} L/dia`, s.peso ? `peso ${String(s.peso).replace(".", ",")} kg` : null,
    s.sintomas != null ? `sintomas ${String(s.sintomas).replace(".", ",")} de 15 (média dos dias fechados)` : `${s.anotados} sintoma(s) anotado(s)`].filter(Boolean).join(" · ");
}
function relatorio(pid) {
  const p = pessoa(), s = resumoSemana(pid);
  const linhas = ultimosDias(7, pid).reverse().map((d) => {
    const f = d.fechamento;
    return `${ddmm(d.data)}: ${d.total ? `${d.feitas}/${d.total} refeições` : "sem plano"}, água ${litros(d.agua)} L` +
      (d.sintomas.length ? `, sintomas: ${d.sintomas.map((x) => x.rotulo).join("; ")}` : "") +
      (f ? `, fechamento: ${[f.humor && `humor ${f.humor}`, f.energia && `energia ${f.energia}/5`, f.bristol && `Bristol ${f.bristol}`, notaSintomasDia(f) && `sintomas ${notaSintomasDia(f)}/15`, f.texto].filter(Boolean).join(", ")}` : "");
  });
  return `Mesa · semana de ${p.nome} (${ddmm(s.de)} a ${ddmm(s.ate)})\n${textoResumo(s)}\n\n${linhas.join("\n")}\n\n` +
    "Analise a semana: o que funcionou, o que não funcionou e o que mudar na próxima. Linguagem simples.";
}

// ---------- tela ----------
function grafico(pid) {
  const ms = mediasPorSemana(ultimosDias(56, pid)).slice(-8);
  if (!ms.length) return `<p class="muted">Feche os dias (botão acima) para ver os sintomas por semana.</p>`;
  const t = tratamentoDe(pid);
  const max = Math.max(3, ...ms.map((s) => s.media));
  return `<div class="sint-grafico" role="img" aria-label="Sintomas por semana: ${ms.map((s) => `${ddmm(s.semana)} ${s.media}`).join(", ")}">${ms.map((s) => {
    const tr = t && !diaDoTratamento(t, somaDias(s.semana, 6)).antes && !diaDoTratamento(t, s.semana).acabou;
    return `<div class="col ${tr ? "trat" : ""}"><i style="--h:${Math.max(0.04, s.media / max)}"></i><small>${ddmm(s.semana)}</small></div>`;
  }).join("")}</div>${t ? `<p class="muted legenda"><i class="faixa"></i> semanas do tratamento</p>` : ""}`;
}

export function render() {
  const p = pessoa(), pid = p.id;
  const kid = !!p.crianca;
  const piora = !kid && piorouTresSemanas(mediasPorSemana(ultimosDias(56, pid)), hoje());
  const as = analisesDe(pid);
  const s = resumoSemana(pid);
  return `<div class="page diario">${topo("Diário", p.nome)}
    ${piora ? `<div class="glass card aviso-dia alerta medico"><b>Os sintomas pioraram 3 semanas seguidas.</b> Isso pede avaliação: procure um médico.</div><div class="gap"></div>` : ""}
    <div class="go"><button class="btn cta" data-act="fechar-dia">${icon("notebook-pen", "sm")}Fechar o dia</button>${kid ? "" : `<button class="btn" data-act="fechar-semana">Fechar a semana</button>`}</div>
    <div class="sec" style="margin-top:1.25rem"><span>Claude</span></div>
    <div class="glass card"><p class="muted" style="margin:0 0 .625rem">${esc(textoResumo(s))}</p>
      <div class="go"><a class="btn cta" href="${esc(linkClaude(pedidoDeAnalise({ nome: p.nome, de: s.de, ate: s.ate })))}" target="_blank" rel="noopener">${icon("sparkles", "sm")}Pedir análise</a>
        <button class="btn" data-act="copiar-relatorio">Copiar relatório</button><button class="btn txt" data-act="colar-analise">Colar resposta</button></div></div>
    ${as.length ? `<div class="sec" style="margin-top:1.25rem"><span>Análises</span></div><div class="regras">${as.slice(0, 6).map((a) => `<button class="glass card analise-item" data-act="ler-analise" data-id="${esc(a.id)}">
      <div class="lado-a-lado"><b>${esc(a.titulo)}</b><small class="muted">${ddmm(a.data)}${a.lida ? "" : " · nova"}</small></div><div class="md">${md(a.texto.length > 220 ? a.texto.slice(0, 220) + "…" : a.texto)}</div></button>`).join("")}</div>` : ""}
    ${kid ? "" : `<div class="sec" style="margin-top:1.25rem"><span>Sintomas por semana</span><span>0 = nada</span></div>${grafico(pid)}`}
    ${secoesSaude(p)}
    <div class="sec" style="margin-top:1.25rem"><span>Dias</span></div>
    <div class="rows">${ultimosDias(14, pid).map((d) => {
      const f = d.fechamento;
      const partes = [d.total ? `${d.feitas}/${d.total} refeições` : null, d.agua ? `${litros(d.agua)} L` : null, d.sintomas.length ? d.sintomas.map((x) => x.rotulo).join("; ") : null].filter(Boolean);
      const podeFechar = !f && d.data < hoje() && d.data >= somaDias(hoje(), -2);
      return `<div class="row diario-dia"><button class="corpo-dia" data-act="ir-dia" data-d="${d.data}"><div>${cap(DIAS_SEMANA[diaSemana(d.data)].slice(0, 3).toLowerCase())} ${ddmm(d.data)} ${f?.humor ? HUMORES[f.humor] : ""}</div>
        <div class="sub">${esc(partes.join(" · ") || "nada anotado")}${f?.texto ? ` — “${esc(f.texto)}”` : ""}</div></button>${f ? `<small class="muted">fechado</small>` : podeFechar ? `<button class="btn txt" data-act="fechar-dia" data-d="${d.data}">Fechar</button>` : ""}</div>`;
    }).join("")}</div></div>`;
}
const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());

// ---------- folhas: fechar o dia e a semana, colar resposta ----------
let FD = null;
function pintar(html) { const d = document.querySelector("dialog.folha[open]"); if (!d) return; const t = d.querySelector("#toast"); d.innerHTML = html; if (t) d.append(t); }
function folhaDia() {
  const kid = !!pessoa().crianca;
  const comSintomas = !kid && (!!tratamentoAtivo(FD.pessoa, FD.data) || log.all("symptom", (x) => x.person === FD.pessoa && x.day >= somaDias(FD.data, -14) && x.day <= FD.data).length > 0);
  const chips = (act, opcoes, atual, extra = "") => `<div class="chips">${opcoes.map(([v, l]) => `<button class="chip ${String(atual) === String(v) ? "on" : ""}" data-act="${act}" data-v="${v}" ${extra} aria-pressed="${String(atual) === String(v)}">${l}</button>`).join("")}</div>`;
  return `<small class="muted">${ddmm(FD.data)} · ${esc(pessoa().nome)}</small><h2 class="h2">Como foi o dia?</h2>
    <div class="sec"><span>Humor</span></div>${chips("dia-humor", Object.entries(HUMORES).map(([k, e]) => [k, `${e} ${k === "bem" ? "bem" : k === "mal" ? "mal" : "mais ou menos"}`]), FD.humor)}
    <div class="sec"><span>Fome</span></div>${chips("dia-fome", Object.entries(FOMES), FD.fome)}
    ${kid ? "" : `<div class="sec"><span>Energia</span><span>1 = sem energia · 5 = ótima</span></div>${chips("dia-energia", [1, 2, 3, 4, 5].map((n) => [n, n]), FD.energia)}`}
    ${!comSintomas ? "" : `<div class="sec"><span>Bristol (como foi o intestino)</span></div>${chips("dia-bristol", BRISTOL.map((l, i) => [i + 1, `${i + 1} · ${l}`]), FD.bristol)}
    <div class="sec"><span>Sintomas hoje</span><span>0 nada · 3 forte</span></div>
    <div class="sint-notas">${Object.entries(SINTOMAS).filter(([k]) => k !== "outro").map(([k, l]) => `<div class="lado-a-lado"><span>${l}</span><span class="chips">${[0, 1, 2, 3].map((n) =>
      `<button class="chip ${(FD.sintomas[k] ?? 0) === n ? "on" : ""}" data-act="dia-sint" data-s="${k}" data-v="${n}" aria-pressed="${(FD.sintomas[k] ?? 0) === n}" aria-label="${l}: ${n}">${n}</button>`).join("")}</span></div>`).join("")}</div>`}
    <div class="sec"><span>Uma frase (opcional)</span></div><input class="input" name="dia-texto" maxlength="280" value="${esc(FD.texto)}" placeholder="O que marcou o dia?" aria-label="Uma frase sobre o dia">
    <div class="foot"><button class="btn" data-act="mais-fechar">Cancelar</button><button class="btn cta" data-act="dia-salvar">Salvar</button></div>`;
}
addEventListener("input", (e) => { if (FD && e.target.name === "dia-texto") FD.texto = e.target.value; });

export function abrirFecharDia(data = hoje()) {
  const f = log.get("day", data, S.pessoa) ? lerDia(log.get("day", data, S.pessoa).v) : null;
  FD = { data, pessoa: S.pessoa, humor: f?.humor || null, fome: f?.fome || null, energia: f?.energia || null, bristol: f?.bristol || null, sintomas: { ...(f?.sintomas || {}) }, texto: f?.texto || "" };
  abrirFolha(folhaDia(), { aoFechar: () => { FD = null; rerender(); } });
}
export function abrirFecharSemana() {
  const pid = S.pessoa, s = resumoSemana(pid);
  abrirFolha(`<small class="muted">${ddmm(s.de)} a ${ddmm(s.ate)} · ${esc(pessoa().nome)}</small><h2 class="h2">Como foi a semana?</h2>
    <p class="muted">${esc(textoResumo(s))}</p>
    <textarea class="input" name="semana" rows="3" maxlength="280" placeholder="O que funcionou, o que não funcionou, o que mudar?" aria-label="Como foi a semana"></textarea>
    <div class="foot"><button class="btn" data-act="mais-fechar">Cancelar</button><button class="btn cta" data-act="semana-salvar">Salvar</button></div>`, { aoFechar: rerender });
}

export const acts = {
  "fechar-dia": (b) => abrirFecharDia(b.dataset.d || hoje()),
  "fechar-semana": () => abrirFecharSemana(),
  "dia-humor": (b) => { FD.humor = b.dataset.v; pintar(folhaDia()); },
  "dia-fome": (b) => { FD.fome = b.dataset.v; pintar(folhaDia()); },
  "dia-energia": (b) => { FD.energia = +b.dataset.v; pintar(folhaDia()); },
  "dia-bristol": (b) => { FD.bristol = +b.dataset.v; pintar(folhaDia()); },
  "dia-sint": (b) => { FD.sintomas[b.dataset.s] = +b.dataset.v; pintar(folhaDia()); },
  "dia-salvar": () => {
    if (!FD) return;
    const { data, pessoa: pid } = FD;
    const antes = log.get("day", data, pid)?.v;
    const sintomas = Object.fromEntries(Object.entries(FD.sintomas).filter(([, n]) => n > 0));
    log.set("day", data, pid, "", JSON.stringify(lerDia({ ...FD, sintomas })));
    fecharFolha();
    toast("Dia fechado", () => (antes == null ? log.del("day", data, pid) : log.set("day", data, pid, "", antes)));
  },
  "semana-salvar": () => {
    const t = document.querySelector("dialog.folha [name=semana]")?.value.trim() || "";
    const pid = S.pessoa, s = resumoSemana(pid);
    log.set("week", s.ate, pid, "", JSON.stringify({ texto: t.slice(0, 280), resumo: textoResumo(s) })); // no domingo que termina a semana
    pintar(`<h2 class="h2">Semana fechada ✓</h2><p class="muted">Quer a análise do Claude? Ele lê a semana pelo conector e grava a resposta aqui no Diário.</p>
      <div class="go" style="margin-top:.75rem"><a class="btn cta" href="${esc(linkClaude(pedidoDeAnalise({ nome: pessoa().nome, de: s.de, ate: s.ate })))}" target="_blank" rel="noopener">${icon("sparkles", "sm")}Pedir análise</a>
      <button class="btn" data-act="copiar-relatorio">Copiar relatório</button></div>
      <div class="foot"><button class="btn" data-act="mais-fechar">Agora não</button></div>`);
  },
  "copiar-relatorio": async () => {
    try { await navigator.clipboard.writeText(relatorio(S.pessoa)); toast("Relatório copiado — cole no Claude"); }
    catch (e) { abrirFolha(`<h2 class="h2">Copie o relatório</h2><p class="muted">Selecione tudo e copie; depois cole no Claude.</p><textarea class="input" rows="12" readonly aria-label="Relatório">${esc(relatorio(S.pessoa))}</textarea><div class="foot"><button class="btn cta" data-act="mais-fechar">Fechar</button></div>`); document.querySelector("dialog.folha textarea")?.select(); }
  },
  "colar-analise": () => abrirFolha(`<h2 class="h2">Colar a resposta do Claude</h2><p class="muted">Sem o conector: cole aqui o que o Claude respondeu e ela fica no Diário.</p>
    <textarea class="input" name="resposta" rows="8" maxlength="8000" aria-label="Resposta do Claude"></textarea>
    <div class="foot"><button class="btn" data-act="mais-fechar">Cancelar</button><button class="btn cta" data-act="colar-salvar">Guardar</button></div>`, { aoFechar: rerender }),
  "colar-salvar": async () => {
    const texto = document.querySelector("dialog.folha [name=resposta]")?.value.trim();
    if (!texto) return toast("Cole a resposta primeiro");
    try {
      const a = await api(`/api/analises/${encodeURIComponent(S.pessoa)}`, { method: "POST", body: JSON.stringify({ titulo: `Análise de ${ddmm(hoje())}`, texto }) });
      anls.set(S.pessoa, [a, ...(anls.get(S.pessoa) || [])]);
      fecharFolha();
      toast("Guardado no Diário");
    } catch (e) { toast("Não consegui guardar (sem internet?)"); }
  },
  "ler-analise": (b) => abrirAnalise(S.pessoa, b.dataset.id),
  "ir-dia": (b) => { if (S.plano.dias.some((x) => x.data === b.dataset.d)) { S.data = b.dataset.d; location.hash = "hoje"; } },
};
