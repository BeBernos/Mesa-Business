import { S, rerender } from "../state.js";
import { DIAS_SEMANA, DIAS_LONGOS, ddmm } from "../plan.js";
import { esc, icon, openSheet, closeSheet, toast, entrarSub } from "../ui.js";
import { api, LS, log } from "../sync.js";
import { abrirAtualizar } from "./atualizar.js";
import { VERSAO } from "./novidades.js";
import { temDigital, digitalDisponivel, cadastrarDigital, removerDigital } from "./bloqueio.js";

const PRESETS = [
  { text: "Montar a marmita de amanhã", time: "21:30", days: [1, 2] },
  { text: "Preparo em lote da semana", time: "09:00", days: [0] },
  { text: "Conferir a lista de compras", time: "09:00", days: [6] },
  { text: "Pesar em jejum", time: "07:00", days: [6] },
  { text: "Beber água", time: "15:00", days: [0, 1, 2, 3, 4, 5, 6] },
];
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const hhmm = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: S.tz });
const diaDe = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: S.tz });
const pessoasPlano = () => S.plano?.pessoas || [{ id: "rafael", nome: "Rafael" }, { id: "marina", nome: "Marina" }, { id: "theo", nome: "Theo" }];
const corP = (id) => (["rafael", "marina", "theo"].includes(id) ? `var(--${id})` : "var(--ac)");

// ---------- aparelho ----------
export async function putDevice(patch = {}) {
  const body = { ...(S.cfg || {}), ...patch };
  delete body.hasPush;
  delete body.sub;
  if (patch.sub) body.sub = patch.sub;
  const saved = await api(`/api/devices/${S.deviceId}`, { method: "PUT", body: JSON.stringify(body) });
  S.cfg = saved;
  LS.set("app_cfg", saved);
  return saved;
}

let saveTimer;
function salvar(patch, refazer = true) {
  S.cfg = { ...(S.cfg || {}), ...patch };
  LS.set("app_cfg", S.cfg);
  if (refazer) pintar();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await putDevice(); carregarProximos(); rerender(); } catch (e) { toast("Não salvou: " + e.message); }
  }, 450);
}

// ---------- push ----------
export const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function garantirInscricao(forcar = false) {
  if (!pushSuportado() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api("/api/vapid");
  let sub = await reg.pushManager.getSubscription();
  if (sub && sub.options?.applicationServerKey && b64u(sub.options.applicationServerKey) !== publicKey) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey) });
  const j = sub.toJSON();
  if (forcar || LS.get("app_endpoint", "") !== j.endpoint || !S.cfg?.hasPush) {
    await putDevice({ sub: j });
    LS.set("app_endpoint", j.endpoint);
  }
}

async function ativarPush() {
  if (!pushSuportado()) return toast("Este navegador não suporta notificações. Abra no Chrome.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { pintar(); return toast("Sem permissão para notificar"); }
  try { await garantirInscricao(true); toast("Notificações ativadas 🔔"); } catch (e) { toast("Falhou: " + e.message); }
  pintar();
  carregarProximos();
  rerender();
}

async function carregarProximos() {
  try { S.upcoming = await api(`/api/devices/${S.deviceId}/upcoming`); } catch (e) { S.upcoming = null; }
  const el = document.getElementById("proximos");
  if (el) el.innerHTML = proximosHtml();
}

function proximosHtml() {
  const u = S.upcoming;
  if (!u) return `<div class="row"><span class="faint">—</span></div>`;
  if (!u.length) return `<div class="row"><span class="muted" style="font-size:13.5px">Nada agendado nas próximas 48h. Escolha de quem são os avisos acima.</span></div>`;
  const h = diaDe(Date.now());
  return u.map((e) => {
    const d = diaDe(e.at);
    return `<div class="row"><span class="num" style="color:var(--ac-ink);font-weight:650;font-size:13.5px;min-width:64px">${d === h ? "" : DIAS_SEMANA[new Date(d + "T12:00").getDay()] + " "}${hhmm(e.at)}</span><span class="grow ellipsis" style="font-size:14px">${esc(e.title)}</span></div>`;
  }).join("");
}

// ---------- tela: menu por assunto (resumo em cada linha) + uma página por assunto ----------
const sw = (field, on) => `<label class="switch"><input type="checkbox" data-field="${field}" ${on ? "checked" : ""}><span></span></label>`;
const permissao = () => (pushSuportado() ? Notification.permission : "unsupported");
const nomeP = (id) => pessoasPlano().find((x) => x.id === id)?.nome || id;
const TEMAS = { auto: "Automático", light: "Claro", dark: "Escuro" };
let secao = null; // null = menu

const SECOES = [
  { id: "avisos", ic: "bell", tom: "--rafael", t: "Notificações", r: (c) => {
    const p = permissao();
    if (p === "unsupported" || p === "denied") return "Bloqueadas neste celular";
    if (!c.hasPush) return "Desativadas";
    return `Ativas · ${Number(c.lead) ? `${c.lead} min antes` : "na hora"}${c.proativo !== false ? " · perguntas da Mesa" : ""}`;
  } },
  { id: "lembretes", ic: "clock", tom: "--warn", t: "Lembretes", r: (c) => { const n = (c.reminders || []).length; return n ? `${n} lembrete${n > 1 ? "s" : ""}` : "Nenhum ainda"; } },
  { grupo: true },
  { id: "plano", ic: "calendar-days", tom: "--marina", t: "Plano do mês", r: () => S.planoInfo ? `${S.planoInfo.title} · até ${ddmm(S.planoInfo.to)}` : "Nenhum plano ainda" },
  { id: "claude", ic: "sparkles", tom: "--fat", t: "Claude", r: () => "Conector para montar o plano do mês" },
  { grupo: true },
  { id: "familia", ic: "house", tom: "--theo", t: "Família e treino", r: () => `${S.devices ? `${S.devices.length} aparelho${S.devices.length === 1 ? "" : "s"}` : "Aparelhos"} · Pulse` },
  { id: "seguranca", ic: "lock", tom: "--ok", t: "Segurança", r: () => temDigital() ? "Digital ativa" : `Senha · trava após ${LS.get("app_idle_h", 4)} h sem uso` },
  { id: "aparencia", ic: "moon", tom: "--text-2", t: "Aparência", r: () => TEMAS[S.theme] || "Automático" },
  { id: "app", ic: "info", tom: "--text-2", t: "App", r: () => `Versão ${VERSAO}` },
];

function menu() {
  const c = S.cfg || {};
  const vp = c.viewPerson;
  const p = permissao();
  const alerta = p === "default" || (p === "granted" && !c.hasPush)
    ? `<div class="note alerta" style="margin-top:12px">${icon("bell")}<div style="flex:1"><div class="t">Notificações desligadas</div>Sem elas, os horários das refeições não chegam neste celular.</div><button class="btn sm primary" data-act="aj-ativar">Ativar</button></div>` : "";
  let html = `<button class="card tap aj-perfil" data-act="aj-sec" data-s="celular">
      <span class="av" style="--pc:${vp ? corP(vp) : "var(--text-3)"}">${esc((vp ? nomeP(vp) : "?")[0])}</span>
      <span class="grow"><div class="ttl">${esc(c.name || "Este celular")}</div>
        <div class="sub">${(c.persons || []).length ? `Avisa ${esc((c.persons || []).map(nomeP).join(", "))}` : "Escolha de quem são os avisos"}${vp ? ` · abre em ${esc(nomeP(vp))}` : ""}</div></span>${icon("chevron-right")}</button>${alerta}<div class="rows aj-menu">`;
  for (const s of SECOES) {
    if (s.grupo) { html += `</div><div class="rows aj-menu">`; continue; }
    html += `<button class="row" data-act="aj-sec" data-s="${s.id}"><span class="ico" style="--t:var(${s.tom})">${icon(s.ic)}</span>
      <span class="grow"><div class="ttl">${s.t}</div><div class="sub ellipsis">${esc(s.r(c))}</div></span>${icon("chevron-right")}</button>`;
  }
  return `${html}</div>
  <div class="brand-foot"><img src="/img/logo.svg" alt=""><b>Mesa · versão ${VERSAO}</b><span><span class="marca"><i></i><i></i><i></i></span>feito para Rafael, Marina e Theo</span></div><div class="gap-l"></div>`;
}

const PAGINAS = {
  celular: (c) => {
    const ps = pessoasPlano();
    return `<div class="card">
    <label class="field"><span>Nome</span><input class="input" data-field="name" value="${esc(c.name || "")}" maxlength="40" placeholder="Ex.: celular do Rafael"></label>
    <div class="gap-m"></div><div class="field"><span>Avisar as refeições de</span>
      <div class="chips">${ps.map((p) => `<button class="chip pc ${(c.persons || []).includes(p.id) ? "on" : ""}" style="--pc:${corP(p.id)}" data-act="aj-pessoa" data-p="${esc(p.id)}">${esc(p.nome)}</button>`).join("")}</div></div>
    <div class="gap-m"></div><div class="field"><span>Abrir o app em</span>
      <div class="chips">${ps.map((p) => `<button class="chip pc ${c.viewPerson === p.id ? "on" : ""}" style="--pc:${corP(p.id)}" data-act="aj-ver" data-p="${esc(p.id)}">${esc(p.nome)}</button>`).join("")}</div></div>
    </div><p class="faint" style="font-size:12.5px;margin:10px 4px 0">As perguntas da Mesa vão para a pessoa em que o app abre.</p>`;
  },
  avisos: (c) => {
    const perm = permissao();
    const standalone = matchMedia("(display-mode: standalone)").matches;
    const status = perm === "unsupported" ? `<div class="note alerta">${icon("triangle-alert")}<div>Este navegador não suporta notificações. No Samsung, abra pelo <b>Chrome</b>.</div></div>`
      : perm === "denied" ? `<div class="note alerta">${icon("triangle-alert")}<div>Notificações <b>bloqueadas</b>. Libere em Configurações → Apps → ${standalone ? "Mesa" : "Chrome"} → Notificações.</div></div>`
      : c.hasPush ? `<div class="row"><span class="ico ac">${icon("bell")}</span><span class="grow"><div class="ttl">Notificações ativas</div><div class="sub">Neste celular</div></span><button class="btn sm" data-act="aj-testar">Testar</button></div>`
      : `<div class="row"><span class="ico">${icon("bell")}</span><span class="grow"><div class="ttl">Desativadas</div><div class="sub">Ative para receber os horários</div></span><button class="btn sm primary" data-act="aj-ativar">Ativar</button></div>`;
    return `<div class="rows">
    ${status}
    <div class="row"><span class="grow"><div class="ttl">Horário das refeições</div><div class="sub">Com o que comer e as quantidades. Não avisa o que já foi marcado.</div></span>${sw("meals", c.meals !== false)}</div>
    <div class="row"><span class="grow ttl">Avisar</span><select class="input" data-field="lead" style="width:auto;height:40px">${[0, 5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${Number(c.lead || 0) === m ? "selected" : ""}>${m ? `${m} min antes` : "na hora"}</option>`).join("")}</select></div>
    <div class="row"><span class="grow"><div class="ttl">Resumo do dia</div><div class="sub">Um aviso de manhã com o dia todo</div></span>
      ${c.summary?.on ? `<input class="input" type="time" data-field="summaryTime" value="${esc(c.summary.time || "06:30")}" style="width:auto;height:40px">` : ""}${sw("summaryOn", c.summary?.on)}</div>
    <div class="row"><span class="grow"><div class="ttl">Perguntas da Mesa</div><div class="sub">Quando falta algo, a Mesa pergunta como você está — dá para responder na própria notificação (no máximo 2 por dia)</div></span>${sw("proativo", c.proativo !== false)}</div>
    <div class="row"><span class="grow"><div class="ttl">Plano novo</div><div class="sub">Avisa quando alguém atualiza o plano</div></span>${sw("updates", c.updates !== false)}</div>
    <div class="row"><span class="grow"><div class="ttl">Eu atualizo o plano</div><div class="sub">Lembra 3 dias e 1 dia antes do fim</div></span>${sw("uploader", !!c.uploader)}</div>
  </div>
  <div class="section-title"><h2>Próximos avisos</h2></div>
  <div class="rows" id="proximos">${proximosHtml()}</div>
  <details class="fold" style="margin-top:12px"><summary>${icon("smartphone", "sm")}<span>Samsung: aviso atrasando?</span>${icon("chevron-down", "chev")}</summary>
    <div class="md"><p>A One UI “adormece” apps para poupar bateria. Uma vez em cada celular:</p>
    <p><b>1.</b> Configurações → Bateria → Limites de uso em segundo plano → <b>Apps que nunca dormem</b> → adicione o <b>Chrome</b>.<br><b>2.</b> Configurações → Apps → Chrome → Bateria → <b>Sem restrições</b>.</p></div></details>`;
  },
  lembretes: (c) => `<div class="rows">${(c.reminders || []).map((r) => `<div class="row"><span class="num" style="font-weight:650;color:var(--ac-ink);min-width:48px">${esc(r.time)}</span>
      <span class="grow"><div class="ttl ellipsis">${esc(r.text)}</div><div class="sub">${r.days.length === 7 ? "todo dia" : r.days.map((d) => DIAS_SEMANA[d]).join(" · ")}</div></span>
      <button class="icon-btn" data-act="aj-rem-del" data-id="${esc(r.id)}" aria-label="Remover lembrete">${icon("trash-2", "sm")}</button></div>`).join("")}
    <form class="row" data-form="lembrete" style="flex-wrap:wrap;gap:10px">
      <input class="input" name="texto" placeholder="Novo lembrete (ex.: tomar creatina)" style="height:44px" aria-label="Texto do lembrete">
      <div style="display:flex;gap:8px;align-items:center;width:100%;flex-wrap:wrap"><input class="input" type="time" name="hora" value="08:00" style="width:auto;height:40px" aria-label="Horário">
        <div class="chips" style="gap:4px" id="remDias">${DIAS_SEMANA.map((d, i) => `<button type="button" class="chip small on" data-act="aj-dia" data-d="${i}" style="padding:0 8px" aria-label="${DIAS_LONGOS[i]}">${d.slice(0, 1)}</button>`).join("")}</div>
        <button class="btn sm primary" type="submit" style="margin-left:auto" aria-label="Adicionar lembrete">${icon("plus")}</button></div></form>
  </div>
  <div class="section-title"><h2>Sugestões</h2></div>
  <div class="chips">${PRESETS.filter((p) => !(c.reminders || []).some((r) => r.text === p.text)).map((p) => `<button class="chip small" data-act="aj-preset" data-i="${PRESETS.indexOf(p)}">+ ${esc(p.text)}</button>`).join("")}</div>`,
  plano: () => {
    const hist = S.meta?.history || [];
    const atual = S.planoInfo;
    return `<div class="card">
    ${atual ? `<div class="h3">${esc(atual.title)}</div><div class="muted" style="font-size:13px;margin-top:3px">${ddmm(atual.from)} a ${ddmm(atual.to)} · enviado ${new Date(atual.uploadedAt).toLocaleDateString("pt-BR")}${atual.by ? ` por ${esc(atual.by)}` : ""}</div><div class="gap-m"></div>` : ""}
    <button class="btn primary block" data-act="atualizar">${icon("upload")}Atualizar plano do mês</button>
    <p class="faint" style="font-size:12.5px;margin-top:10px">O jeito mais fácil é pedir ao Claude com o conector (Ajustes → Claude): ele publica direto aqui.</p>
  </div>
  ${hist.length > 1 ? `<div class="section-title"><h2>Histórico</h2></div><div class="rows">${hist.map((h, i) => `<div class="row" style="flex-wrap:wrap"><span class="grow"><div class="ttl ellipsis">${esc(h.title)}${i === 0 ? ` <span class="faint">· o mais novo</span>` : ""}</div>
      <div class="sub">${ddmm(h.from)}–${ddmm(h.to)} · ${h.uploadedAt ? `${new Date(h.uploadedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${new Date(h.uploadedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}${h.by ? ` por ${esc(h.by)}` : ""}${h.kind === "v2" ? "" : " · formato antigo"}</div></span>
      <button class="btn sm" data-act="aj-ver-plano" data-id="${esc(h.id)}">${S.planoInfo?.id === h.id ? "Aberto" : "Ver"}</button>
      ${i > 0 && h.kind === "v2" ? `<button class="btn sm" data-act="aj-voltar-plano" data-id="${esc(h.id)}" aria-label="Voltar a usar ${esc(h.title)}">${icon("rotate-ccw", "sm")}Voltar a este</button>` : ""}
      <button class="icon-btn" data-act="aj-apagar-plano" data-id="${esc(h.id)}" aria-label="Apagar plano">${icon("trash-2", "sm")}</button></div>`).join("")}</div>` : ""}`;
  },
  claude: () => `<div class="card">
    <div class="h3">Conectar a Mesa ao Claude</div>
    <p class="muted" style="font-size:13.5px;line-height:1.55;margin-top:6px">Com o conector, você pede no Claude “monte a dieta do mês que vem” e ele lê o feedback, o peso e o que foi comido, monta o plano e publica aqui — usando a sua assinatura, sem custo extra.</p>
    ${S.mcpUrl ? `<div class="input" style="height:auto;padding:12px 14px;margin-top:12px;font-size:12.5px;word-break:break-all;font-family:ui-monospace,Menlo,monospace">${esc(S.mcpUrl)}</div>
      <div class="fab-row" style="margin-top:10px"><button class="btn sm primary" data-act="aj-mcp-copiar">${icon("clipboard-paste", "sm")}Copiar endereço</button><button class="btn sm" data-act="aj-mcp-novo">Gerar outro</button></div>
      <div class="md" style="font-size:13.5px;margin-top:12px"><p><b>1.</b> No claude.ai: Configurações → Conectores → <b>Adicionar conector personalizado</b>.<br><b>2.</b> Nome: Mesa · URL: cole o endereço → Adicionar.<br><b>3.</b> Numa conversa nova, ligue o conector Mesa e peça o plano.</p>
      <p>O endereço é uma chave: não compartilhe. “Gerar outro” desliga o antigo.</p></div>`
      : `<button class="btn block" style="margin-top:12px" data-act="aj-mcp">${icon("sparkles")}Mostrar o endereço do conector</button>`}
  </div>`,
  familia: () => `<div class="rows">${(S.devices || []).map((d) => `<div class="row"><span class="ico">${icon("smartphone", "sm")}</span><span class="grow"><div class="ttl">${esc(d.name)}${d.id === S.deviceId ? ` <span class="faint">· este</span>` : ""}</div>
      <div class="sub">${d.persons.map((p) => esc(nomeP(p))).join(", ") || "sem pessoas"} · ${d.hasPush ? "avisos ativos" : "sem avisos"}</div></span></div>`).join("") || `<div class="row faint">carregando…</div>`}</div>
  <div class="section-title"><h2>Treino</h2></div>
  <div class="rows">
    <a class="row" href="https://pulse.example.workers.dev/" target="_blank" rel="noopener"><span class="ico ac">${icon("dumbbell")}</span><span class="grow"><div class="ttl">Abrir o Pulse</div><div class="sub">O app de treino. O peso registrado lá aparece aqui, e o treino feito responde o “Treinou hoje?”.</div></span>${icon("chevron-right")}</a>
  </div>`,
  seguranca: () => `<div class="rows">
    ${temDigital() ? `<div class="row"><span class="ico ac">${icon("smartphone")}</span><span class="grow"><div class="ttl">Digital ativa</div><div class="sub">Destrava a Mesa neste celular</div></span><button class="btn sm" data-act="aj-digital-remover">Remover</button></div>`
      : S.digitalOk ? `<div class="row"><span class="ico">${icon("smartphone")}</span><span class="grow"><div class="ttl">Desbloquear com a digital</div><div class="sub">Em vez de digitar a senha</div></span><button class="btn sm primary" data-act="aj-digital-ativar">Ativar</button></div>`
      : `<div class="row"><span class="ico">${icon("smartphone")}</span><span class="grow"><div class="ttl">Digital indisponível</div><div class="sub">Este navegador não oferece digital para apps da web — vale a senha</div></span></div>`}
    <div class="row"><span class="grow sub" style="margin:0">A Mesa trava depois de ${LS.get("app_idle_h", 4)} horas sem uso. Notificações (Comi, Adiar) continuam funcionando.</span></div>
  </div>
  <div class="rows" style="margin-top:12px"><button class="row" data-act="aj-sair"><span class="ico" style="color:var(--bad)">${icon("log-out")}</span><span class="grow ttl" style="color:var(--bad)">Sair deste celular</span></button></div>`,
  aparencia: () => `<div class="rows">${Object.entries(TEMAS).map(([k, l]) => `<button class="row" data-act="aj-tema" data-t="${k}" aria-pressed="${S.theme === k}">
      <span class="box" style="${S.theme === k ? "background:var(--ac);box-shadow:none;color:#fff" : ""}">${icon("check")}</span><span class="grow ttl">${l}</span>
      <span class="faint" style="font-size:12.5px">${k === "auto" ? "segue o celular" : ""}</span></button>`).join("")}</div>`,
  app: () => {
    const standalone = matchMedia("(display-mode: standalone)").matches;
    return `<div class="rows">
    ${standalone ? `<div class="row"><span class="ico ac">${icon("circle-check")}</span><span class="grow ttl">Instalado na tela inicial</span></div>`
      : S.installPrompt ? `<button class="row" data-act="aj-instalar"><span class="ico ac">${icon("smartphone")}</span><span class="grow ttl">Instalar na tela inicial</span>${icon("chevron-right")}</button>`
      : `<div class="row"><span class="ico">${icon("smartphone")}</span><span class="grow"><div class="ttl">Instalar</div><div class="sub">Chrome → ⋮ → Adicionar à tela inicial</div></span></div>`}
    <button class="row" data-act="novidades"><span class="ico ac">${icon("sparkles")}</span><span class="grow"><div class="ttl">Novidades</div><div class="sub">Versão ${VERSAO}</div></span>${icon("chevron-right")}</button>
    <button class="row" data-act="aj-recarregar"><span class="ico">${icon("refresh-cw")}</span><span class="grow ttl">Recarregar</span></button>
  </div>
  <div class="brand-foot"><img src="/img/logo.svg" alt=""><b>Mesa · versão ${VERSAO}</b><span><span class="marca"><i></i><i></i><i></i></span>feito para Rafael, Marina e Theo</span></div>`;
  },
};

function cabecalho() {
  const s = secao && (SECOES.find((x) => x.id === secao) || { t: "Este celular" });
  return s ? `<button class="icon-btn" data-act="aj-voltar" aria-label="Voltar para Ajustes">${icon("chevron-left", "lg")}</button><div class="h2 grow" style="font-size:20px">${s.t}</div><button class="icon-btn" data-act="close-sheet" aria-label="Fechar">${icon("x")}</button>`
    : `<div class="h1 grow" style="font-size:24px">Ajustes</div><button class="icon-btn" data-act="close-sheet" aria-label="Fechar">${icon("x")}</button>`;
}

function pintar(topo = false) {
  const sb = document.getElementById("ajustes-sb");
  if (!sb) return;
  const y = sb.scrollTop;
  document.getElementById("ajustes-sh").innerHTML = cabecalho();
  sb.innerHTML = secao ? `<div class="gap-s"></div>${PAGINAS[secao](S.cfg || {})}<div class="gap-l"></div>` : menu();
  sb.scrollTop = topo ? 0 : y;
}

function irPara(s) {
  if (s && !secao) entrarSub(); // o "voltar" do Android volta ao menu
  secao = s;
  pintar(true);
  if (s === "avisos") carregarProximos();
}

export function abrirAjustes(inicio = null) {
  secao = null;
  openSheet(`<div class="sh" id="ajustes-sh"></div><div class="sb" id="ajustes-sb"></div>`, { full: true, voltar: () => { secao = null; pintar(true); } });
  pintar();
  if (inicio) irPara(inicio);
  const sb = document.getElementById("ajustes-sb");
  sb.addEventListener("change", (e) => {
    const f = e.target.dataset.field;
    if (!f) return;
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    const c = S.cfg || {};
    if (f === "summaryOn") salvar({ summary: { ...(c.summary || { time: "06:30" }), on: v } });
    else if (f === "summaryTime") salvar({ summary: { ...(c.summary || {}), on: true, time: v } }, false);
    else if (f === "lead") salvar({ lead: Number(v) }, false);
    else salvar({ [f]: v }, f !== "name");
  });
  carregarProximos();
  digitalDisponivel().then((v) => { S.digitalOk = v; pintar(); });
  api("/api/devices").then((d) => { S.devices = d; pintar(); }).catch(() => {});
}

export const acts = {
  ajustes: () => abrirAjustes(),
  "aj-sec": (b) => irPara(b.dataset.s),
  "aj-voltar": () => history.back(),
  atualizar: () => abrirAtualizar(),
  "aj-ativar": () => ativarPush(),
  "aj-testar": async (b) => {
    b.disabled = true;
    try { await api(`/api/devices/${S.deviceId}/test`, { method: "POST" }); toast("Enviado — chega em segundos"); } catch (e) { toast("Falhou: " + e.message); }
    b.disabled = false;
  },
  "aj-pessoa": (b) => {
    const c = S.cfg || {};
    const set = new Set(c.persons || []);
    set.has(b.dataset.p) ? set.delete(b.dataset.p) : set.add(b.dataset.p);
    const patch = { persons: [...set] };
    if (!c.viewPerson) { patch.viewPerson = b.dataset.p; S.pessoa = b.dataset.p; rerender(); }
    if (!c.name || c.name === "Celular") patch.name = `Celular · ${pessoasPlano().find((p) => p.id === b.dataset.p)?.nome || b.dataset.p}`;
    salvar(patch);
  },
  "aj-ver": (b) => { salvar({ viewPerson: b.dataset.p }); S.pessoa = b.dataset.p; rerender(); },
  "aj-dia": (b) => b.classList.toggle("on"),
  "aj-preset": (b) => { const p = PRESETS[+b.dataset.i]; salvar({ reminders: [...(S.cfg?.reminders || []), { id: Math.random().toString(36).slice(2, 10), ...p }] }); },
  "aj-rem-del": (b) => salvar({ reminders: (S.cfg?.reminders || []).filter((r) => r.id !== b.dataset.id) }),
  "aj-tema": (b) => { S.theme = b.dataset.t; LS.set("app_theme", S.theme); aplicarTema(); pintar(); },
  "aj-ver-plano": (b) => { S.viewing = b.dataset.id; closeSheet(); window.dispatchEvent(new CustomEvent("plano:trocar")); },
  "aj-apagar-plano": async (b) => {
    if (!confirm("Apagar este plano do histórico? Os lembretes dele também somem.")) return;
    try { await api(`/api/plan/${b.dataset.id}`, { method: "DELETE" }); if (S.viewing === b.dataset.id) S.viewing = null; window.dispatchEvent(new CustomEvent("plano:trocar", { detail: { refresh: true } })); toast("Apagado"); setTimeout(pintar, 600); }
    catch (e) { toast(e.message); }
  },
  "aj-voltar-plano": async (b) => {
    if (!confirm("Voltar a usar este plano? Ele é publicado de novo como o mais novo e os outros celulares são avisados.")) return;
    try {
      await api(`/api/plan/${b.dataset.id}/voltar`, { method: "POST", body: JSON.stringify({ deviceId: S.deviceId }) });
      S.viewing = null;
      window.dispatchEvent(new CustomEvent("plano:trocar", { detail: { refresh: true } }));
      toast("Plano de volta no ar");
      setTimeout(pintar, 600);
    } catch (e) { toast(e.message); }
  },
  "aj-instalar": async () => { S.installPrompt.prompt(); await S.installPrompt.userChoice.catch(() => {}); S.installPrompt = null; pintar(); },
  "aj-recarregar": () => location.reload(),
  "aj-mcp": async () => { try { S.mcpUrl = (await api("/api/mcp")).url; pintar(); } catch (e) { toast(e.message); } },
  "aj-mcp-novo": async () => {
    if (!confirm("Gerar um endereço novo? O antigo para de funcionar e você precisa trocar no Claude.")) return;
    try { S.mcpUrl = (await api("/api/mcp", { method: "POST" })).url; pintar(); toast("Endereço novo gerado"); } catch (e) { toast(e.message); }
  },
  "aj-mcp-copiar": async () => { try { await navigator.clipboard.writeText(S.mcpUrl); toast("Copiado"); } catch (e) { toast("Segure no endereço para copiar"); } },
  "aj-digital-ativar": async () => {
    try { await cadastrarDigital(); toast("Digital ativada neste celular"); } catch (e) { toast(e.name === "NotAllowedError" ? "Cancelado" : "Não deu: " + e.message, 4000); }
    pintar();
  },
  "aj-digital-remover": async () => {
    if (!confirm("Remover a digital deste celular? Depois de horas sem uso, a Mesa vai pedir a senha.")) return;
    try { await removerDigital(); toast("Digital removida"); } catch (e) { toast(e.message); }
    pintar();
  },
  "aj-sair": async () => {
    if (!confirm("Sair deste celular? Ele para de receber notificações.")) return;
    try { await api(`/api/devices/${S.deviceId}`, { method: "DELETE" }); } catch (e) {}
    try { const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); if (s) await s.unsubscribe(); } catch (e) {}
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    ["app_cfg", "app_meta", "app_endpoint", "app_passkey", "app_ativo", "app_plano_norm"].forEach(LS.del);
    log.reset();
    location.replace("/");
  },
};

export const forms = {
  lembrete: (f) => {
    const text = f.texto.value.trim();
    const days = [...document.querySelectorAll("#remDias .chip.on")].map((x) => +x.dataset.d);
    if (!text) return toast("Escreva o lembrete");
    if (!days.length) return toast("Escolha ao menos um dia");
    salvar({ reminders: [...(S.cfg?.reminders || []), { id: Math.random().toString(36).slice(2, 10), text, time: f.hora.value || "08:00", days }] });
  },
};

export function aplicarTema() {
  if (S.theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", S.theme);
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  const forcado = S.theme === "dark" ? "#0B0B0D" : S.theme === "light" ? "#F6F5F1" : null;
  metas.forEach((m) => m.setAttribute("content", forcado || (m.media.includes("dark") ? "#0B0B0D" : "#F6F5F1")));
}
