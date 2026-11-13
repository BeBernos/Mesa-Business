// Verificação de passkey (WebAuthn) para o desbloqueio por digital, só com WebCrypto.
// O cadastro confia no celular já autenticado (sessão com senha), então não verificamos atestado:
// guardamos a chave pública (SPKI) que o próprio navegador entrega em getPublicKey().
import { unb64u } from "./webpush.js";

const dec = new TextDecoder();
const sha256 = async (b) => new Uint8Array(await crypto.subtle.digest("SHA-256", b));

/** Assinatura ECDSA em DER (como o autenticador manda) → r||s de 64 bytes (como o WebCrypto quer). */
export function derParaRaw(der) {
  if (der[0] !== 0x30) throw new Error("assinatura não é DER");
  let i = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const out = new Uint8Array(64);
  for (const pos of [0, 32]) {
    if (der[i] !== 0x02) throw new Error("DER inválido");
    let len = der[i + 1];
    let v = der.subarray(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    if (v.length > 32) throw new Error("inteiro grande demais");
    out.set(v, pos + 32 - v.length);
  }
  return out;
}

const ALGS = {
  "-7": { importar: { name: "ECDSA", namedCurve: "P-256" }, verificar: { name: "ECDSA", hash: "SHA-256" }, raw: true },
  "-257": { importar: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verificar: { name: "RSASSA-PKCS1-v1_5" }, raw: false },
};
export const algSuportado = (alg) => !!ALGS[String(alg)];

export async function importarChave(pubB64u, alg) {
  const a = ALGS[String(alg)];
  return crypto.subtle.importKey("spki", unb64u(pubB64u), a.importar, false, ["verify"]);
}

/**
 * Confere uma asserção (navigator.credentials.get). Lança erro com o motivo se algo não bater.
 * desafioOk(desafio) diz se o challenge (b64url) foi emitido por nós e ainda vale.
 */
export async function verificarAssercao({ pub, alg, clientDataJSON, authenticatorData, signature, origem, rpId, desafioOk }) {
  const cdBytes = unb64u(clientDataJSON);
  const cd = JSON.parse(dec.decode(cdBytes));
  if (cd.type !== "webauthn.get") throw new Error("tipo errado");
  if (cd.origin !== origem) throw new Error("origem errada");
  if (!(await desafioOk(cd.challenge))) throw new Error("desafio inválido ou vencido");
  const auth = unb64u(authenticatorData);
  const rpHash = await sha256(new TextEncoder().encode(rpId));
  if (auth.length < 37 || rpHash.some((b, i) => b !== auth[i])) throw new Error("rpId errado");
  const flags = auth[32];
  if (!(flags & 0x01) || !(flags & 0x04)) throw new Error("sem verificação do usuário (digital)");
  const assinado = new Uint8Array(auth.length + 32);
  assinado.set(auth);
  assinado.set(await sha256(cdBytes), auth.length);
  const a = ALGS[String(alg)];
  const sig = unb64u(signature);
  const ok = await crypto.subtle.verify(a.verificar, await importarChave(pub, alg), a.raw ? derParaRaw(sig) : sig, assinado);
  if (!ok) throw new Error("assinatura inválida");
  return true;
}
