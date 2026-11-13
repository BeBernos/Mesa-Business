// Service worker: offline, notificações e "compartilhar arquivo com o app".
const VERSION = "v10";
const SHELL = `pf-shell-${VERSION}`;
const PLANS = "pf-plans";
const API = "pf-api";
const ASSETS = [
  "/", "/css/app.css", "/fonts/inter.woff2", "/img/icons.svg", "/img/logo.svg", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/badge-96.png",
  "/js/app.js", "/js/plan.js", "/js/ui.js", "/js/sync.js", "/js/state.js",
  "/js/views/hoje.js", "/js/views/semana.js", "/js/views/compras.js", "/js/views/saude.js", "/js/views/ajustes.js", "/js/views/atualizar.js", "/js/views/bloqueio.js", "/js/views/novidades.js", "/js/views/busca.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const velhas = (await caches.keys()).filter((k) => k.startsWith("pf-shell-") && k !== SHELL);
      await Promise.all(velhas.map((k) => caches.delete(k)));
      await self.clients.claim();
      // veio de uma versão anterior: recarrega as telas abertas para entrar na nova
      if (velhas.length) for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url).catch(() => {});
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Android "Compartilhar → Mesa" com um .html
  if (url.pathname === "/share" && req.method === "POST") {
    e.respondWith(
      (async () => {
        const form = await req.formData();
        const file = [...form.values()].find((f) => f && typeof f.text === "function");
        if (!file) return Response.redirect("/?share=erro", 303);
        const cache = await caches.open("pf-share");
        await cache.put("/__shared", new Response(await file.text(), { headers: { "x-filename": encodeURIComponent(file.name || "") } }));
        return Response.redirect("/?share=1", 303);
      })(),
    );
    return;
  }
  if (req.method !== "GET") return;

  // Planos: imutáveis por id → cache primeiro (funciona offline no mercado)
  if (url.pathname.startsWith("/p/") || /^\/api\/plan\/[\w-]+$/.test(url.pathname)) {
    e.respondWith(
      caches.open(PLANS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          c.put(req, res.clone());
          trimPlans(c);
        }
        return res;
      }),
    );
    return;
  }

  // Lista de planos: rede primeiro, cache se offline
  if (url.pathname === "/api/meta") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(API).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.open(API).then((c) => c.match(req)).then((r) => r || Response.json({ error: "offline" }, { status: 503 }))),
    );
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  // Arquivos do app: rede primeiro (sempre a versão nova, sem misturar), cache se offline
  e.respondWith(
    caches.open(SHELL).then(async (c) => {
      const key = req.mode === "navigate" ? "/" : req;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") c.put(key, res.clone());
        return res;
      } catch (err) {
        return (await c.match(key, { ignoreSearch: true })) || Response.error();
      }
    }),
  );
});

async function trimPlans(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 4))) await cache.delete(k);
}

// ---------- notificações ----------
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Mesa", body: e.data && e.data.text() }; }
  const actions = [];
  if (d.eat) actions.push({ action: "eat", title: "✅ Comi" });
  if (d.snooze) actions.push({ action: "snooze", title: "⏰ 15 min" });
  // perguntas da Mesa proativa: até 2 respostas como botões (o Android mostra no máximo 2)
  (d.respostas || []).slice(0, 2).forEach((r, i) => actions.push({ action: `r${i}`, title: r.titulo }));
  e.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title || "Mesa", {
        body: d.body || "",
        tag: d.tag || undefined,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: d,
        actions,
        timestamp: d.ts || Date.now(),
        vibrate: [140, 70, 140],
      });
      if (d.kind === "update") {
        const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        list.forEach((c) => c.postMessage({ type: "plan-updated" }));
      }
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  if (e.action === "eat" && d.eat) {
    e.waitUntil(
      fetch("/api/log", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ops: [{ kind: "eaten", day: d.eat.day, person: d.eat.person, k: d.eat.k, v: "1" }] }),
      }).then(() => self.clients.matchAll({ type: "window" })).then((list) => list.forEach((c) => c.postMessage({ type: "log" }))),
    );
    return;
  }
  if (e.action === "snooze") {
    e.waitUntil(
      (async () => {
        const c = await caches.open("pf-meta");
        const r = await c.match("/__device");
        const deviceId = r ? await r.text() : "";
        await fetch("/api/snooze", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceId, minutes: 15, payload: { ...d, title: d.title && !d.title.startsWith("⏰") ? `⏰ ${d.title}` : d.title } }),
        });
      })(),
    );
    return;
  }
  const resposta = /^r\d$/.test(e.action) ? d.respostas?.[+e.action.slice(1)] : null;
  if (resposta && !resposta.abrir) {
    // responde sem abrir o app: grava e avisa a tela, se estiver aberta
    e.waitUntil(gravar(resposta.ops));
    return;
  }
  const url = resposta?.abrir || d.url || "/";
  e.waitUntil(
    (async () => {
      if (resposta) await gravar(resposta.ops);
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) {
        if (new URL(c.url).origin === location.origin) {
          await c.focus();
          c.postMessage({ type: "open", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

async function gravar(ops) {
  if (!ops?.length) return;
  await fetch("/api/log", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) });
  for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "log" });
}

// O navegador às vezes troca a inscrição de push sozinho; reenvia ao servidor.
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil(
    (async () => {
      const opts = (e.oldSubscription && e.oldSubscription.options) || null;
      const sub = e.newSubscription || (opts ? await self.registration.pushManager.subscribe(opts) : null);
      if (!sub) return;
      const r = await (await caches.open("pf-meta")).match("/__device");
      if (!r) return;
      await fetch(`/api/devices/${await r.text()}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sub: sub.toJSON() }),
      });
    })(),
  );
});
