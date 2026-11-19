// Bloqueio depois de algumas horas sem uso: destrava com a digital (passkey) ou com a senha da família.
// O servidor é quem manda (sessão pf_sess); aqui só a tela e as chamadas do WebAuthn.
import { S } from "../state.js";
import { $, icon } from "../ui.js";
import { api, LS } from "../sync.js";

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// ---------- uso: o relógio do bloqueio também roda aqui, para travar até sem internet ----------
const idleMs = () => (LS.get("app_idle_h", 4) || 4) * 3600e3;
export const marcarUso = () => LS.set("app_ativo", Date.now());
export const vencido = () => Date.now() - LS.get("app_ativo", 0) > idleMs();
let ultimoToque = 0;
addEventListener("pointerdown", () => { if (Date.now() - ultimoToque > 60e3) { ultimoToque = Date.now(); marcarUso(); } }, { passive: true });

// ---------- digital ----------
export const temDigital = () => !!LS.get("app_passkey", null);
export async function digitalDisponivel() {
  try { return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
}

const pedirDigital = (challenge) => navigator.credentials.get({
  publicKey: { challenge, rpId: location.hostname, allowCredentials: [{ type: "public-key", id: unb64u(LS.get("app_passkey").id) }], userVerification: "required", timeout: 60000 },
});

export async function cadastrarDigital() {
  const nome = S.cfg?.name || "Celular";
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: "Mesa", id: location.hostname },
      user: { id: new TextEncoder().encode(S.deviceId).slice(0, 64), name: nome, displayName: `Mesa · ${nome}` },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      attestation: "none",
      timeout: 60000,
    },
  });
  await api("/api/passkey", { method: "POST", body: JSON.stringify({ id: cred.id, pub: b64u(cred.response.getPublicKey()), alg: cred.response.getPublicKeyAlgorithm(), device: S.deviceId, name: nome }) });
  LS.set("app_passkey", { id: cred.id });
}

export async function removerDigital() {
  await api("/api/passkey", { method: "DELETE", body: JSON.stringify({ device: S.deviceId }) });
  LS.del("app_passkey");
}

async function destravarComDigital() {
  let challenge;
  try {
    challenge = (await api("/api/passkey/desafio")).challenge;
  } catch (e) {
    if (!e.offline) throw e;
    // sem internet: confere a digital no próprio celular e libera só a tela (o servidor pede de novo quando voltar)
    await pedirDigital(crypto.getRandomValues(new Uint8Array(32)));
    return;
  }
  const cred = await pedirDigital(unb64u(challenge));
  const r = cred.response;
  await api("/api/passkey/verificar", {
    method: "POST",
    body: JSON.stringify({ id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature) }),
  });
}

// ---------- tela ----------
let aberta = false;
export const bloqueado = () => aberta;
export function telaBloqueio(aoDestravar) {
  if (aberta) return;
  aberta = true;
  document.querySelectorAll(".scrim, .sheet, .kitchen").forEach((el) => el.remove());
  const digital = temDigital();
  const h = new Date().getHours();
  const ola = `${h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"}, família`;
  // entrada (Mesa 3.0): o prato se desenha, os pontos da família entram; a digital só é pedida no toque
  $("#app").innerHTML = `<div class="entrada"><svg class="marca" viewBox="0 0 1024 1024" role="img" aria-label="Mesa">
      <defs><linearGradient id="bq-rg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7B93FF"/><stop offset="1" stop-color="#B57CFF"/></linearGradient><filter id="bq-blur" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="26"/></filter></defs>
      <g class="orbita"><path class="anel" pathLength="1" d="M810.9 538.2 A300 300 0 1 1 485.8 213.1"/>
        ${[[574.4, 218.6, "rafael"], [724.1, 299.9, "marina"], [805.4, 449.6, "theo"]].map(([x, y, c], i) => `<circle class="halo" cx="${x}" cy="${y}" r="70" fill="var(--${c})" filter="url(#bq-blur)"/><circle class="p p${i + 1}" cx="${x}" cy="${y}" r="50" fill="var(--${c})"/>`).join("")}</g>
      <circle class="disco" cx="512" cy="512" r="196"/>
      <path class="garfo" pathLength="1" d="M452 388 V468 Q452 548 512 548 Q572 548 572 468 V388 M512 388 V548 M512 548 V660"/></svg>
    <h1 class="nome">Mesa</h1><p class="ola">${ola}</p>
    <div class="base">
      ${digital ? `<button class="digital" id="bq-digital" aria-label="Entrar com a digital">${icon("fingerprint")}</button>
        <small id="bq-msg">Toque para entrar com a digital</small>` : ""}
      <form id="bq-senha" ${digital ? "hidden" : ""}>
        <input class="input" type="password" id="bq-pass" placeholder="Senha da família" aria-label="Senha da família" autocomplete="current-password" required>
        <button class="btn cta block" type="submit">Entrar</button></form>
      ${digital ? `<button class="senha" id="bq-usar-senha" type="button">Usar a senha</button>` : ""}
      <p id="bq-erro" role="alert"></p></div></div>`;

  const ok = () => { aberta = false; marcarUso(); aoDestravar(); };
  const erro = (m) => { $("#bq-erro").textContent = m; };
  const tentar = async () => {
    const b = $("#bq-digital");
    if (b.classList.contains("lendo")) return;
    b.classList.add("lendo"); $("#bq-msg").textContent = "Encoste o dedo no leitor…"; erro("");
    try { await destravarComDigital(); b.classList.add("ok"); ok(); }
    catch (e) { erro(e.name === "NotAllowedError" ? "Cancelado. Toque para tentar de novo ou use a senha." : e.message); $("#bq-msg").textContent = "Toque para entrar com a digital"; }
    finally { b.classList.remove("lendo"); }
  };
  $("#bq-digital")?.addEventListener("click", tentar);
  $("#bq-usar-senha")?.addEventListener("click", () => { $("#bq-senha").hidden = false; $("#bq-usar-senha").hidden = true; $("#bq-pass").focus(); });
  $("#bq-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#bq-pass").value }) }); ok(); }
    catch (err) { erro(err.message); }
  });
}
