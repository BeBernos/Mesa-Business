// Componentes da pele Órbita. Cada um devolve HTML; `animar()` depois do desenho faz anéis, barras e onda
// andarem do valor anterior até o novo (o desenho troca o HTML inteiro, então a transição é refeita aqui).
import { esc, icon } from "../js/ui.js";
import { S, cor, rerender } from "../js/state.js";
import { log } from "../js/sync.js";

export { esc, icon };

/** Topo de toda aba: título, linha de cima, avatares (troca de pessoa), Ajustes e a fila offline. */
export function topo(titulo, sub = "", antes = "") {
  const pessoas = (S.plano?.pessoas || []).map((p) => ({ id: p.id, nome: p.nome, cor: cor(p.id) }));
  const fila = log.esperando();
  return `<header class="hi">${antes}<div style="min-width:0;flex:1 1 7rem">${sub ? `<small>${esc(sub)}</small>` : ""}<h1>${esc(titulo)}</h1>
      ${fila ? `<small role="status">${fila === 1 ? "1 alteração esperando internet" : `${fila} alterações esperando internet`}</small>` : ""}</div>
    <div style="display:flex;align-items:center;gap:.5rem">${pessoas.length > 1 ? avatares(pessoas, S.pessoa) : ""}
      <a class="btn txt" href="#ajustes" aria-label="Ajustes" style="padding:.375rem">${icon("settings")}</a></div></header>`;
}
export const $ = (s, r = document) => r.querySelector(s);
export const fmt = (n) => (n == null ? "–" : Math.round(n).toLocaleString("pt-BR"));
export const litros = (ml) => (ml / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const pct = (v, meta) => (meta ? Math.max(0, Math.min(1, (v || 0) / meta)) : 0);
const CHECK = `<span class="check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;

/** Valor animado: `chave` identifica o mesmo elemento entre um desenho e outro. */
const anim = (chave, p) => `data-anim="${esc(chave)}" data-v="${p.toFixed(4)}"`;

/** Dois anéis (kcal por fora, proteína por dentro) com o número sempre no centro. */
export function aneis({ kcal, metaKcal, prot, metaProt, chave = "hoje", rotulo = "" }) {
  return `<div class="rings" role="img" aria-label="${fmt(kcal)} de ${fmt(metaKcal)} kcal, ${fmt(prot)} de ${fmt(metaProt)} g de proteína">
    <svg viewBox="0 0 200 200" aria-hidden="true"><defs>
      <linearGradient id="g-k"><stop offset="0" stop-color="#FF6B3D"/><stop offset="1" stop-color="#FF9D5C"/></linearGradient>
      <linearGradient id="g-p"><stop offset="0" stop-color="#F0506E"/><stop offset="1" stop-color="#FF7AC6"/></linearGradient></defs>
      <circle class="tr" cx="100" cy="100" r="90"/><circle cx="100" cy="100" r="90" stroke="url(#g-k)" pathLength="100" ${anim(chave + ":k", pct(kcal, metaKcal))}/>
      <circle class="tr" cx="100" cy="100" r="70"/><circle cx="100" cy="100" r="70" stroke="url(#g-p)" pathLength="100" ${anim(chave + ":p", pct(prot, metaProt))}/>
    </svg>
    <div class="center"><div class="big num gtext" data-pop="${esc(chave)}:kcal">${fmt(kcal)}</div><small>${rotulo || `de ${fmt(metaKcal)} kcal`}</small></div></div>`;
}

const ONDA = `<svg viewBox="0 0 200 14" preserveAspectRatio="none"><path d="M0 7 Q25 0 50 7 T100 7 T150 7 T200 7 V14 H0Z"/></svg><svg class="b" viewBox="0 0 200 14" preserveAspectRatio="none"><path d="M0 7 Q25 14 50 7 T100 7 T150 7 T200 7 V14 H0Z"/></svg>`;

/** Garrafa de água com onda; o botão "+" leva `data-act` (padrão: agua, +250 ml). */
export function garrafa({ ml, meta, chave = "hoje", act = "agua" }) {
  return `<div class="bottle"><div class="lab"><b class="num" data-pop="${esc(chave)}:agua">${litros(ml)}</b>de ${litros(meta)} L</div>
    <div class="wave" ${anim(chave + ":a", pct(ml, meta))} aria-hidden="true">${ONDA}</div>
    <button class="plus" data-act="${act}" data-v="250" aria-label="Mais um copo de água (250 ml)">${icon("plus", "sm")}</button></div>`;
}

/** Proteína, carbo e gordura: texto + linha fina, sem caixa. */
export function macros({ feito, meta = {}, chave = "hoje" }) {
  const l = [["Proteína", "proteina", "--prot"], ["Carbo", "carbo", "--carb"], ["Gordura", "gordura", "--fat"]];
  return `<div class="macro3">${l.map(([t, k, c]) => `<div><small>${t}</small><b class="num">${meta[k] ? `${fmt(feito[k])} g` : "–"}</b>
    <i style="--c:var(${c})" ${anim(`${chave}:${k}`, pct(feito[k], meta[k]))}></i></div>`).join("")}</div>`;
}

/** Faixa de dias: [{ data, rotulo: "Qua", n: 18, past }]; `sel` é a data aberta. */
export function dias(lista, sel) {
  return `<nav class="days" aria-label="Dias">${lista.map((d) => `<button class="${d.data === sel ? "on" : ""} ${d.past ? "past" : ""}" data-act="dia" data-d="${d.data}" aria-current="${d.data === sel ? "date" : "false"}">${esc(d.rotulo)}<b>${d.n}</b></button>`).join("")}</nav>`;
}

/** Avatares das pessoas no topo; a da vez fica acesa. */
export function avatares(pessoas, sel) {
  return `<div class="who" role="group" aria-label="Pessoa">${pessoas.map((p) => `<button style="--pc:${p.cor}" data-act="pessoa" data-p="${esc(p.id)}" aria-pressed="${p.id === sel}" aria-label="${esc(p.nome)}">${esc(p.nome[0])}</button>`).join("")}</div>`;
}

/** Refeição fina na linha do tempo. m: { id, hora, nome, desc, kcal, extra? }. O corpo abre a ficha; o círculo marca.
 *  `extra` é HTML já escapado (ex.: "comeu parte · ~420 kcal"); `antes` entra antes do texto (bonequinho da criança). */
export function refeicao(m, { feita = false, semKcal = false, antes = "", depois = "" } = {}) {
  return `<div class="meal ${feita ? "done" : ""}">${antes}
    <button class="corpo" data-act="ficha" data-m="${esc(m.id)}"><span class="t">${esc(m.hora)}${!semKcal && m.kcal != null ? ` · ${fmt(m.kcal)} kcal` : ""}</span>
      <div class="n">${esc(m.nome)}</div>${m.desc ? `<div class="it">${esc(m.desc)}</div>` : ""}${m.extra ? `<div class="ex">${m.extra}</div>` : ""}</button>
    ${depois || `<button class="marcar" data-act="comi" data-m="${esc(m.id)}" aria-pressed="${feita}" aria-label="${feita ? "Desmarcar" : "Marcar como feita"}: ${esc(m.nome)}">${CHECK}</button>`}</div>`;
}

/** Cartão da refeição da vez: itens com porção à direita, "Comi" no degradê, ações secundárias como texto. */
export function cartaoDaVez(m, { semKcal = false, acoes = [], go = "" } = {}) {
  return `<div class="now" aria-label="Agora: ${esc(m.nome)}"><span class="t">AGORA · ${esc(m.hora)}${!semKcal && m.kcal != null ? ` · ${fmt(m.kcal)} kcal` : ""}</span>
    <button class="n corpo" data-act="ficha" data-m="${esc(m.id)}">${esc(m.nome)}</button>
    <ul>${(m.itens || []).map(([a, b]) => `<li><span>${esc(a)}</span><span class="num">${esc(b)}</span></li>`).join("")}</ul>
    <div class="go">${go || `<button class="btn cta" data-act="comi" data-m="${esc(m.id)}">Comi</button>`}${go ? "" : acoes.map((a) => a.href
      ? `<a class="btn txt" href="${esc(a.href)}">${esc(a.rotulo)}</a>` : `<button class="btn txt" data-act="${esc(a.act)}" data-m="${esc(m.id)}">${esc(a.rotulo)}</button>`).join("")}</div></div>`;
}

/** Anotação no horário (sintoma, dose…) entre as refeições. */
export const nota = (texto, cor = "var(--fg3)") => `<div class="nota" style="--c:${cor}">${texto}</div>`;

export const linhaDoTempo = (itens) => `<div class="tl">${itens.join("")}</div>`;

// ---------- animação ----------
const antes = new Map();
export function animar(raiz = document) {
  raiz.querySelectorAll("[data-anim]").forEach((el) => {
    const k = el.dataset.anim, v = +el.dataset.v;
    el.style.setProperty("--p", antes.has(k) ? antes.get(k) : 0);
    el.getBoundingClientRect(); // fixa o valor de partida antes de mudar
    requestAnimationFrame(() => el.style.setProperty("--p", v));
    antes.set(k, v);
  });
  raiz.querySelectorAll("[data-pop]").forEach((el) => {
    const k = "pop:" + el.dataset.pop;
    if (antes.has(k) && antes.get(k) !== el.textContent) el.classList.add("pop");
    antes.set(k, el.textContent);
  });
}

// ---------- folha ----------
/** Abre uma folha que sobe de baixo (dialog nativo: foco preso, Esc e "voltar" do Android fecham). */
export function abrirFolha(html, { aoFechar } = {}) {
  fecharFolha();
  const d = document.createElement("dialog");
  d.className = "folha";
  d.innerHTML = html;
  d.addEventListener("close", () => {
    const t = d.querySelector("#toast");
    if (t) { if (t.matches(":popover-open")) t.hidePopover(); t.classList.remove("on"); document.body.append(t); }
    d.remove();
    (aoFechar || rerender)(); // o que foi gravado com a folha aberta aparece ao fechar
  });
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); }); // toque fora
  document.body.append(d);
  d.showModal();
  return d;
}
export const fecharFolha = () => document.querySelector("dialog.folha[open]")?.close();
export const folhaAberta = () => !!document.querySelector("dialog.folha[open]");

// ---------- toast ----------
let tt;
/** Aviso rápido; com `desfazer` ganha o botão e fica 5 s. Vai para a camada de cima (popover), então aparece
 *  por cima de uma folha aberta e do modo cozinha. */
export function toast(msg, desfazer = null) {
  const t = $("#toast");
  // com uma folha modal aberta, o resto da página fica inerte: o aviso (e o Desfazer) mora dentro dela
  const casa = document.querySelector("dialog.folha[open]") || document.body;
  if (t.parentNode !== casa) { if (t.matches(":popover-open")) t.hidePopover(); casa.append(t); }
  t.textContent = msg;
  if (desfazer) {
    const b = document.createElement("button");
    b.textContent = "Desfazer";
    b.onclick = () => { esconder(t); desfazer(); };
    t.append(b);
  }
  try { if (t.matches(":popover-open")) t.hidePopover(); t.showPopover?.(); } catch (e) {} // mostrar de novo = ficar acima do que abriu depois
  t.classList.add("on");
  clearTimeout(tt);
  tt = setTimeout(() => esconder(t), desfazer ? 5000 : 2200);
}
function esconder(t) {
  t.classList.remove("on");
  clearTimeout(tt);
  tt = setTimeout(() => { try { if (t.matches(":popover-open")) t.hidePopover(); } catch (e) {} }, 350);
}

