// Subir o plano do mês: arquivo .json (ou colar o texto do Claude, ou "Compartilhar → Mesa") → conferir → prévia → publicar.
// O jeito mais fácil continua sendo o conector do Claude, que publica sozinho.
import { S } from "../../js/state.js";
import { normalizarPlano, extrairJson, ddmm, totais, metaDoDia, DIAS_SEMANA, diaSemana } from "../../js/plan.js";
import { api } from "../../js/sync.js";
import { esc, icon, fmt, abrirFolha, fecharFolha, toast } from "../ui.js";

let pendente = null;
function pintar(html) { const d = document.querySelector("dialog.folha[open]"); if (!d) return; const t = d.querySelector("#toast"); d.innerHTML = html; if (t) d.append(t); d.scrollTop = 0; }

const inicio = () => `<h2 class="h2">Plano novo do mês</h2>
  <p class="muted">O jeito mais fácil é o <b>conector do Claude</b> (Ajustes → Claude): ele publica sozinho. Ou traga aqui o arquivo .json que o Claude gerou.</p>
  <div class="regras" style="margin-top:.75rem"><button class="btn cta block" data-act="up-arquivo">${icon("upload", "sm")}Escolher arquivo</button>
    <button class="btn block" data-act="up-colar">${icon("clipboard-paste", "sm")}Colar o texto</button></div>
  <p class="muted" style="margin-top:.75rem">Atalho: no celular, toque no arquivo → Compartilhar → Mesa.</p>
  <div class="foot"><button class="btn" data-act="mais-fechar">Fechar</button></div>`;

export function abrirAtualizar(texto) {
  pendente = null;
  abrirFolha(inicio());
  if (texto) analisar(texto);
}

export function analisar(texto, nome = "") {
  const bruto = extrairJson(texto);
  const { plano, erros, avisos } = normalizarPlano(bruto);
  if (!plano) {
    pendente = { erros };
    return pintar(`<h2 class="h2">Não deu para usar ${esc(nome || "este plano")}</h2><p class="muted">Corrija os pontos abaixo (pode colar esta lista para o Claude consertar).</p>
      <div class="glass card regras">${erros.map((e) => `<div>• ${esc(e)}</div>`).join("")}</div>
      <div class="foot"><button class="btn" data-act="up-copiar-erros">Copiar erros</button><button class="btn cta" data-act="up-voltar">Tentar outro</button></div>`);
  }
  pendente = { texto: bruto, plano };
  const nRef = plano.dias.reduce((n, d) => n + Object.values(d.refeicoes).reduce((a, l) => a + l.length, 0), 0);
  const amostra = plano.dias.find((d) => d.data === new Date().toLocaleDateString("en-CA", { timeZone: S.tz })) || plano.dias[0];
  pintar(`<small class="muted">${ddmm(plano.inicio)} a ${ddmm(plano.fim)}</small><h2 class="h2">${esc(plano.titulo)}</h2>${plano.subtitulo ? `<p class="muted">${esc(plano.subtitulo)}</p>` : ""}
    <p class="muted">${plano.dias.length} dias · ${nRef} refeições · ${plano.notas.length + plano.testes.length} notas e testes</p>
    <div class="rows" style="margin-top:.5rem">${plano.pessoas.map((p) => {
      const mt = metaDoDia(plano, p.id, amostra.tipo[p.id]), tt = totais(amostra.refeicoes[p.id] || []);
      return `<div class="row"><span class="grow"><div>${esc(p.nome)}</div><div class="sub">${esc(p.resumo || p.detalhe || "")}</div></span>${p.crianca ? "" : `<span class="end num">${fmt(tt.kcal)} <small class="muted">de ${fmt(mt.kcal)} kcal</small></span>`}</div>`;
    }).join("")}</div>
    ${avisos.length ? `<div class="regras" style="margin-top:.75rem">${avisos.map((a) => `<div class="glass card aviso-dia alerta">${esc(a)}</div>`).join("")}</div>` : `<p class="muted">Tudo certo com o formato.</p>`}
    <div class="sec" style="margin-top:1rem"><span>Prévia · ${DIAS_SEMANA[diaSemana(amostra.data)]} ${ddmm(amostra.data)} · ${esc(plano.pessoas[0].nome)}</span></div>
    <div class="rows">${(amostra.refeicoes[plano.pessoas[0].id] || []).map((m) => `<div class="row"><span class="num" style="min-width:3rem">${esc(m.hora)}</span><span class="grow"><div>${esc(m.titulo || m.nome)}</div><div class="sub">${esc(m.nome)}</div></span></div>`).join("")}</div>
    <div class="foot"><button class="btn" data-act="up-voltar">Cancelar</button><button class="btn cta" data-act="up-publicar">Publicar para a família</button></div>`);
}

const arquivo = document.createElement("input");
arquivo.type = "file";
arquivo.accept = ".json,.txt,.html,application/json,text/plain,text/html";
arquivo.addEventListener("change", async () => {
  const f = arquivo.files[0];
  arquivo.value = "";
  if (f) analisar(await f.text(), f.name);
});

export const acts = {
  atualizar: () => abrirAtualizar(),
  "up-arquivo": () => arquivo.click(),
  "up-colar": () => pintar(`<h2 class="h2">Colar o plano</h2><textarea class="input" id="colado" rows="10" placeholder='{ "formato": "plano-familia/2", ... }' aria-label="JSON do plano"></textarea>
    <div class="foot"><button class="btn" data-act="up-clipboard">${icon("clipboard-paste", "sm")}Colar</button><button class="btn cta" data-act="up-conferir">Conferir</button></div>`),
  "up-clipboard": async () => { try { document.getElementById("colado").value = await navigator.clipboard.readText(); } catch (e) { toast("Toque e segure no campo para colar"); } },
  "up-conferir": () => { const t = document.getElementById("colado")?.value.trim(); if (t) analisar(t); },
  "up-voltar": () => pintar(inicio()),
  "up-copiar-erros": async () => {
    try { await navigator.clipboard.writeText("Corrija estes erros no JSON do plano:\n" + pendente.erros.map((e) => "- " + e).join("\n")); toast("Copiado"); } catch (e) { toast("Não consegui copiar"); }
  },
  "up-publicar": async (b) => {
    if (!pendente?.plano) return;
    b.disabled = true;
    b.textContent = "Publicando…";
    try {
      const r = await api("/api/plan", { method: "POST", body: JSON.stringify({ plano: pendente.texto, deviceId: S.deviceId }) });
      fecharFolha();
      dispatchEvent(new CustomEvent("plano:trocar", { detail: { refresh: true } }));
      toast(r.notified ? `Publicado! ${r.notified} celular(es) avisado(s)` : "Plano publicado ✨");
    } catch (e) {
      b.disabled = false;
      b.textContent = "Tentar de novo";
      toast(e.data?.erros ? `Erro: ${e.data.erros[0]}` : "Falhou: " + e.message);
    }
  },
};
