// Comunicação com o servidor + registro compartilhado entre os celulares
// (refeições feitas, compras, peso, sintomas, testes). Funciona offline: as
// mudanças ficam numa fila e sobem quando a conexão volta.

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
export { LS };

export class ApiError extends Error {}

export async function api(path, opts = {}) {
  let r;
  try {
    r = await fetch(path, { credentials: "same-origin", ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
  } catch (e) {
    const err = new ApiError("Sem conexão");
    err.offline = true;
    throw err;
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new ApiError(j.error || `Erro ${r.status}`);
    err.status = r.status;
    err.auth = r.status === 401;
    err.locked = r.status === 423; // passou o tempo sem uso: pede a digital/senha
    err.data = j;
    throw err;
  }
  return j;
}

const key = (kind, day, person = "", k = "") => `${kind}|${day}|${person}|${k}`;

export const log = {
  rows: new Map(Object.entries(LS.get("app_log_rows", {}))),
  pending: LS.get("app_log_pending", []),
  since: LS.get("app_log_since", 0),
  device: "",
  falhou: false, // último envio não passou (sem internet)
  listeners: new Set(),

  get(kind, day, person = "", k = "") {
    const r = this.rows.get(key(kind, day, person, k));
    return r && !r.deleted ? r : null;
  },
  all(kind, filter = () => true) {
    const out = [];
    for (const r of this.rows.values()) if (r.kind === kind && !r.deleted && filter(r)) out.push(r);
    return out;
  },
  set(kind, day, person = "", k = "", v = "1") {
    this._apply({ kind, day, person, k, v: v == null ? null : String(v), deleted: 0, updated: Date.now(), local: true });
  },
  del(kind, day, person = "", k = "") {
    this._apply({ kind, day, person, k, v: null, deleted: 1, updated: Date.now(), local: true });
  },
  toggle(kind, day, person, k) {
    if (this.get(kind, day, person, k)) this.del(kind, day, person, k); else this.set(kind, day, person, k, "1");
    return !!this.get(kind, day, person, k);
  },
  _apply(op) {
    const kk = key(op.kind, op.day, op.person, op.k);
    this.rows.set(kk, op);
    this.pending = this.pending.filter((p) => key(p.kind, p.day, p.person, p.k) !== kk);
    this.pending.push({ kind: op.kind, day: op.day, person: op.person, k: op.k, v: op.v, deleted: op.deleted });
    this._save();
    this._emit();
    clearTimeout(this._t);
    this._t = setTimeout(() => this.push(), 400);
  },
  _save() {
    LS.set("app_log_rows", Object.fromEntries(this.rows));
    LS.set("app_log_pending", this.pending);
    LS.set("app_log_since", this.since);
  },
  /** Quantas alterações estão esperando para subir (só conta quando o envio já falhou). */
  esperando() { return this.falhou ? this.pending.length : 0; },
  _emit() { for (const f of this.listeners) f(); },
  onChange(f) { this.listeners.add(f); },

  async push() {
    if (!this.pending.length || this._pushing) return;
    this._pushing = true;
    const ops = this.pending.slice(0, 200);
    try {
      await api("/api/log", { method: "POST", body: JSON.stringify({ ops, device: this.device }) });
      const sent = new Set(ops.map((o) => key(o.kind, o.day, o.person, o.k) + (o.deleted ? "0" : o.v)));
      this.pending = this.pending.filter((o) => !sent.has(key(o.kind, o.day, o.person, o.k) + (o.deleted ? "0" : o.v)));
      this._save();
      if (this.falhou) { this.falhou = false; this._emit(); }
    } catch (e) {
      // tenta de novo no próximo ciclo; a tela mostra "N alterações esperando internet"
      if (!this.falhou) { this.falhou = true; this._emit(); }
    } finally {
      this._pushing = false;
    }
    if (this.pending.length) setTimeout(() => this.push(), 3000);
  },

  async pull() {
    await this.push();
    const r = await api(`/api/log?since=${this.since}`);
    const pend = new Set(this.pending.map((p) => key(p.kind, p.day, p.person, p.k)));
    let changed = false;
    for (const row of r.rows) {
      const kk = key(row.kind, row.day, row.person, row.k);
      if (pend.has(kk)) continue;
      const cur = this.rows.get(kk);
      if (!cur || cur.local || cur.updated !== row.updated || cur.v !== row.v || cur.deleted !== row.deleted) {
        this.rows.set(kk, row);
        changed = true;
      }
      if (row.updated > this.since) this.since = row.updated;
    }
    this._save();
    if (changed) this._emit();
    return changed;
  },

  reset() {
    this.rows.clear();
    this.pending = [];
    this.since = 0;
    ["app_log_rows", "app_log_pending", "app_log_since"].forEach(LS.del);
  },
};
