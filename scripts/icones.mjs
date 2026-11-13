// Ícone do app em SVG (vetor), nas variações de identidade.
// O desenho é sempre o mesmo: prato (anel), garfo no centro e o ponto de "agora" no anel.
// Regra da identidade: nada de verde.

const C = 512, R = 300, ANEL = 46, DISCO = 196;
const pos = (graus, raio = R) => [C + raio * Math.cos((graus * Math.PI) / 180), C + raio * Math.sin((graus * Math.PI) / 180)];

const garfo = (cor) => `<path d="M452 388 V468 Q452 548 512 548 Q572 548 572 468 V388 M512 388 V548 M512 548 V660"
  fill="none" stroke="${cor}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Anel com recortes (o "respiro" em volta de cada ponto) e os pontos. */
function anel(traco, pontos) {
  let furos = pontos.map(({ a }) => { const [x, y] = pos(a); return `<circle cx="${x}" cy="${y}" r="88" fill="#000"/>`; }).join("");
  if (pontos.length > 1) {
    // vários pontos: um vão contínuo no anel entre o primeiro e o último
    const [x1, y1] = pos(pontos[0].a), [x2, y2] = pos(pontos[pontos.length - 1].a);
    furos += `<path d="M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}" fill="none" stroke="#000" stroke-width="176"/>`;
  }
  const bolas = pontos.map(({ a, cor, brilho }) => {
    const [x, y] = pos(a);
    return `${brilho ? `<circle cx="${x}" cy="${y}" r="70" fill="${cor}" opacity=".45" filter="url(#blur)"/>` : ""}<circle cx="${x}" cy="${y}" r="50" fill="${cor}"/>`;
  }).join("");
  return `<mask id="m"><rect width="1024" height="1024" fill="#fff"/>${furos}</mask>
    <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${traco}" stroke-width="${ANEL}" mask="url(#m)"/>${bolas}`;
}

export const VARIANTES = {
  refinado: {
    nome: "Refinado",
    descricao: "O original, limpo: gradiente índigo → framboesa, anel branco e ponto rosa luminoso.",
    marca: ["#4263EB", "#C2255C"],
    svg: () => `
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C5FE8"/><stop offset="1" stop-color="#B8246A"/></linearGradient>
        <radialGradient id="hl" cx=".22" cy=".12" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="22"/></filter></defs>
      <rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#hl)"/>
      ${anel("#fff", [{ a: -45, cor: "#FF7AC6", brilho: true }])}
      <circle cx="${C}" cy="${C}" r="${DISCO}" fill="#15121F"/>${garfo("#fff")}`,
  },
  noite: {
    nome: "Noite",
    descricao: "Grafite com brilho índigo e rosa; o anel vira o próprio gradiente da marca.",
    marca: ["#7B93FF", "#F06595"],
    svg: () => `
      <defs><linearGradient id="rg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7B93FF"/><stop offset="1" stop-color="#F06595"/></linearGradient>
        <radialGradient id="g1" cx=".15" cy=".1" r=".7"><stop offset="0" stop-color="#4263EB" stop-opacity=".55"/><stop offset="1" stop-color="#4263EB" stop-opacity="0"/></radialGradient>
        <radialGradient id="g2" cx=".95" cy=".95" r=".65"><stop offset="0" stop-color="#C2255C" stop-opacity=".45"/><stop offset="1" stop-color="#C2255C" stop-opacity="0"/></radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="24"/></filter></defs>
      <rect width="1024" height="1024" fill="#0E0D14"/><rect width="1024" height="1024" fill="url(#g1)"/><rect width="1024" height="1024" fill="url(#g2)"/>
      ${anel("url(#rg)", [{ a: -45, cor: "#FF7AC6", brilho: true }])}
      <circle cx="${C}" cy="${C}" r="${DISCO}" fill="#1E1C28"/>${garfo("#fff")}`,
  },
  dia: {
    nome: "Dia",
    descricao: "Fundo claro quente, como o app de dia; anel em gradiente e miolo grafite.",
    marca: ["#4263EB", "#D6336C"],
    svg: () => `
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBFAF7"/><stop offset="1" stop-color="#ECE9E2"/></linearGradient>
        <linearGradient id="rg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4263EB"/><stop offset="1" stop-color="#D6336C"/></linearGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="20"/></filter></defs>
      <rect width="1024" height="1024" fill="url(#bg)"/>
      ${anel("url(#rg)", [{ a: -45, cor: "#E64980", brilho: false }])}
      <circle cx="${C}" cy="${C}" r="${DISCO}" fill="#17161B"/>${garfo("#fff")}`,
  },
  familia: {
    nome: "Família",
    descricao: "O ponto vira três — Rafael, Marina e Theo — sobre o gradiente profundo.",
    marca: ["#3B4BC8", "#8E1F5A"],
    svg: () => `
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3442B8"/><stop offset="1" stop-color="#7E1C55"/></linearGradient>
        <radialGradient id="hl" cx=".2" cy=".1" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="18"/></filter></defs>
      <rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#hl)"/>
      ${anel("#fff", [{ a: -78, cor: "#8FA3FF", brilho: true }, { a: -45, cor: "#FF7AC6", brilho: true }, { a: -12, cor: "#FF9D5C", brilho: true }])}
      <circle cx="${C}" cy="${C}" r="${DISCO}" fill="#15121F"/>${garfo("#fff")}`,
  },
};

/** SVG completo. forma: "quadrado" (maskable/Android recorta), "arredondado" (preview e favicon). */
export function svgIcone(chave, forma = "quadrado") {
  const v = VARIANTES[chave];
  const clip = forma === "arredondado" ? `<clipPath id="cp"><rect width="1024" height="1024" rx="230"/></clipPath>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${clip}<g ${clip ? 'clip-path="url(#cp)"' : ""}>${v.svg()}</g></svg>`;
}

// Identidade escolhida (out/2026): "familia".
export const IDENTIDADE = "familia";

/** Ícone monocromático da barra de status do Android (só o alfa conta): anel, garfo e os três pontos. */
export function svgBadge() {
  const RB = 380, p = (a) => [C + RB * Math.cos((a * Math.PI) / 180), C + RB * Math.sin((a * Math.PI) / 180)];
  const [x1, y1] = p(-80), [x2, y2] = p(-10);
  const pts = [-80, -45, -10].map((a) => { const [x, y] = p(a); return `<circle cx="${x}" cy="${y}" r="62" fill="#fff"/>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
    <mask id="m"><rect width="1024" height="1024" fill="#fff"/><path d="M${x1} ${y1} A${RB} ${RB} 0 0 1 ${x2} ${y2}" fill="none" stroke="#000" stroke-width="220" stroke-linecap="round"/></mask>
    <circle cx="${C}" cy="${C}" r="${RB}" fill="none" stroke="#fff" stroke-width="84" mask="url(#m)"/>${pts}
    <path d="M440 360 V470 Q440 570 512 570 Q584 570 584 470 V360 M512 360 V570 M512 570 V700" fill="none" stroke="#fff" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
