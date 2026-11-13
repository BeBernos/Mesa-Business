// Cálculo de "o que notificar e quando", compartilhado entre o cron e a API
// de "próximos lembretes". Todos os horários do plano são locais (TZ do app).

const DOW = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

function parts(epoch, tz) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(epoch)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

function offsetMs(epoch, tz) {
  const p = parts(epoch, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(epoch / 1000) * 1000;
}

/** "2026-10-08" + "07:30" no fuso tz → epoch ms */
export function localToEpoch(date, hm, tz) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let e = guess - offsetMs(guess, tz);
  e = guess - offsetMs(e, tz); // corrige se cair perto de troca de horário
  return e;
}

export function localDate(epoch, tz) {
  const p = parts(epoch, tz);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addDays(date, n) {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

function dow(date) {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

const br = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

function clip(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function mealBody(m) {
  const head = [m.pre, m.sub].filter(Boolean).join(" · ");
  const items = (m.items || []).join(" + ");
  const kcal = m.kcal ? ` (${m.kcal} kcal)` : "";
  return clip([head, items].filter(Boolean).join(" — ") + kcal, 230);
}

function personName(sched, p) {
  return (sched.persons && sched.persons[p]) || p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * Todos os eventos (com horário de disparo) de um aparelho para as datas dadas.
 * Cada evento: { at, payload }.
 */
function eventsFor(device, sched, dates, tz) {
  const out = [];
  const persons = device.persons || [];
  const lead = Math.max(0, Math.min(180, Number(device.lead) || 0));
  const many = persons.length > 1;
  const days = (sched && sched.days) || {};

  for (const date of dates) {
    const day = days[date];

    if (day && device.meals !== false) {
      for (const p of persons) {
        for (const m of (day.meals && day.meals[p]) || []) {
          if (!/^\d{1,2}:\d{2}$/.test(m.t || "")) continue;
          const who = many ? ` · ${personName(sched, p)}` : "";
          out.push({
            at: localToEpoch(date, m.t, tz) - lead * 60000,
            payload: {
              kind: "meal",
              title: lead ? `${m.name} às ${m.t} (em ${lead} min)${who}` : `${m.t} · ${m.name}${who}`,
              body: mealBody(m),
              tag: `meal-${date}-${p}-${m.t}`,
              url: `/?pessoa=${encodeURIComponent(p)}&dia=${date}`,
              snooze: true,
              eat: m.key ? { day: date, person: p, k: m.key } : undefined,
            },
          });
        }
      }
    }

    if (day && device.summary && device.summary.on && /^\d{2}:\d{2}$/.test(device.summary.time || "")) {
      const lines = [];
      for (const p of persons) {
        const ms = (day.meals && day.meals[p]) || [];
        if (!ms.length) continue;
        const lista = ms.map((m) => `${m.t} ${m.name}`).join(" · ");
        lines.push(many ? `${personName(sched, p)}: ${lista}` : lista);
      }
      if (lines.length) {
        out.push({
          at: localToEpoch(date, device.summary.time, tz),
          payload: {
            kind: "summary",
            title: `☀️ Hoje · ${DOW[dow(date)]} ${br(date)}${day.label ? " · " + day.label : ""}`,
            body: clip(lines.join("\n"), 400),
            tag: `summary-${date}`,
            url: "/",
          },
        });
      }
    }

    for (const r of device.reminders || []) {
      if (!r || !/^\d{2}:\d{2}$/.test(r.time || "") || !(r.days || []).includes(dow(date))) continue;
      out.push({
        at: localToEpoch(date, r.time, tz),
        payload: { kind: "reminder", title: `🔔 ${clip(r.text, 80)}`, body: "", tag: `rem-${r.id}-${date}`, url: "/", snooze: true },
      });
    }

    if (device.uploader && sched && sched.lastDate) {
      const faltam = Math.round((Date.parse(sched.lastDate) - Date.parse(date)) / 86400000);
      if (faltam === 3 || faltam === 1) {
        out.push({
          at: localToEpoch(date, "19:00", tz),
          payload: {
            kind: "plan-end",
            title: faltam === 1 ? "📅 O plano acaba amanhã" : "📅 O plano acaba em 3 dias",
            body: `Último dia: ${br(sched.lastDate)}. Peça o próximo ao Claude pelo conector da Mesa — a família é avisada quando ele publicar.`,
            tag: `plan-end-${date}`,
            url: "/?upload=1",
          },
        });
      }
    }
  }
  return out;
}

/** Eventos de um aparelho que disparam na janela (from, to]. */
export function dueBetween(device, sched, from, to, tz) {
  const d0 = localDate(from, tz);
  const dates = [d0, addDays(d0, 1)];
  if (localDate(to, tz) !== d0) dates.push(addDays(d0, 2));
  return eventsFor(device, sched, dates, tz).filter((e) => e.at > from && e.at <= to);
}

/** Próximos `limit` eventos a partir de agora (para a tela de configurações). */
export function upcoming(device, sched, now, tz, limit = 8) {
  const d0 = localDate(now, tz);
  return eventsFor(device, sched, [d0, addDays(d0, 1), addDays(d0, 2)], tz)
    .filter((e) => e.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((e) => ({ at: e.at, kind: e.payload.kind, title: e.payload.title }));
}
