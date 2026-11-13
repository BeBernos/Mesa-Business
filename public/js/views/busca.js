// Busca no plano: "quando vai ter frango?" — em que dias e refeições aparece, para todas as pessoas.
import { S, rerender, hoje, cor } from "../state.js";
import { buscarNoPlano, DIAS_SEMANA, diaSemana, ddmm } from "../plan.js";
import { esc, icon, openSheet, closeSheet, sheetHead } from "../ui.js";
import { abrirRefeicao } from "./hoje.js";

function resultados(termo) {
  const rs = buscarNoPlano(S.plano, termo);
  if (termo.trim().length < 2) return `<p class="faint" style="padding:8px 2px">Digite um alimento ou prato, ex.: frango, kiwi, omelete.</p>`;
  if (!rs.length) return `<p class="faint" style="padding:8px 2px">Nada com “${esc(termo)}” neste plano.</p>`;
  const h = hoje();
  const nome = (pid) => S.plano.pessoas.find((p) => p.id === pid)?.nome || pid;
  const dias = [...new Set(rs.map((r) => r.data))];
  return `<p class="faint" style="font-size:13px;margin:2px 2px 10px">${rs.length} refeiç${rs.length === 1 ? "ão" : "ões"} em ${dias.length} dia${dias.length === 1 ? "" : "s"}${dias.some((d) => d >= h) ? ` · próxima: ${ddmm(dias.find((d) => d >= h))}` : ""}</p>
    <div class="rows">${rs.slice(0, 80).map((r) => `<button class="row ${r.data < h ? "past" : ""}" data-act="busca-ir" data-d="${r.data}" data-p="${esc(r.pessoa)}" data-id="${esc(r.id)}">
      <span class="ico" style="display:flex;flex-direction:column;justify-content:center;width:48px;height:44px;font-size:11px;line-height:1.15;box-shadow:inset 3px 0 0 ${cor(r.pessoa)}"><b>${DIAS_SEMANA[diaSemana(r.data)].slice(0, 3)}</b>${ddmm(r.data)}</span>
      <span class="grow"><div class="ttl">${esc(r.titulo)}</div><div class="sub">${esc(nome(r.pessoa))} · ${esc(r.nome)} ${r.hora}${r.opcao ? ` · opção ${r.opcao}` : ""}${r.achou.length ? ` · ${esc(r.achou.join(", ").toLowerCase())}` : ""}</div></span>
      ${icon("chevron-right")}</button>`).join("")}</div>`;
}

export function abrirBusca() {
  const sheet = openSheet(`${sheetHead("Buscar no plano")}
    <div class="sb"><input class="input" id="busca-q" type="search" placeholder="frango, kiwi, omelete…" autocomplete="off" aria-label="Buscar alimento ou prato">
      <div class="gap-s"></div><div id="busca-r">${resultados("")}</div><div class="gap-l"></div></div>`);
  const q = sheet.querySelector("#busca-q");
  q.addEventListener("input", () => { sheet.querySelector("#busca-r").innerHTML = resultados(q.value); });
  setTimeout(() => q.focus(), 120);
}

export const acts = {
  busca: () => { if (S.plano) abrirBusca(); },
  "busca-ir": (b) => {
    const { d, p, id } = b.dataset;
    // a ficha só abre depois que o "voltar" da busca termina (senão ele fecharia a ficha nova)
    addEventListener("popstate", () => setTimeout(() => abrirRefeicao(id), 30), { once: true });
    S.data = d; S.pessoa = p; S.tab = "hoje";
    closeSheet();
    rerender();
    scrollTo(0, 0);
  },
};
