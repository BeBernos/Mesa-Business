// Atualizar o plano do mês: arquivo .json (ou colar o texto do Claude) → validar → prévia → publicar.
import { S } from "../state.js";
import { normalizarPlano, extrairJson, ddmm, totais, metaDoDia, DIAS_SEMANA, diaSemana } from "../plan.js";
import { esc, icon, fmt, openSheet, closeSheet, toast, topSheet } from "../ui.js";
import { api } from "../sync.js";

let pendente = null;

function corpo(html) {
  const sb = topSheet()?.querySelector(".sb");
  if (sb) { sb.innerHTML = html; sb.scrollTop = 0; }
}

function inicio() {
  return `<div class="empty" style="min-height:auto;padding:12px 6px 6px">
      <div class="art logo"><img src="/img/logo.svg" alt=""></div>
      <div class="h2">Plano novo do mês</div>
      <p style="font-size:14.5px">O jeito mais fácil é o <b>conector do Claude</b> (Ajustes → Claude): ele publica sozinho. Ou traga aqui o arquivo .json que o Claude gerou.</p></div>
    <div class="stack" style="margin-top:10px">
      <button class="btn primary block" data-act="up-arquivo">${icon("upload")}Escolher arquivo</button>
      <button class="btn block" data-act="up-colar">${icon("clipboard-paste")}Colar o texto</button>
    </div>
    <div class="note" style="margin-top:18px">${icon("share-2")}<div>Atalho: no celular, toque no arquivo → <b>Compartilhar</b> → <b>Mesa</b>.</div></div>`;
}

export function abrirAtualizar(texto) {
  pendente = null;
  openSheet(`<div class="sh"><div class="h2">Atualizar plano</div><button class="icon-btn" data-act="close-sheet" aria-label="Fechar">${icon("x")}</button></div><div class="sb">${inicio()}</div>`);
  if (texto) analisar(texto);
}

function colar() {
  corpo(`<div class="field"><span>Cole aqui o JSON que o Claude gerou</span>
      <textarea class="input" id="colado" rows="10" placeholder='{ "formato": "plano-familia/2", ... }'></textarea></div>
    <div class="fab-row" style="margin-top:12px">
      <button class="btn" data-act="up-clipboard">${icon("clipboard-paste")}Da área de transferência</button>
      <button class="btn primary" data-act="up-conferir">Conferir</button></div>`);
}

export function analisar(texto, nome = "") {
  const { plano, erros, avisos, rascunho } = normalizarPlano(extrairJson(texto));
  if (!plano) {
    corpo(`<div class="note alerta">${icon("triangle-alert")}<div><div class="t">Não deu para usar ${esc(nome || "este plano")}</div>Corrija os pontos abaixo (pode colar esta lista para o Claude consertar).</div></div>
      <div class="card" style="margin-top:12px"><div class="err-list">${erros.map((e) => `<div>• ${esc(e)}</div>`).join("")}</div></div>
      <div class="fab-row" style="margin-top:14px"><button class="btn" data-act="up-copiar-erros">Copiar erros</button><button class="btn primary" data-act="up-voltar">Tentar outro</button></div>`);
    pendente = { erros };
    return;
  }
  pendente = { texto: extrairJson(texto), plano };
  const nRef = plano.dias.reduce((n, d) => n + Object.values(d.refeicoes).reduce((a, l) => a + l.length, 0), 0);
  const amostra = plano.dias.find((d) => d.data === new Date().toLocaleDateString("en-CA", { timeZone: S.tz })) || plano.dias[0];
  corpo(`<div class="eyebrow">${ddmm(plano.inicio)} a ${ddmm(plano.fim)}</div>
    <div class="h1" style="margin:4px 0 2px">${esc(plano.titulo)}</div>${plano.subtitulo ? `<div class="muted">${esc(plano.subtitulo)}</div>` : ""}
    <div class="stat3" style="margin-top:16px"><div><b>${plano.dias.length}</b><span>dias</span></div><div><b>${nRef}</b><span>refeições</span></div><div><b>${plano.notas.length + plano.testes.length}</b><span>notas e testes</span></div></div>
    <div class="rows" style="margin-top:12px">${plano.pessoas.map((p) => {
      const mt = metaDoDia(plano, p.id, amostra.tipo[p.id]);
      const tt = totais(amostra.refeicoes[p.id] || []);
      return `<div class="row"><span class="ico" style="background:${["rafael", "marina", "theo"].includes(p.id) ? `var(--${p.id})` : p.cor};color:#fff;font-weight:750">${esc(p.nome[0])}</span>
        <span class="grow"><div class="ttl">${esc(p.nome)}</div><div class="sub">${esc(p.resumo || p.detalhe || "")}</div></span>
        <span class="end"><b class="num">${fmt(tt.kcal)}</b><div class="faint" style="font-size:12px">de ${fmt(mt.kcal)} kcal</div></span></div>`;
    }).join("")}</div>
    ${avisos.length ? `<div class="stack" style="margin-top:12px">${avisos.map((a) => `<div class="note alerta">${icon("info")}<div>${esc(a)}</div></div>`).join("")}</div>` : `<div class="note ok" style="margin-top:12px">${icon("circle-check")}<div>Tudo certo com o formato.</div></div>`}
    <div class="section-title"><h2>Prévia · ${DIAS_SEMANA[diaSemana(amostra.data)]} ${ddmm(amostra.data)} · ${esc(plano.pessoas[0].nome)}</h2></div>
    <div class="rows">${(amostra.refeicoes[plano.pessoas[0].id] || []).map((m) => `<div class="row"><span class="num" style="font-weight:650;color:var(--ac-ink);min-width:46px">${m.hora}</span>
      <span class="grow"><div class="ttl">${esc(m.titulo || m.nome)}</div><div class="sub">${esc(m.nome)}${m.kcal != null ? ` · ${fmt(m.kcal)} kcal` : ""}</div></span></div>`).join("")}</div>
    <div class="gap-m"></div>
    <button class="btn primary block" data-act="up-publicar">Publicar para a família</button>
    <button class="btn ghost block" data-act="up-voltar" style="margin-top:6px">Cancelar</button>`);
}

async function publicar(b) {
  if (!pendente?.plano) return;
  b.disabled = true;
  b.textContent = "Publicando…";
  try {
    const r = await api("/api/plan", { method: "POST", body: JSON.stringify({ plano: pendente.texto, deviceId: S.deviceId }) });
    closeSheet();
    S.viewing = null;
    window.dispatchEvent(new CustomEvent("plano:trocar", { detail: { refresh: true } }));
    toast(r.notified ? `Publicado! ${r.notified} celular(es) avisado(s)` : "Plano publicado ✨");
  } catch (e) {
    b.disabled = false;
    b.textContent = "Tentar de novo";
    toast(e.data?.erros ? `Erro: ${e.data.erros[0]}` : "Falhou: " + e.message, 4200);
  }
}

const input = document.createElement("input");
input.type = "file";
input.accept = ".json,.txt,.html,application/json,text/plain,text/html";
input.addEventListener("change", async () => {
  const f = input.files[0];
  input.value = "";
  if (f) analisar(await f.text(), f.name);
});

export const acts = {
  "up-arquivo": () => input.click(),
  "up-colar": () => colar(),
  "up-clipboard": async () => {
    try { document.getElementById("colado").value = await navigator.clipboard.readText(); } catch (e) { toast("Toque e segure no campo para colar"); }
  },
  "up-conferir": () => { const t = document.getElementById("colado").value.trim(); if (t) analisar(t); },
  "up-voltar": () => corpo(inicio()),
  "up-publicar": (b) => publicar(b),
  "up-copiar-erros": async () => {
    try { await navigator.clipboard.writeText("Corrija estes erros no JSON do plano:\n" + pendente.erros.map((e) => "- " + e).join("\n")); toast("Copiado"); } catch (e) { toast("Não consegui copiar"); }
  },
};
