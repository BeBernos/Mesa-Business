// Desenhos da tela da criança (SVG feito para a Mesa, sem nenhum verde): o Ursinho do Theo, um bonequinho por
// refeição e o céu do fundo. Tudo decorativo (aria-hidden); o texto ao lado diz o que importa.
const T = "#3B2A20"; // contorno
const URSO = "#B97A4F", FOCINHO = "#F3D9B8", BOCHECHA = "#FF9EC4", AMARELO = "#FFC94D";

const BOCA = {
  oi: `<path d="M44 73 Q50 78 56 73" fill="none" stroke="${T}" stroke-width="2.6" stroke-linecap="round"/>`,
  bem: `<path d="M41 71 Q50 82 59 71 Z" fill="#E8616F" stroke="${T}" stroke-width="2.4" stroke-linejoin="round"/>`,
  pouco: `<path d="M44 75 H56" stroke="${T}" stroke-width="2.6" stroke-linecap="round"/>`,
  recusou: `<path d="M42 76 Q46 72 50 76 Q54 80 58 76" fill="none" stroke="${T}" stroke-width="2.6" stroke-linecap="round"/>`,
};
const OLHOS = {
  normal: `<circle cx="38" cy="51" r="3.6" fill="${T}"/><circle cx="62" cy="51" r="3.6" fill="${T}"/><circle cx="39.2" cy="49.8" r="1.1" fill="#fff"/><circle cx="63.2" cy="49.8" r="1.1" fill="#fff"/>`,
  feliz: `<path d="M33 52 Q38 46 43 52 M57 52 Q62 46 67 52" fill="none" stroke="${T}" stroke-width="2.8" stroke-linecap="round"/>`,
  bravo: `<path d="M33 47 L41 51 L33 55 M67 47 L59 51 L67 55" fill="none" stroke="${T}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`,
};
const ESTRELA = (x, y, r, cor = AMARELO) => {
  const p = Array.from({ length: 10 }, (_, i) => { const a = (Math.PI / 5) * i - Math.PI / 2, k = i % 2 ? r * 0.45 : r; return `${(x + k * Math.cos(a)).toFixed(1)},${(y + k * Math.sin(a)).toFixed(1)}`; }).join(" ");
  return `<polygon points="${p}" fill="${cor}" stroke="${T}" stroke-width="2" stroke-linejoin="round"/>`;
};

/** O Ursinho. humor: "oi" | "bem" | "pouco" | "recusou". */
export function urso(humor = "oi", tamanho = 64) {
  const olhos = humor === "bem" ? OLHOS.feliz : humor === "recusou" ? OLHOS.bravo : OLHOS.normal;
  return `<svg class="urso" data-humor="${humor}" width="${tamanho}" height="${tamanho}" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="24" cy="27" r="14" fill="${URSO}" stroke="${T}" stroke-width="3"/><circle cx="24" cy="27" r="7" fill="${FOCINHO}"/>
    <circle cx="76" cy="27" r="14" fill="${URSO}" stroke="${T}" stroke-width="3"/><circle cx="76" cy="27" r="7" fill="${FOCINHO}"/>
    <circle cx="50" cy="56" r="35" fill="${URSO}" stroke="${T}" stroke-width="3"/>
    <circle cx="29" cy="65" r="5.5" fill="${BOCHECHA}" opacity=".8"/><circle cx="71" cy="65" r="5.5" fill="${BOCHECHA}" opacity=".8"/>
    <ellipse cx="50" cy="69" rx="16" ry="12.5" fill="${FOCINHO}" stroke="${T}" stroke-width="2.4"/>
    <ellipse cx="50" cy="63" rx="5.5" ry="3.8" fill="${T}"/>${olhos}${BOCA[humor] || BOCA.oi}
    ${humor === "bem" ? ESTRELA(86, 14, 11) : ""}${humor === "recusou" ? `<path d="M80 40 q4 6 0 10 q-4 -4 0 -10z" fill="#7CC4FF" stroke="${T}" stroke-width="1.6"/>` : ""}</svg>`;
}

const ROSTO = (x, y, dormindo = false) => dormindo
  ? `<path d="M${x - 6} ${y} q3 3 6 0 M${x + 2} ${y} q3 3 6 0" fill="none" stroke="${T}" stroke-width="2" stroke-linecap="round"/><path d="M${x - 2} ${y + 6} q3 2 6 0" fill="none" stroke="${T}" stroke-width="2" stroke-linecap="round"/>`
  : `<circle cx="${x - 4}" cy="${y}" r="2" fill="${T}"/><circle cx="${x + 6}" cy="${y}" r="2" fill="${T}"/><path d="M${x - 2} ${y + 5} q3 3 6 0" fill="none" stroke="${T}" stroke-width="2" stroke-linecap="round"/>`;

const BONECOS = {
  cafe: `<path d="M34 22 h4 a6 6 0 0 1 0 12 h-4" fill="none" stroke="${T}" stroke-width="3"/><rect x="9" y="16" width="26" height="25" rx="6" fill="${AMARELO}" stroke="${T}" stroke-width="3"/>
    <path d="M16 11 q-3 -4 0 -7 M23 11 q-3 -4 0 -7" fill="none" stroke="${T}" stroke-width="2" stroke-linecap="round" opacity=".6"/>${ROSTO(21, 27)}`,
  almoco: `<rect x="6" y="18" width="36" height="22" rx="8" fill="#FF8A4C" stroke="${T}" stroke-width="3"/><path d="M4 21 h40" stroke="${T}" stroke-width="3" stroke-linecap="round"/>
    <path d="M18 18 q6 -9 12 0" fill="#FFC94D" stroke="${T}" stroke-width="3"/>${ROSTO(23, 28)}`,
  lanche: `<path d="M24 14 q-1 -6 4 -9" fill="none" stroke="${T}" stroke-width="3" stroke-linecap="round"/><path d="M27 9 q8 -3 10 4 q-7 2 -10 -4z" fill="${AMARELO}" stroke="${T}" stroke-width="2"/>
    <path d="M24 15 c-8 -6 -19 -2 -19 11 c0 10 8 17 13 17 c3 0 4 -1 6 -1 s3 1 6 1 c5 0 13 -7 13 -17 c0 -13 -11 -17 -19 -11z" fill="${BOCHECHA}" stroke="${T}" stroke-width="3"/>${ROSTO(23, 27)}`,
  jantar: `<path d="M30 6 a18 18 0 1 0 12 30 a15 15 0 0 1 -12 -30z" fill="#B49CFF" stroke="${T}" stroke-width="3" stroke-linejoin="round"/>${ROSTO(22, 25, true)}
    <text x="34" y="14" font-size="9" font-weight="700" fill="${T}" font-family="Fredoka, sans-serif">z</text>`,
  ceia: `<circle cx="24" cy="25" r="17" fill="#E8B07A" stroke="${T}" stroke-width="3"/><circle cx="15" cy="17" r="2.2" fill="${T}"/><circle cx="33" cy="16" r="2" fill="${T}"/><circle cx="34" cy="33" r="2.2" fill="${T}"/>${ROSTO(23, 25)}`,
};

/** Bonequinho da refeição (pelo tipo de js/plan.js tipoRefeicao). Treino e o resto viram o lanche. */
export const boneco = (tipo) => `<svg class="boneco" width="40" height="40" viewBox="0 0 48 48" aria-hidden="true">${BONECOS[tipo] || BONECOS.lanche}</svg>`;

/** Céu do fundo: nuvens e estrelinhas. */
export function ceu() {
  const nuvem = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.28)" stroke-width="1.5"><path d="M10 30 a10 10 0 0 1 4 -19 a14 14 0 0 1 26 -2 a11 11 0 0 1 12 21 z"/></g>`;
  return `<svg class="ceu" viewBox="0 0 400 300" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
    ${nuvem(18, 40, 1.1)}${nuvem(290, 18, 0.9)}${nuvem(230, 130, 0.7)}
    ${ESTRELA(150, 30, 7)}${ESTRELA(372, 96, 6, BOCHECHA)}${ESTRELA(60, 140, 5, "#7CC4FF")}${ESTRELA(330, 200, 5)}</svg>`;
}
