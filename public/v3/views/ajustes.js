// Ajustes: menu por assunto (com o resumo em cada linha) e uma página por assunto — este celular, notificações,
// lembretes, água, tratamento, plano do mês, Claude, família e treino, segurança e app.
import { S, rerender, hoje } from "../../js/state.js";
import { REFEICOES, diaDoTratamento } from "../../js/tratamento.js";
import { DIAS_SEMANA, DIAS_LONGOS, ddmm } from "../../js/plan.js";
import { tratamentoDe, guardarTrat } from "./mais.js";
import { icon, esc, topo, abrirFolha, fecharFolha, toast } from "../ui.js";
import { VERSAO, NOVIDADES, novasDesde } from "../../js/views/novidades.js";
import { LS, api } from "../../js/sync.js";
import { putDevice, permissao, ativarPush, proximosAvisos, testarAviso, aparelhosDaFamilia, enderecoClaude, sair, PRESETS } from "../../js/aparelho.js";
import { temDigital, digitalDisponivel, cadastrarDigital, removerDigital } from "../../js/views/bloqueio.js";

let secao = null; // null = menu
const pessoas = () => S.plano?.pessoas || [];
const nomeP = (id) => pessoas().find((x) => x.id === id)?.nome || id;
const cor = (id) => (["rafael", "marina", "theo"].includes(id) ? `var(--${id})` : "var(--ac)");
const sw = (campo, on, rotulo) => `<input type="checkbox" data-field="${campo}" ${on ? "checked" : ""} aria-label="${esc(rotulo)}">`;
const hhmm = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: S.tz });
const diaDe = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: S.tz });
let proximos = null, aparelhos = null, mcpUrl = null, digitalOk = null, instalar = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); instalar = e; });

// ---------- salvar o aparelho (debounce: digitar o nome não grava a cada letra) ----------
let timer;
function salvar(patch) {
  S.cfg = { ...(S.cfg || {}), ...patch };
  LS.set("app_cfg", S.cfg);
  rerender();
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try { await putDevice(); proximos = null; rerender(); } catch (e) { toast("Não salvou: " + e.message); }
  }, 450);
}
addEventListener("change", (e) => {
  const f = e.target.dataset?.field;
  if (!f || !e.target.closest(".ajustes")) return;
  const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  const c = S.cfg || {};
  if (f === "summaryOn") salvar({ summary: { ...(c.summary || { time: "06:30" }), on: v } });
  else if (f === "summaryTime") salvar({ summary: { ...(c.summary || {}), on: true, time: v } });
  else if (f === "lead") salvar({ lead: Number(v) });
  else salvar({ [f]: v });
});

// ---------- água (avisos do servidor: acorda, dorme, ligado) — por pessoa ----------
const cfgAgua = new Map();
function secaoAgua() {
  const p = pessoas().find((x) => x.id === S.pessoa);
  if (!p || p.crianca) return `<p class="muted">Criança não recebe o lembrete de água.</p>`;
  const c = cfgAgua.get(p.id);
  if (!c) api(`/api/agua-cfg/${encodeURIComponent(p.id)}`).then((r) => { cfgAgua.set(p.id, r); rerender(); }).catch(() => {});
  const v = c || { ligado: true, acorda: "07:00", dorme: "22:00" };
  return `<form class="rows" data-agua data-p="${esc(p.id)}" onsubmit="return false">
    <label class="row"><span class="grow"><div>Lembrar de beber água</div><div class="sub">Só quando a água de ${esc(p.nome)} estiver atrasada, nunca de madrugada</div></span>
      <input type="checkbox" name="ligado" ${v.ligado ? "checked" : ""}></label>
    <label class="row"><span class="grow">Acorda</span><input class="input hora" type="time" name="acorda" value="${esc(v.acorda)}"></label>
    <label class="row"><span class="grow">Dorme</span><input class="input hora" type="time" name="dorme" value="${esc(v.dorme)}"></label></form>`;
}
addEventListener("change", async (e) => {
  const form = e.target.closest("[data-agua]");
  if (!form) return;
  const corpo = { ligado: form.ligado.checked, acorda: form.acorda.value, dorme: form.dorme.value };
  try { cfgAgua.set(form.dataset.p, await api(`/api/agua-cfg/${encodeURIComponent(form.dataset.p)}`, { method: "PUT", body: JSON.stringify(corpo) })); }
  catch (err) { toast("Não consegui salvar (sem internet?)"); }
  rerender();
});

// ---------- tratamento (ex.: berberina + alicina) — por pessoa ----------
let editando = false;
function secaoTratamento() {
  const p = pessoas().find((x) => x.id === S.pessoa);
  if (!p || p.crianca) return `<p class="muted">Tratamento é para adultos.</p>`;
  const t = tratamentoDe(p.id);
  if (!editando) {
    if (!t) return `<div class="rows"><button class="row" data-act="trat-novo">${icon("pill")}<span class="grow"><div>Cadastrar tratamento</div><div class="sub">Ex.: berberina + alicina — as doses entram na Hoje e no lembrete da refeição</div></span>${icon("plus")}</button></div>`;
    const d = diaDoTratamento(t, hoje());
    const estado = d.antes ? `começa em ${t.inicio.slice(8, 10)}/${t.inicio.slice(5, 7)}` : d.acabou || (t.fim && hoje() > t.fim) ? "terminou" : `dia ${d.n} de ${d.total}`;
    return `<div class="rows"><div class="row">${icon("pill")}<span class="grow"><div>${esc(t.nome)}</div><div class="sub">${estado} · ${t.doses.map((x) => `${esc(x.nome)} (${esc(REFEICOES[x.quando] || x.quando)})`).join(", ") || "sem doses"}</div></span></div>
      <button class="row" data-act="trat-editar">${icon("notebook-pen")}<span class="grow">Editar</span></button>
      <button class="row" data-act="trat-encerrar">${icon("x")}<span class="grow">Encerrar e apagar o cadastro</span></button></div>`;
  }
  const v = t || { nome: "", inicio: hoje(), dias: 28, doses: [] };
  const linhaDose = (i) => {
    const d = v.doses[i] || { nome: "", quando: "" };
    const horario = /^\d/.test(d.quando);
    return `<div class="lado3"><input type="hidden" name="id${i}" value="${esc(d.id || "")}" data-nome="${esc(d.nome)}"><input class="input" name="dose${i}" placeholder="Suplemento" maxlength="40" value="${esc(d.nome)}" aria-label="Suplemento ${i + 1}">
      <select class="input" name="quando${i}" aria-label="Quando tomar o suplemento ${i + 1}">${Object.entries(REFEICOES).map(([k, l]) => `<option value="${k}" ${d.quando === k ? "selected" : ""}>no ${l}</option>`).join("")}
        <option value="horario" ${horario ? "selected" : ""}>em um horário</option></select>
      <input class="input hora" type="time" name="hora${i}" value="${horario ? esc(d.quando) : ""}" aria-label="Horário do suplemento ${i + 1}"></div>`;
  };
  return `<form class="glass card trat-form" data-trat onsubmit="return false">
    <label>Nome<input class="input" name="nome" maxlength="60" placeholder="Berberina + alicina" value="${esc(v.nome)}"></label>
    <div class="lado2"><label>Início<input class="input" type="date" name="inicio" value="${esc(v.inicio)}"></label>
      <label>Dias<input class="input" type="number" name="dias" min="1" max="120" value="${v.dias}"></label></div>
    <div class="sec"><span>Doses</span><span>suplemento + quando</span></div>
    ${Array.from({ length: Math.max(4, v.doses.length) }, (_, i) => linhaDose(i)).join("")}
    <p class="muted">Berberina: com comida, por prazo definido; interage com remédios de uso contínuo.</p>
    <div class="go"><button class="btn cta" data-act="trat-salvar">Salvar</button><button class="btn txt" data-act="trat-cancelar">Cancelar</button></div></form>`;
}

// ---------- páginas ----------
function proximosHtml() {
  if (proximos === null) { proximos = undefined; proximosAvisos().then((u) => { proximos = u; rerender(); }).catch(() => { proximos = []; rerender(); }); }
  if (!proximos) return `<div class="row"><span class="muted">carregando…</span></div>`;
  if (!proximos.length) return `<div class="row"><span class="muted">Nada agendado nas próximas 48 h. Escolha de quem são os avisos em “Este celular”.</span></div>`;
  const h = diaDe(Date.now());
  return proximos.map((e) => { const d = diaDe(e.at); return `<div class="row"><span class="num" style="min-width:4.5rem">${d === h ? "" : DIAS_SEMANA[new Date(d + "T12:00").getDay()] + " "}${hhmm(e.at)}</span><span class="grow">${esc(e.title)}</span></div>`; }).join("");
}

const PAGINAS = {
  celular: (c) => `<div class="glass card regras">
    <label>Nome deste celular<input class="input" data-field="name" value="${esc(c.name || "")}" maxlength="40" placeholder="Ex.: S25 do Rafael"></label>
    <div><div class="muted">Avisar as refeições de</div><div class="chips">${pessoas().map((p) => `<button class="chip ${(c.persons || []).includes(p.id) ? "on" : ""}" style="--ac:${cor(p.id)}" data-act="aj-pessoa" data-p="${esc(p.id)}" aria-pressed="${(c.persons || []).includes(p.id)}">${esc(p.nome)}</button>`).join("")}</div></div>
    <div><div class="muted">Abrir o app em</div><div class="chips">${pessoas().map((p) => `<button class="chip ${c.viewPerson === p.id ? "on" : ""}" style="--ac:${cor(p.id)}" data-act="aj-ver" data-p="${esc(p.id)}" aria-pressed="${c.viewPerson === p.id}">${esc(p.nome)}</button>`).join("")}</div></div></div>
    <p class="muted">As perguntas da Mesa e o lembrete de água vão para a pessoa em que o app abre.</p>`,
  avisos: (c) => {
    const perm = permissao();
    const estado = perm === "unsupported" ? `<div class="row aviso-dia alerta">Este navegador não suporta notificações. No Samsung, abra pelo <b>Chrome</b>.</div>`
      : perm === "denied" ? `<div class="row aviso-dia alerta">Notificações <b>bloqueadas</b>. Libere em Configurações → Apps → Chrome (ou Mesa) → Notificações.</div>`
      : c.hasPush ? `<div class="row">${icon("bell")}<span class="grow"><div>Notificações ativas</div><div class="sub">Neste celular</div></span><button class="btn" data-act="aj-testar">Testar</button></div>`
      : `<div class="row">${icon("bell")}<span class="grow"><div>Desativadas</div><div class="sub">Ative para receber os horários</div></span><button class="btn cta" data-act="aj-ativar">Ativar</button></div>`;
    return `<div class="rows">${estado}
      <label class="row"><span class="grow"><div>Horário das refeições</div><div class="sub">Com o que comer e as quantidades. Não avisa o que já foi marcado.</div></span>${sw("meals", c.meals !== false, "Horário das refeições")}</label>
      <label class="row"><span class="grow">Avisar</span><select class="input hora" data-field="lead" aria-label="Quanto antes avisar">${[0, 5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${Number(c.lead || 0) === m ? "selected" : ""}>${m ? `${m} min antes` : "na hora"}</option>`).join("")}</select></label>
      <label class="row"><span class="grow"><div>Resumo do dia</div><div class="sub">Um aviso de manhã com o dia todo</div></span>${c.summary?.on ? `<input class="input hora" type="time" data-field="summaryTime" value="${esc(c.summary.time || "06:30")}" aria-label="Hora do resumo">` : ""}${sw("summaryOn", c.summary?.on, "Resumo do dia")}</label>
      <label class="row"><span class="grow"><div>Perguntas da Mesa</div><div class="sub">Quando falta algo, a Mesa pergunta como você está (no máximo 2 por dia)</div></span>${sw("proativo", c.proativo !== false, "Perguntas da Mesa")}</label>
      <label class="row"><span class="grow"><div>Plano novo</div><div class="sub">Avisa quando alguém atualiza o plano</div></span>${sw("updates", c.updates !== false, "Plano novo")}</label>
      <label class="row"><span class="grow"><div>Eu atualizo o plano</div><div class="sub">Lembra 3 dias e 1 dia antes do fim</div></span>${sw("uploader", !!c.uploader, "Eu atualizo o plano")}</label></div>
    <div class="sec" style="margin-top:1rem"><span>Próximos avisos</span></div><div class="rows">${proximosHtml()}</div>
    <details class="info" style="margin-top:.75rem"><summary>Samsung: aviso atrasando?</summary>A One UI “adormece” apps para poupar bateria. Uma vez em cada celular:
      Configurações → Bateria → Limites de uso em segundo plano → <b>Apps que nunca dormem</b> → adicione o Chrome; e Configurações → Apps → Chrome → Bateria → <b>Sem restrições</b>.</details>`;
  },
  lembretes: (c) => `<div class="rows">${(c.reminders || []).map((r) => `<div class="row"><span class="num" style="min-width:3rem">${esc(r.time)}</span>
      <span class="grow"><div>${esc(r.text)}</div><div class="sub">${r.days.length === 7 ? "todo dia" : r.days.map((d) => DIAS_SEMANA[d]).join(" · ")}</div></span>
      <button class="btn txt" data-act="aj-rem-del" data-id="${esc(r.id)}" aria-label="Remover o lembrete ${esc(r.text)}">${icon("x", "sm")}</button></div>`).join("") || `<div class="row muted">Nenhum lembrete ainda.</div>`}</div>
    <form class="glass card regras" data-form="lembrete" style="margin-top:.75rem">
      <input class="input" name="texto" placeholder="Novo lembrete (ex.: tomar creatina)" aria-label="Texto do lembrete">
      <div class="lado-a-lado"><input class="input hora" type="time" name="hora" value="08:00" aria-label="Horário">
        <span class="chips" id="remDias">${DIAS_SEMANA.map((d, i) => `<button type="button" class="chip on" data-act="aj-dia" data-d="${i}" aria-pressed="true" aria-label="${DIAS_LONGOS[i]}">${d.slice(0, 1)}</button>`).join("")}</span></div>
      <button class="btn cta" type="submit">${icon("plus", "sm")}Adicionar</button></form>
    <div class="sec" style="margin-top:1rem"><span>Sugestões</span></div>
    <div class="chips">${PRESETS.filter((p) => !(c.reminders || []).some((r) => r.text === p.text)).map((p) => `<button class="chip" data-act="aj-preset" data-i="${PRESETS.indexOf(p)}">+ ${esc(p.text)}</button>`).join("")}</div>`,
  agua: () => secaoAgua(),
  tratamento: () => secaoTratamento(),
  plano: () => {
    const hist = S.meta?.history || [], atual = S.planoInfo;
    return `<div class="glass card">${atual ? `<b>${esc(atual.title)}</b><div class="muted">${ddmm(atual.from)} a ${ddmm(atual.to)}${atual.uploadedAt ? ` · enviado ${new Date(atual.uploadedAt).toLocaleDateString("pt-BR")}` : ""}${atual.by ? ` por ${esc(atual.by)}` : ""}</div>` : `<div class="muted">Nenhum plano ainda.</div>`}
      <button class="btn cta block" data-act="atualizar" style="margin-top:.75rem">${icon("upload", "sm")}Atualizar plano do mês</button>
      <p class="muted" style="margin:.625rem 0 0">O jeito mais fácil é pedir ao Claude com o conector (Ajustes → Claude): ele publica direto aqui.</p></div>
    ${hist.length > 1 ? `<div class="sec" style="margin-top:1rem"><span>Histórico</span></div><div class="rows">${hist.map((h, i) => `<div class="row" style="flex-wrap:wrap"><span class="grow"><div>${esc(h.title)}${i === 0 ? " · mais novo" : ""}</div>
      <div class="sub">${ddmm(h.from)}–${ddmm(h.to)}${h.uploadedAt ? ` · ${new Date(h.uploadedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}${h.by ? ` · ${esc(h.by)}` : ""}</div></span>
      <span class="go">${h.kind === "v2" ? `<button class="btn txt" data-act="ver-plano" data-id="${esc(h.id)}">${S.planoInfo?.id === h.id ? "Aberto" : "Ver"}</button>` : `<a class="btn txt" href="/p/${esc(h.id)}.html" target="_blank" rel="noopener">Ver</a>`}
      ${i > 0 && h.kind === "v2" ? `<button class="btn txt" data-act="aj-voltar-plano" data-id="${esc(h.id)}">${icon("rotate-ccw", "sm")}Voltar a este</button>` : ""}
      <button class="btn txt" data-act="aj-apagar-plano" data-id="${esc(h.id)}" aria-label="Apagar ${esc(h.title)}">${icon("x", "sm")}</button></span></div>`).join("")}</div>` : ""}`;
  },
  claude: () => `<div class="glass card"><b>Conectar a Mesa ao Claude</b>
    <p class="muted">Com o conector, você pede no Claude “monte a dieta do mês que vem” e ele lê o feedback, o peso e o que foi comido, monta o plano e publica aqui. Também grava as análises no Diário.</p>
    ${mcpUrl ? `<div class="input endereco">${esc(mcpUrl)}</div>
      <div class="go" style="margin-top:.625rem"><button class="btn cta" data-act="aj-mcp-copiar">${icon("clipboard-paste", "sm")}Copiar endereço</button><button class="btn" data-act="aj-mcp-novo">Gerar outro</button></div>
      <p class="muted"><b>1.</b> No claude.ai: Configurações → Conectores → Adicionar conector personalizado. <b>2.</b> Nome: Mesa · URL: cole o endereço → Adicionar.<br>O endereço é uma chave: não compartilhe. “Gerar outro” desliga o antigo.</p>`
      : `<button class="btn block" data-act="aj-mcp" style="margin-top:.5rem">${icon("sparkles", "sm")}Mostrar o endereço do conector</button>`}</div>`,
  familia: () => {
    if (aparelhos === null) { aparelhos = undefined; aparelhosDaFamilia().then((d) => { aparelhos = d; rerender(); }).catch(() => { aparelhos = []; rerender(); }); }
    return `<div class="rows">${(aparelhos || []).map((d) => `<div class="row">${icon("smartphone", "sm")}<span class="grow"><div>${esc(d.name)}${d.id === S.deviceId ? " · este" : ""}</div>
      <div class="sub">${d.persons.map((p) => esc(nomeP(p))).join(", ") || "sem pessoas"} · ${d.hasPush ? "avisos ativos" : "sem avisos"}</div></span></div>`).join("") || `<div class="row muted">${aparelhos ? "Nenhum aparelho." : "carregando…"}</div>`}</div>
    <div class="sec" style="margin-top:1rem"><span>Treino</span></div>
    <div class="rows"><a class="row" href="https://pulse.example.workers.dev/" target="_blank" rel="noopener">${icon("dumbbell")}<span class="grow"><div>Abrir o Pulse</div><div class="sub">O app de treino manda o peso, o treino do dia e o cardio para a Mesa</div></span>${icon("chevron-right")}</a></div>`;
  },
  seguranca: () => {
    if (digitalOk === null) { digitalOk = undefined; digitalDisponivel().then((v) => { digitalOk = v; rerender(); }); }
    return `<div class="rows">
    ${temDigital() ? `<div class="row">${icon("smartphone")}<span class="grow"><div>Digital ativa</div><div class="sub">Destrava a Mesa neste celular</div></span><button class="btn txt" data-act="aj-digital-remover">Remover</button></div>`
      : digitalOk ? `<div class="row">${icon("smartphone")}<span class="grow"><div>Desbloquear com a digital</div><div class="sub">Em vez de digitar a senha</div></span><button class="btn cta" data-act="aj-digital-ativar">Ativar</button></div>`
      : `<div class="row">${icon("smartphone")}<span class="grow"><div>Digital indisponível</div><div class="sub">Este navegador não oferece digital para apps da web — vale a senha</div></span></div>`}
    <div class="row"><span class="grow sub">A Mesa trava depois de ${LS.get("app_idle_h", 4)} horas sem uso. Os botões das notificações continuam funcionando.</span></div></div>
    <div class="rows" style="margin-top:.75rem"><button class="row sair" data-act="aj-sair">${icon("log-out")}<span class="grow">Sair deste celular</span></button></div>`;
  },
  app: () => {
    const standalone = matchMedia("(display-mode: standalone)").matches;
    return `<div class="rows">
    ${standalone ? `<div class="row">${icon("circle-check")}<span class="grow">Instalado na tela inicial</span></div>`
      : instalar ? `<button class="row" data-act="aj-instalar">${icon("smartphone")}<span class="grow">Instalar na tela inicial</span>${icon("chevron-right")}</button>`
      : `<div class="row">${icon("smartphone")}<span class="grow"><div>Instalar</div><div class="sub">Chrome → ⋮ → Adicionar à tela inicial</div></span></div>`}
    <button class="row" data-act="novidades">${icon("sparkles")}<span class="grow"><div>Novidades</div><div class="sub">Versão ${esc(VERSAO)}</div></span>${icon("chevron-right")}</button>
    <a class="row" href="#catalogo">${icon("sparkles")}<span class="grow"><div>Catálogo da pele</div><div class="sub">Todos os componentes da Órbita</div></span>${icon("chevron-right")}</a>
    <button class="row" data-act="aj-recarregar">${icon("refresh-cw")}<span class="grow">Recarregar</span></button></div>`;
  },
};

const SECOES = [
  { id: "avisos", ic: "bell", t: "Notificações", r: (c) => { const p = permissao(); return p === "unsupported" || p === "denied" ? "Bloqueadas neste celular" : !c.hasPush ? "Desativadas" : `Ativas · ${Number(c.lead) ? `${c.lead} min antes` : "na hora"}`; } },
  { id: "lembretes", ic: "clock", t: "Lembretes", r: (c) => { const n = (c.reminders || []).length; return n ? `${n} lembrete${n > 1 ? "s" : ""}` : "Nenhum ainda"; } },
  { id: "agua", ic: "droplet", t: "Água", r: () => "Lembrete de água e horários" },
  { id: "tratamento", ic: "pill", t: "Tratamento", r: () => tratamentoDe(S.pessoa)?.nome || "Nenhum cadastrado" },
  { grupo: true },
  { id: "plano", ic: "calendar-days", t: "Plano do mês", r: () => (S.planoInfo ? `${S.planoInfo.title} · até ${ddmm(S.planoInfo.to)}` : "Nenhum plano ainda") },
  { id: "claude", ic: "sparkles", t: "Claude", r: () => "Conector para montar o plano e analisar" },
  { grupo: true },
  { id: "familia", ic: "house", t: "Família e treino", r: () => "Aparelhos · Pulse" },
  { id: "seguranca", ic: "lock", t: "Segurança", r: () => (temDigital() ? "Digital ativa" : `Senha · trava após ${LS.get("app_idle_h", 4)} h sem uso`) },
  { id: "app", ic: "info", t: "App", r: () => `Versão ${VERSAO}` },
];
const TITULOS = { celular: "Este celular", ...Object.fromEntries(SECOES.filter((s) => s.id).map((s) => [s.id, s.t])) };

export function render() {
  const c = S.cfg || {};
  if (secao) return `<div class="page ajustes">${topo(TITULOS[secao], "Ajustes")}<button class="btn txt voltar-aj" data-act="aj-menu">${icon("chevron-left", "sm")}Ajustes</button>${PAGINAS[secao](c)}</div>`;
  const vp = c.viewPerson;
  const p = permissao();
  const alerta = p === "default" || (p === "granted" && !c.hasPush) ? `<div class="glass card aviso-dia alerta lado-a-lado"><span><b>Notificações desligadas.</b> Sem elas, os horários das refeições não chegam neste celular.</span><button class="btn cta" data-act="aj-ativar">Ativar</button></div>` : "";
  let html = `<button class="glass card perfil" data-act="aj-sec" data-s="celular"><span class="av" style="--pc:${vp ? cor(vp) : "var(--fg3)"}">${esc((vp ? nomeP(vp) : "?")[0])}</span>
    <span class="grow"><b>${esc(c.name || "Este celular")}</b><div class="sub">${(c.persons || []).length ? `Avisa ${esc((c.persons || []).map(nomeP).join(", "))}` : "Escolha de quem são os avisos"}${vp ? ` · abre em ${esc(nomeP(vp))}` : ""}</div></span>${icon("chevron-right")}</button>${alerta}<div class="rows">`;
  for (const s of SECOES) {
    if (s.grupo) { html += `</div><div class="rows" style="margin-top:.75rem">`; continue; }
    html += `<button class="row" data-act="aj-sec" data-s="${s.id}">${icon(s.ic)}<span class="grow"><div>${s.t}</div><div class="sub">${esc(s.r(c))}</div></span>${icon("chevron-right")}</button>`;
  }
  return `<div class="page ajustes">${topo("Ajustes", esc(c.name || "Este celular"))}${html}</div>
    <p class="muted" style="text-align:center;margin-top:1.5rem">Mesa ${esc(VERSAO)} · feita para Rafael, Marina e Theo</p></div>`;
}

/** Abre os Ajustes numa página (ex.: "celular" no primeiro uso). */
export function abrirAjustes(s = null) { secao = s; location.hash = "ajustes"; rerender(); }

export const acts = {
  "aj-sec": (b) => { secao = b.dataset.s; rerender(); scrollTo(0, 0); },
  "aj-menu": () => { secao = null; editando = false; rerender(); },
  "aj-ativar": async () => { toast(await ativarPush()); proximos = null; rerender(); },
  "aj-testar": async (b) => { b.disabled = true; try { await testarAviso(); toast("Enviado — chega em segundos"); } catch (e) { toast("Falhou: " + e.message); } b.disabled = false; },
  "aj-pessoa": (b) => {
    const c = S.cfg || {}, set = new Set(c.persons || []);
    set.has(b.dataset.p) ? set.delete(b.dataset.p) : set.add(b.dataset.p);
    const patch = { persons: [...set] };
    if (!c.viewPerson) { patch.viewPerson = b.dataset.p; S.pessoa = b.dataset.p; }
    if (!c.name || c.name === "Celular") patch.name = `Celular · ${nomeP(b.dataset.p)}`;
    salvar(patch);
  },
  "aj-ver": (b) => { S.pessoa = b.dataset.p; salvar({ viewPerson: b.dataset.p }); },
  "aj-dia": (b) => { b.classList.toggle("on"); b.setAttribute("aria-pressed", b.classList.contains("on")); },
  "aj-preset": (b) => salvar({ reminders: [...(S.cfg?.reminders || []), { id: Math.random().toString(36).slice(2, 10), ...PRESETS[+b.dataset.i] }] }),
  "aj-rem-del": (b) => salvar({ reminders: (S.cfg?.reminders || []).filter((r) => r.id !== b.dataset.id) }),
  "ver-plano": (b) => { dispatchEvent(new CustomEvent("plano:ver", { detail: { id: b.dataset.id } })); },
  "aj-apagar-plano": async (b) => {
    if (!confirm("Apagar este plano do histórico? Os lembretes dele também somem.")) return;
    try { await api(`/api/plan/${b.dataset.id}`, { method: "DELETE" }); dispatchEvent(new CustomEvent("plano:trocar", { detail: { refresh: true } })); toast("Apagado"); }
    catch (e) { toast(e.message); }
  },
  "aj-voltar-plano": async (b) => {
    if (!confirm("Voltar a usar este plano? Ele é publicado de novo como o mais novo e os outros celulares são avisados.")) return;
    try { await api(`/api/plan/${b.dataset.id}/voltar`, { method: "POST", body: JSON.stringify({ deviceId: S.deviceId }) }); dispatchEvent(new CustomEvent("plano:trocar", { detail: { refresh: true } })); toast("Plano de volta no ar"); }
    catch (e) { toast(e.message); }
  },
  "aj-mcp": async () => { try { mcpUrl = await enderecoClaude(); rerender(); } catch (e) { toast(e.message); } },
  "aj-mcp-novo": async () => {
    if (!confirm("Gerar um endereço novo? O antigo para de funcionar e você precisa trocar no Claude.")) return;
    try { mcpUrl = await enderecoClaude(true); rerender(); toast("Endereço novo gerado"); } catch (e) { toast(e.message); }
  },
  "aj-mcp-copiar": async () => { try { await navigator.clipboard.writeText(mcpUrl); toast("Copiado"); } catch (e) { toast("Segure no endereço para copiar"); } },
  "aj-digital-ativar": async () => { try { await cadastrarDigital(); toast("Digital ativada neste celular"); } catch (e) { toast(e.name === "NotAllowedError" ? "Cancelado" : "Não deu: " + e.message); } rerender(); },
  "aj-digital-remover": async () => {
    if (!confirm("Remover a digital deste celular? Depois de horas sem uso, a Mesa vai pedir a senha.")) return;
    try { await removerDigital(); toast("Digital removida"); } catch (e) { toast(e.message); }
    rerender();
  },
  "aj-sair": async () => { if (confirm("Sair deste celular? Ele para de receber notificações.")) await sair(); },
  "aj-instalar": async () => { instalar.prompt(); await instalar.userChoice.catch(() => {}); instalar = null; rerender(); },
  "aj-recarregar": () => location.reload(),
  novidades: () => abrirNovidades(NOVIDADES.slice(0, 8)),
  "trat-novo": () => { editando = true; rerender(); },
  "trat-editar": () => { editando = true; rerender(); },
  "trat-cancelar": () => { editando = false; rerender(); },
  "trat-encerrar": async () => {
    if (!confirm("Encerrar e apagar o cadastro do tratamento? As doses já anotadas continuam no histórico.")) return;
    try { await api(`/api/tratamento/${encodeURIComponent(S.pessoa)}`, { method: "DELETE" }); guardarTrat(S.pessoa, null); rerender(); }
    catch (e) { toast("Não consegui apagar (sem internet?)"); }
  },
  "trat-salvar": async () => {
    const f = document.querySelector("[data-trat]");
    const n = f.querySelectorAll("[name^=dose]").length;
    if ([...Array(n).keys()].some((i) => f[`dose${i}`].value.trim() && f[`quando${i}`].value === "horario" && !f[`hora${i}`].value)) return toast("Falta o horário de uma dose");
    const doses = [...Array(n).keys()].map((i) => {
      const nome = f[`dose${i}`].value.trim(), q = f[`quando${i}`].value;
      // id fica com a dose enquanto ela não muda de nome; dose nova ou renomeada ganha id novo (o histórico de "tomei" não troca de suplemento)
      const idAntigo = f[`id${i}`].value, mesmo = idAntigo && f[`id${i}`].dataset.nome === nome;
      return nome ? { id: mesmo ? idAntigo : `${Date.now().toString(36)}${i}`, nome, quando: q === "horario" ? f[`hora${i}`].value : q } : null;
    }).filter(Boolean);
    try {
      guardarTrat(S.pessoa, await api(`/api/tratamento/${encodeURIComponent(S.pessoa)}`, { method: "PUT", body: JSON.stringify({ nome: f.nome.value, inicio: f.inicio.value, dias: +f.dias.value, doses, fim: tratamentoDe(S.pessoa)?.fim || null }) }));
      editando = false;
      rerender();
      toast("Tratamento salvo");
    } catch (e) { toast(e.message || "Não consegui salvar"); }
  },
  "fechar-folha": () => fecharFolha(),
};

export const forms = {
  lembrete: (f) => {
    const text = f.texto.value.trim();
    const days = [...document.querySelectorAll("#remDias .chip.on")].map((x) => +x.dataset.d);
    if (!text) return toast("Escreva o lembrete");
    if (!days.length) return toast("Escolha ao menos um dia");
    salvar({ reminders: [...(S.cfg?.reminders || []), { id: Math.random().toString(36).slice(2, 10), text: text.slice(0, 120), time: f.hora.value || "08:00", days }] });
  },
};

function abrirNovidades(entradas) {
  abrirFolha(`<h2 class="h2">Novidades da Mesa</h2><p class="muted">versão ${esc(VERSAO)}</p>
    ${entradas.map((n) => `<div class="sec" style="margin-top:1rem"><span>${esc(n.versao)} · ${esc(n.titulo)}</span><span>${n.data.slice(8, 10)}/${n.data.slice(5, 7)}</span></div>
      <div class="regras">${n.itens.map((t) => `<div class="glass card">${esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</div>`).join("")}</div>`).join("")}
    <div class="foot"><button class="btn cta" data-act="fechar-folha">Entendi</button></div>`);
}

/** Novidades: abre uma vez por versão (aparelho que nunca viu nenhuma só guarda a versão). */
export function mostrarNovidades() {
  const visto = LS.get("app_versao_vista", null);
  LS.set("app_versao_vista", VERSAO);
  if (!visto || visto === VERSAO) return;
  const novas = novasDesde(visto);
  if (novas.length) abrirNovidades(novas);
}
