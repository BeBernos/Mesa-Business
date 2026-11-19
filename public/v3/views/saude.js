// O que era da aba Saúde, agora dentro do Diário: peso (o oficial vem do Pulse), testes de reintrodução (deste plano e
// de meses anteriores), comida × sintoma, sintomas anotados (com apagar), suplementos e cuidados, e as notas "para saber".
import { S, hoje, rerender } from "../../js/state.js";
import { log } from "../../js/sync.js";
import { md } from "../../js/ui.js";
import { comidaXSintoma, historicoTestes, veredito, VEREDITOS, notasDe, ddmm, DIAS_SEMANA, diaSemana } from "../../js/plan.js";
import { lerSintoma } from "../../js/tratamento.js";
import { esc, icon, abrirFolha, fecharFolha, toast } from "../ui.js";

const TOM = { passou: "var(--agua2)", leve: "var(--carb)", nao: "var(--prot)", andamento: "var(--fg2)", sem: "var(--fg3)" };
const selo = (v) => `<span class="selo" style="--c:${TOM[v]}">${VEREDITOS[v]}</span>`;
const kg = (v) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Pesos [data, kg] em ordem; sem nenhum no registro, vale o histórico que veio no plano. */
function pesos(p) {
  const m = new Map();
  for (const r of log.all("weight", (x) => x.person === p.id)) if (Number(r.v) > 0) m.set(r.day, Number(r.v));
  if (!m.size) for (const [d, v] of p.peso?.historico || []) m.set(d, v);
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

function linhaPeso(pts) {
  if (pts.length < 2) return "";
  const vs = pts.map((x) => x[1]), mn = Math.min(...vs) - 0.3, mx = Math.max(...vs) + 0.3;
  const xy = pts.map(([, v], i) => `${(i / (pts.length - 1)) * 300},${(1 - (v - mn) / (mx - mn)) * 60 + 4}`).join(" ");
  return `<svg class="peso-linha" viewBox="0 0 300 68" preserveAspectRatio="none" role="img" aria-label="Peso: ${pts.map(([d, v]) => `${ddmm(d)} ${kg(v)} kg`).join(", ")}"><polyline points="${xy}"/></svg>`;
}

export function secoesSaude(p) {
  const h = hoje();
  const ps = pesos(p), ult = ps[ps.length - 1], ant = ps[ps.length - 2];
  const delta = ult && ant ? Math.round((ult[1] - ant[1]) * 10) / 10 : null;
  const peso = `<div class="sec" style="margin-top:1.25rem"><span>Peso</span>${p.peso?.meta ? `<span>meta ${esc(p.peso.meta)}</span>` : ""}</div>
    <div class="glass card">${ult ? `<div class="lado-a-lado"><b class="num peso-v">${kg(ult[1])} kg</b><small class="muted">${delta == null ? "primeiro registro" : `${delta > 0 ? "+" : ""}${kg(delta)} kg desde ${ddmm(ant[0])}`} · ${ddmm(ult[0])}</small></div>${linhaPeso(ps.slice(-12))}`
      : `<p class="muted" style="margin:0">Nenhum peso ainda. O Pulse manda o peso sozinho; dá para anotar aqui também.</p>`}
      <button class="btn" data-act="peso" style="margin-top:.625rem">${icon("scale", "sm")}Registrar peso</button></div>`;

  const testes = S.plano.testes.filter((t) => !t.pessoa || t.pessoa === p.id);
  const chave = (t, d) => `${t.alimento || t.grupo}-${d.n}`;
  const testesHtml = testes.length ? `<div class="sec" style="margin-top:1.25rem"><span>Testes de reintrodução</span></div><div class="regras">${testes.map((t) => `<div class="glass card">
      <div class="lado-a-lado"><span><b>${esc(t.alimento || t.grupo)}</b>${t.grupo && t.alimento ? `<br><small class="muted">${esc(t.grupo)}</small>` : ""}</span>
        ${selo(veredito(t.doses.map((d) => log.get("test", d.data, p.id, chave(t, d))?.v), t.doses.length))}</div>
      ${t.doses.map((d) => {
        const v = log.get("test", d.data, p.id, chave(t, d))?.v || "";
        return `<div class="dose-teste"><span class="num"><b>${+d.data.slice(8, 10)}</b> ${DIAS_SEMANA[diaSemana(d.data)]}</span><span class="grow">Dose ${d.n} · ${esc(d.quantidade || "")}${d.refeicao ? ` · ${esc(d.refeicao)}` : ""}
          ${d.data <= h ? `<span class="chips">${[["ok", "Sem sintoma"], ["leve", "Leve"], ["forte", "Forte"]].map(([k, l]) => `<button class="chip ${v === k ? "on" : ""}" data-act="teste" data-d="${d.data}" data-k="${esc(chave(t, d))}" data-v="${k}" aria-pressed="${v === k}">${l}</button>`).join("")}</span>` : `<br><small class="muted">${esc(d.texto || "")}</small>`}</span></div>`;
      }).join("")}
      ${t.criterio ? `<div class="md muted">${md(t.criterio)}</div>` : ""}</div>`).join("")}</div>` : "";

  const doPlano = new Set(testes.map((t) => t.alimento || t.grupo));
  const antigos = historicoTestes(log.all("test", (r) => r.person === p.id)).filter((t) => !doPlano.has(t.alimento));
  const antigosHtml = antigos.length ? `<div class="sec" style="margin-top:1.25rem"><span>Testes anteriores</span></div><div class="rows">${antigos.map((t) => `<div class="row"><span class="grow"><div>${esc(t.alimento)}</div>
    <div class="sub">${t.doses.length} dose${t.doses.length > 1 ? "s" : ""} · até ${ddmm(t.ultima)}</div></span>${selo(t.veredito)}</div>`).join("")}</div>` : "";

  const sintomas = log.all("symptom", (r) => r.person === p.id).map((r) => { try { return { day: r.day, ...JSON.parse(r.v) }; } catch (e) { return null; } }).filter(Boolean);
  const padroes = comidaXSintoma(S.plano, p.id, (k, d, id) => log.get(k, d, p.id, id)?.v ?? null, sintomas, h);
  const padroesHtml = padroes.length ? `<div class="sec" style="margin-top:1.25rem"><span>Comida × sintoma</span></div><div class="glass card regras">${padroes.map((x) => `<div>
    <div class="lado-a-lado"><b>${esc(x.alimento)}</b><span class="num muted">${x.comSintoma} de ${x.dias} dias</span></div><i class="barra-c" style="--p:${x.comSintoma / x.dias}"></i>
    <small class="muted">sem ele: ${x.semEleComSintoma} de ${x.semEle} dias com sintoma</small></div>`).join("")}
    <small class="muted">É só um padrão do que foi marcado como comido nos dias com sintoma, não uma prova. O Claude vê isso ao montar o plano.</small></div>` : "";

  const anotados = log.all("symptom", (r) => r.person === p.id).map((r) => ({ day: r.day, k: r.k, ...lerSintoma(r.v) }))
    .sort((a, b) => (b.day + b.hora).localeCompare(a.day + a.hora)).slice(0, 12);
  const anotadosHtml = anotados.length ? `<div class="sec" style="margin-top:1.25rem"><span>Sintomas anotados</span></div><div class="rows">${anotados.map((s) => `<div class="row">
    <span class="grow"><div>${s.alerta ? "⚠️ " : ""}${esc(s.rotulo || "sintoma")}</div><div class="sub">${ddmm(s.day)}${s.hora ? ` · ${esc(s.hora)}` : ""}</div></span>
    <button class="btn txt" data-act="sintoma-del" data-d="${s.day}" data-k="${esc(s.k)}" aria-label="Apagar ${esc(s.rotulo || "sintoma")} de ${ddmm(s.day)}">${icon("x", "sm")}</button></div>`).join("")}</div>` : "";

  const extras = [...p.suplementos.map((s) => ["pill", s]), ...p.restricoes.map((s) => ["triangle-alert", s])];
  const extrasHtml = extras.length ? `<div class="sec" style="margin-top:1.25rem"><span>Suplementos e cuidados</span></div><div class="rows">${extras.map(([ic, s]) => `<div class="row">${icon(ic, "sm")}<span class="grow">${esc(s)}</span></div>`).join("")}</div>` : "";
  const notas = notasDe(S.plano, "saude", p.id);
  const notasHtml = notas.length ? `<div class="sec" style="margin-top:1.25rem"><span>Para saber</span></div>${notas.map((n) => `<details class="nota-plano"><summary>${esc(n.titulo)}</summary><div class="md">${md(n.texto)}</div></details>`).join("")}` : "";

  return peso + testesHtml + antigosHtml + anotadosHtml + padroesHtml + extrasHtml + notasHtml;
}

export const acts = {
  peso: () => {
    const p = S.plano.pessoas.find((x) => x.id === S.pessoa);
    abrirFolha(`<small class="muted">${esc(p.nome)}</small><h2 class="h2">Registrar peso</h2>
      <input class="input peso-in num" name="kg" inputmode="decimal" placeholder="00,0" aria-label="Peso em kg">
      <p class="muted">kg · de manhã, em jejum, depois do banheiro</p>
      <label class="muted">Data<input class="input" type="date" name="data" value="${hoje()}"></label>
      <div class="foot"><button class="btn" data-act="mais-fechar">Cancelar</button><button class="btn cta" data-act="peso-salvar">Salvar</button></div>`, { aoFechar: rerender });
    document.querySelector("dialog.folha [name=kg]")?.focus();
  },
  "peso-salvar": () => {
    const d = document.querySelector("dialog.folha");
    const v = parseFloat(String(d.querySelector("[name=kg]").value).replace(",", "."));
    const dia = d.querySelector("[name=data]").value || hoje();
    if (!(v >= 10 && v <= 400)) return toast("Peso inválido");
    log.set("weight", dia, S.pessoa, "", String(Math.round(v * 10) / 10));
    fecharFolha();
    toast(`Peso anotado: ${kg(v)} kg`);
  },
  teste: (b) => {
    const { d, k, v } = b.dataset;
    if (log.get("test", d, S.pessoa, k)?.v === v) log.del("test", d, S.pessoa, k); else log.set("test", d, S.pessoa, k, v);
  },
  "sintoma-del": (b) => {
    const { d, k } = b.dataset, pid = S.pessoa;
    const antes = log.get("symptom", d, pid, k)?.v;
    log.del("symptom", d, pid, k);
    toast("Sintoma apagado", () => log.set("symptom", d, pid, k, antes));
  },
};
