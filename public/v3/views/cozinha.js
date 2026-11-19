// Preparo do dia e modo cozinha (letra grande, tela sempre acesa, temporizador nos passos que falam em minutos).
import { S, resumoDia, cor } from "../../js/state.js";
import { fmtQtd, DIAS_LONGOS, diaSemana } from "../../js/plan.js";
import { passo, alternarTimer, buzz } from "../../js/ui.js";
import { esc, icon, abrirFolha, fecharFolha } from "../ui.js";

const diaDoPlano = () => S.plano.dias.find((x) => x.data === S.data);

export function abrirPreparo() {
  const d = diaDoPlano();
  abrirFolha(`<h2 class="h2">Preparo de hoje</h2><p class="muted">${esc(DIAS_LONGOS[diaSemana(S.data)])} · toque no passo feito</p>
    <div class="steps">${d.preparo.map((s, i) => passo(esc(s), s, `dia-${i}`, `data-act="passo"`)).join("")}</div>
    <div class="foot"><button class="btn cta" data-act="cozinha">${icon("chef-hat", "sm")}Abrir modo cozinha</button></div>`);
}

let wake = null;
export async function abrirCozinha(id) {
  fecharFolha();
  const d = diaDoPlano();
  const m = id ? resumoDia(S.data, S.pessoa).refeicoes.find((x) => x.id === id) : null;
  const el = document.createElement("div");
  el.className = "cozinha";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Modo cozinha");
  el.style.setProperty("--ac", cor(S.pessoa));
  el.innerHTML = `<header class="hi"><div><small>${m ? `${esc(m.nome)} · ${esc(m.hora)}` : "Preparo do dia"}</small><h1>${esc(m ? m.titulo || m.nome : "Modo cozinha")}</h1></div>
      <button class="btn txt" data-k="fechar" aria-label="Fechar">${icon("x")}</button></header>
    ${m ? m.itens.map((it) => `<button class="kit" data-k="item"><span>${esc(it.nome)}</span><b class="num">${esc(fmtQtd(it.qtd, it.unid))}</b></button>`).join("") : ""}
    ${d.preparo.length && (!m || ["almoco", "jantar"].includes(m.tipo)) ? `<div class="sec" style="margin-top:1.5rem"><span>Modo de preparo</span></div>
      <div class="steps">${d.preparo.map((s, i) => passo(esc(s), s, `cz-${i}`, `data-k="passo"`)).join("")}</div>` : ""}`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    if (b.dataset.k === "fechar") { el.remove(); wake?.release().catch(() => {}); wake = null; }
    else if (b.dataset.k === "item") { b.classList.toggle("got"); buzz(); }
    else b.classList.toggle("done");
  });
  document.body.append(el);
  try { wake = await navigator.wakeLock.request("screen"); } catch (e) {}
}

export const acts = {
  preparo: () => abrirPreparo(),
  passo: (b) => b.classList.toggle("done"),
  cozinha: (b) => abrirCozinha(b.dataset.m),
  timer: (b) => alternarTimer(b, +b.dataset.min, b.dataset.rotulo || "temporizador"),
};
