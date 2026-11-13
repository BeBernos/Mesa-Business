// Mesa — demonstração pública (GitHub Pages). Roda ANTES do app: simula a API do Worker dentro do navegador,
// com uma família fictícia (Rafael, Marina e Theo) e um plano de duas semanas que acompanha a data de hoje.
// Nada sai do navegador: o registro (refeições, água, peso…) fica no localStorage deste aparelho.
import { VERSAO } from "./views/novidades.js";
import { normalizarPlano } from "./plan.js";

const TZ = "America/Sao_Paulo";
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const dia = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString("en-CA", { timeZone: TZ });
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// a demo começa sempre "hoje": um dia novo recomeça o registro
if (LS.get("demo_dia") !== hoje()) {
  for (const k of ["demo_log", "app_log_rows", "app_log_pending", "app_log_since", "app_meta", "app_plano_norm"]) localStorage.removeItem(k);
  LS.set("demo_dia", hoje());
}
LS.set("app_versao_vista", VERSAO);
LS.set("app_ativo", Date.now()); // sem a tela de bloqueio na demo
localStorage.removeItem("app_passkey");

const base = new URL("../", import.meta.url).pathname; // /Mesa-Business/
const device = () => LS.get("app_device_id", "demo-device");
const CFG = () => LS.get("demo_cfg", { id: device(), name: "Celular · Rafael", persons: ["rafael"], viewPerson: "rafael", lead: 10, meals: true, updates: true, proativo: true, summary: { on: false, time: "06:30" }, reminders: [], hasPush: false });

let planoDemo = null;
async function plano() {
  if (planoDemo) return planoDemo;
  const ex = await (await nativeFetch(`${base}demo/exemplo-plano.json`)).json();
  const modelo = ex.dias[0];
  ex.dias = Array.from({ length: 14 }, (_, i) => ({ ...JSON.parse(JSON.stringify(modelo)), data: dia(i - 3), tipo: i % 3 === 2 ? { rafael: "D", marina: "D", theo: "D" } : modelo.tipo }));
  Object.assign(ex, { titulo: "Plano da quinzena (demonstração)", inicio: dia(-3), fim: dia(10) });
  if (ex.testes?.[0]) ex.testes[0].doses[0].data = dia(1);
  return (planoDemo = ex);
}

async function semente() {
  const rows = [];
  // refeições já marcadas: os 3 dias anteriores (um lanche pulado) e o café de hoje
  const { plano: pl } = normalizarPlano(JSON.stringify(await plano()));
  for (const d of pl.dias.filter((x) => x.data < hoje())) {
    (d.refeicoes.rafael || []).forEach((m, i) => { if (!(d.data === dia(-2) && i === 1)) rows.push({ kind: "eaten", day: d.data, person: "rafael", k: m.id, v: "1", deleted: 0, updated: Date.now() - 864e5, by: "demo" }); });
  }
  const cafe = pl.dias.find((x) => x.data === hoje())?.refeicoes.rafael?.[0];
  if (cafe) rows.push({ kind: "eaten", day: hoje(), person: "rafael", k: cafe.id, v: "1", deleted: 0, updated: Date.now() - 3600e3, by: "demo" });
  rows.push({ kind: "water", day: hoje(), person: "rafael", k: "", v: "750", deleted: 0, updated: Date.now() - 3600e3, by: "demo" });
  const add = (kind, day, person, k, v) => rows.push({ kind, day, person, k, v, deleted: 0, updated: Date.now() - 864e5 + rows.length, by: "demo" });
  for (const [n, kg] of [[-21, 85.1], [-14, 84.6], [-10, 84.4], [-7, 84.0], [-3, 83.7], [0, 83.4]]) add("weight", dia(n), "rafael", "", String(kg));
  for (const n of [-3, -2, -1]) { add("water", dia(n), "rafael", "", "2500"); add("feedback", dia(n), "rafael", "dia", JSON.stringify({ energia: 4, fome: 2 + (n & 1), intestino: 4 })); }
  add("symptom", dia(-2), "rafael", "a1", JSON.stringify({ texto: "Gases leves depois do jantar", nivel: "leve", hora: "21:30" }));
  return rows;
}
async function registro() {
  const r = LS.get("demo_log", null);
  if (r) return r;
  LS.set("demo_log", await semente());
  return LS.get("demo_log", []);
}

async function api(path, init = {}) {
  const url = new URL(path, location.href);
  const p = url.pathname.slice(url.pathname.indexOf("/api/") + 4); // /meta, /log…
  const m = (init.method || "GET").toUpperCase();
  const body = init.body ? JSON.parse(init.body) : {};
  if (p === "/session") return json({ ok: true, tz: TZ, idleHours: 4 });
  if (p === "/login" || p === "/logout") return json({ ok: true });
  if (p === "/meta") {
    const pl = await plano();
    return json({ history: [{ id: "demo", kind: "v2", title: pl.titulo, from: pl.inicio, to: pl.fim, uploadedAt: Date.now() - 2 * 864e5, by: "Claude" }], persons: { rafael: "Rafael", marina: "Marina", theo: "Theo" }, today: hoje(), precosCesta: { quando: Date.now() - 864e5, precos: { "peito-de-frango|g": 0.032, "arroz|g": 0.0055, "feijao|g": 0.009, "patinho|g": 0.045, "banana|g": 0.007, "kiwi|g": 0.02, "aveia|g": 0.012 } } });
  }
  if (p.startsWith("/plan/")) return json(await plano());
  if (p === "/log" && m === "GET") return json({ now: Date.now(), rows: await registro() });
  if (p === "/log" && m === "POST") {
    const rows = await registro();
    for (const o of body.ops || []) {
      const i = rows.findIndex((r) => r.kind === o.kind && r.day === o.day && r.person === (o.person || "") && r.k === (o.k || ""));
      const r = { kind: o.kind, day: o.day, person: o.person || "", k: o.k || "", v: o.v ?? null, deleted: o.deleted ? 1 : 0, updated: Date.now(), by: "demo" };
      if (i >= 0) rows[i] = r; else rows.push(r);
    }
    LS.set("demo_log", rows);
    return json({ ok: true, now: Date.now() });
  }
  if (p === "/devices" && m === "GET") return json([{ ...CFG(), id: device() }, { id: "demo-2", name: "Celular · Marina", persons: ["marina", "theo"], hasPush: true }]);
  if (/^\/devices\/[^/]+\/upcoming$/.test(p)) return json([]);
  if (/^\/devices\/[^/]+\/test$/.test(p)) return json({ error: "Na demonstração não há notificações" }, 400);
  if (/^\/devices\/[^/]+$/.test(p)) {
    if (m === "PUT") LS.set("demo_cfg", { ...CFG(), ...body, id: device() });
    return json({ ...CFG(), id: device() });
  }
  if (p === "/mcp") return json({ url: `${location.origin}${base}mcp/endereco-de-demonstracao` });
  if (p === "/vapid" || p.startsWith("/passkey")) return json({ error: "Indisponível na demonstração" }, 400);
  if (p.startsWith("/plan")) return json({ error: "Na demonstração o plano não muda. No app real, o Claude publica pelo conector." }, 400);
  return json({ ok: true });
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const u = typeof input === "string" ? input : input.url;
  return u.includes("/api/") || u.startsWith("api/") || u.startsWith("./api/") ? api(u, init) : nativeFetch(input, init);
};
// sem service worker nem notificações na demo
if ("serviceWorker" in navigator) Object.defineProperty(navigator.serviceWorker, "register", { value: async () => ({}) });

// selo fixo: tudo é fictício
addEventListener("DOMContentLoaded", () => {
  const s = document.createElement("div");
  s.textContent = "Demonstração · dados fictícios";
  s.style.cssText = "position:fixed;top:calc(env(safe-area-inset-top,0px) + 4px);left:50%;transform:translateX(-50%);z-index:9999;padding:3px 12px;border-radius:99px;background:#E8590C;color:#fff;font:600 11px/1.6 Inter,system-ui,sans-serif;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.25)";
  document.body.append(s);
});
