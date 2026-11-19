// Água que cobra (Mesa 3.0, spec §7.2). Função pura, testada: recebe os fatos de uma pessoa naquele minuto e diz se
// avisa. A meta é distribuída em linha reta entre acordar e dormir; atraso = esperado agora − bebido.

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PADRAO = { ligado: true, acorda: "07:00", dorme: "22:00" };
const min = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3);
const ESPACO = { leve: 90, forte: 45 }; // minutos entre avisos do mesmo nível
const QUIETO_APOS_REGISTRO = 10; // minutos

/** Ajustes da água de uma pessoa, já validados (hora inválida ou janela invertida → padrão). */
export function cfgAgua(bruto) {
  const b = bruto && typeof bruto === "object" ? bruto : {};
  const janela = HM.test(b.acorda) && HM.test(b.dorme) && min(b.acorda) < min(b.dorme);
  return { ligado: b.ligado !== false, acorda: janela ? b.acorda : PADRAO.acorda, dorme: janela ? b.dorme : PADRAO.dorme };
}

/** Quanto já deveria ter bebido às `hm`, em ml (0 antes de acordar, a meta depois de dormir). */
export function esperadoAgora(metaMl, cfg, hm) {
  const f = (min(hm) - min(cfg.acorda)) / (min(cfg.dorme) - min(cfg.acorda));
  return Math.round(metaMl * Math.max(0, Math.min(1, f)));
}

const ml = (v) => (Math.round(v / 50) * 50).toLocaleString("pt-BR");
const litros = (v) => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * f: { hm "HH:MM" local, agora epoch ms, metaMl, bebido ml, cfg (de cfgAgua), ultimoAviso {at, nivel} | null,
 *      ultimoRegistro epoch ms do último registro de água de hoje | null }
 * → null ou { nivel, title, body }
 */
export function avisoDeAgua(f) {
  const { hm, agora, metaMl, bebido, cfg } = f;
  if (!cfg.ligado || min(hm) < min(cfg.acorda) || min(hm) >= min(cfg.dorme) || bebido >= metaMl) return null;
  const atraso = esperadoAgora(metaMl, cfg, hm) - bebido;
  if (atraso < 250) return null;
  if (f.ultimoRegistro && agora - f.ultimoRegistro < QUIETO_APOS_REGISTRO * 60e3) return null;
  const nivel = atraso >= 750 ? "forte" : "leve";
  if (f.ultimoAviso && agora - f.ultimoAviso.at < ESPACO[nivel] * 60e3) return null;
  return nivel === "forte"
    ? { nivel, title: `Você está ${ml(atraso)} ml atrás — bora?`, body: `${litros(bebido)} de ${litros(metaMl)} L até agora. Um copo grande já ajuda.` }
    : { nivel, title: "Hora de um copo 💧", body: `${litros(bebido)} de ${litros(metaMl)} L até agora.` };
}
