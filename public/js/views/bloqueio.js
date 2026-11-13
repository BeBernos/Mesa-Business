// Bloqueio depois de algumas horas sem uso: destrava com a digital (passkey) ou com a senha da família.
// O servidor é quem manda (sessão pf_sess); aqui só a tela e as chamadas do WebAuthn.
import { S } from "../state.js";
import { $, icon, openSheet, closeSheet, sheetHead, toast } from "../ui.js";
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
  $("#app").innerHTML = `<div class="login-wrap"><div class="login">
    <img class="logo" src="/img/logo.svg" alt="">
    <div><div class="eyebrow" style="color:rgba(255,255,255,.75)"><span class="marca"><i></i><i></i><i></i></span>Mesa bloqueada</div>
      <div class="h1" style="margin-top:8px">Bem-vindo de volta</div>
      <p style="margin-top:8px">Por segurança, a Mesa pede a ${digital ? "digital" : "senha"} depois de algumas horas sem uso.</p></div>
    ${digital ? `<button class="btn primary block" id="bq-digital">${icon("smartphone")}Desbloquear com a digital</button>` : ""}
    <form id="bq-senha" ${digital ? "hidden" : ""} style="display:flex;flex-direction:column;gap:12px">
      <input class="input" type="password" id="bq-pass" placeholder="Senha da família" autocomplete="current-password" required>
      <button class="btn ${digital ? "" : "primary"} block" type="submit">Entrar</button></form>
    ${digital ? `<button class="btn ghost block" id="bq-usar-senha" style="color:#fff">Usar a senha</button>` : ""}
    <p id="bq-erro" style="color:#FFD0D0;font-size:14px;min-height:1em"></p></div></div>`;

  const ok = () => { aberta = false; marcarUso(); aoDestravar(); };
  const erro = (m) => { $("#bq-erro").textContent = m; };
  const tentar = async () => {
    try { await destravarComDigital(); ok(); }
    catch (e) { erro(e.name === "NotAllowedError" ? "Cancelado. Toque para tentar de novo ou use a senha." : e.message); }
  };
  $("#bq-digital")?.addEventListener("click", tentar);
  $("#bq-usar-senha")?.addEventListener("click", () => { $("#bq-senha").hidden = false; $("#bq-usar-senha").hidden = true; $("#bq-pass").focus(); });
  $("#bq-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#bq-pass").value }) }); ok(); }
    catch (err) { erro(err.message); }
  });
  if (digital) tentar();
}

/** Depois de entrar com a senha: oferece a digital uma vez (se o celular tiver e ainda não estiver ativa). */
export async function oferecerDigital() {
  if (temDigital() || LS.get("app_passkey_nao", false) || !(await digitalDisponivel())) return;
  openSheet(`${sheetHead("Entrar com a digital?")}
    <div class="sb"><p class="muted" style="line-height:1.55">Depois de algumas horas sem uso, a Mesa trava para proteger os dados de saúde da família.
      Com a digital, destravar leva um segundo — sem digitar a senha.</p>
      <div class="gap-m"></div><button class="btn primary block" data-act="bq-ativar">${icon("smartphone")}Ativar a digital</button>
      <button class="btn ghost block" data-act="bq-nao" style="margin-top:6px">Agora não</button><div class="gap-m"></div></div>`);
}

export const acts = {
  "bq-ativar": async () => {
    try { await cadastrarDigital(); closeSheet(); toast("Digital ativada neste celular"); }
    catch (e) { toast(e.name === "NotAllowedError" ? "Cancelado" : "Não deu: " + e.message, 4000); }
  },
  "bq-nao": () => { LS.set("app_passkey_nao", true); closeSheet(); },
};
