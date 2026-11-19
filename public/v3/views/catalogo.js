// Catálogo dos componentes (/v3/#catalogo), com o dia fictício da referência — serve para conferir a pele
// contra docs/design/mesa-3-orbita.html sem depender de plano. Não grava nada no registro.
import { esc, aneis, garrafa, macros, dias, avatares, refeicao, cartaoDaVez, linhaDoTempo, nota, abrirFolha, fecharFolha, toast, icon } from "../ui.js";
import { rerender } from "../../js/state.js";
import { urso, boneco } from "../desenhos.js";

const META = { kcal: 2200, proteina: 160, carbo: 230, gordura: 70, agua: 3000 };
const MEALS = [
  { id: "cafe", hora: "07:30", nome: "Café da manhã", desc: "Ovos mexidos, pão integral, kiwi", itens: [["Ovos", "3 un"], ["Pão integral", "2 fatias"], ["Kiwi", "1 un"]], kcal: 520, proteina: 38, carbo: 48, gordura: 18 },
  { id: "lanche", hora: "10:30", nome: "Lanche", desc: "Iogurte natural, whey, aveia", itens: [["Iogurte natural", "170 g"], ["Whey", "30 g"], ["Aveia", "20 g"]], kcal: 260, proteina: 30, carbo: 22, gordura: 5 },
  { id: "almoco", hora: "13:00", nome: "Almoço", desc: "Arroz, frango, abobrinha", itens: [["Arroz (pronto)", "150 g"], ["Peito de frango (cru)", "160 g"], ["Abobrinha", "100 g"]], kcal: 680, proteina: 52, carbo: 70, gordura: 17 },
  { id: "pre", hora: "17:30", nome: "Pré-treino", desc: "Banana, pasta de amendoim", itens: [["Banana", "1 un"], ["Pasta de amendoim", "15 g"]], kcal: 280, proteina: 9, carbo: 34, gordura: 11 },
  { id: "jantar", hora: "20:30", nome: "Jantar", desc: "Patinho, batata, salada", itens: [["Patinho (cru)", "150 g"], ["Batata", "200 g"], ["Salada", "à vontade"]], kcal: 460, proteina: 31, carbo: 56, gordura: 19 },
];
const C = { ml: 1250, comeu: new Set(["cafe", "lanche"]), dia: "2026-11-18" };
const PESSOAS = [{ id: "rafael", nome: "Rafael", cor: "var(--rafael)" }, { id: "marina", nome: "Marina", cor: "var(--marina)" }, { id: "theo", nome: "Theo", cor: "var(--theo)" }];
const DIAS = [["Seg", 16], ["Ter", 17], ["Qua", 18], ["Qui", 19], ["Sex", 20], ["Sáb", 21], ["Dom", 22]].map(([r, n]) => ({ data: `2026-11-${n}`, rotulo: r, n, past: n < 18 }));

export function render() {
  const feito = { kcal: 0, proteina: 0, carbo: 0, gordura: 0 };
  MEALS.forEach((m) => { if (C.comeu.has(m.id)) for (const k in feito) feito[k] += m[k]; });
  const vez = MEALS.find((m) => !C.comeu.has(m.id));
  const tl = MEALS.map((m) => (m === vez ? cartaoDaVez(m, { acoes: [{ rotulo: "Só parte", act: "cat-toast" }, { rotulo: "Trocar", act: "cat-toast" }] }) : refeicao(m, { feita: C.comeu.has(m.id) })));
  tl.splice(2, 0, nota("10:50 · inchaço leve", "var(--fat)"));
  return `<div class="page cat">
    <header class="hi"><div><small>Mesa 3.0 · pele Órbita</small><h1>Catálogo</h1></div><a class="btn txt" href="#ajustes">${icon("x")}<span class="sr">Fechar</span></a></header>
    <h2>Topo e dias</h2>
    <header class="hi"><div><small>Quarta, 18 nov · treino 18:00</small><h1>Bom dia, Rafael</h1></div>${avatares(PESSOAS, "rafael")}</header>
    ${dias(DIAS, C.dia).replace(/data-act="dia"/g, 'data-act="cat-dia"')}
    <h2>Anéis + garrafa</h2>
    <div class="top2">${aneis({ kcal: feito.kcal, metaKcal: META.kcal, prot: feito.proteina, metaProt: META.proteina, chave: "cat" })}${garrafa({ ml: C.ml, meta: META.agua, chave: "cat", act: "cat-agua" })}</div>
    ${macros({ feito, meta: META, chave: "cat" })}
    <h2>Número sempre no centro</h2>
    <div class="lado">${aneis({ kcal: 520, metaKcal: 2200, prot: 38, metaProt: 160, chave: "c1" })}${aneis({ kcal: 1940, metaKcal: 2200, prot: 150, metaProt: 160, chave: "c2" })}</div>
    <h2>Linha do tempo · cartão da vez</h2>
    <div class="sec"><span>Refeições</span><span>${C.comeu.size} de ${MEALS.length}</span></div>
    ${linhaDoTempo(tl).replace(/data-act="comi"/g, 'data-act="cat-comi"')}
    <h2>Tela da criança</h2>
    <div class="crianca amostra">
      <div class="lado-a-lado">${["oi", "bem", "pouco", "recusou"].map((h) => urso(h, 56)).join("")}</div>
      <div class="lado-a-lado" style="margin:.75rem 0">${["cafe", "almoco", "lanche", "jantar", "ceia"].map(boneco).join("")}</div>
      <div class="balao-urso">${urso("oi", 44)}<div class="balao"><b>Alergia a ovo — utensílios separados</b><br>Vale para tudo o que Theo comer.</div></div>
      <div class="tl" style="margin-top:.875rem">${refeicao({ id: "kid", hora: "12:00", nome: "Almoço", desc: "Frango, arroz, feijão" }, { semKcal: true, antes: boneco("almoco"), depois: `<div class="aceite">${[["bem", "comeu bem"], ["pouco", "comeu pouco"], ["recusou", "não quis"]].map(([k, l], i) => `<button class="carinha" aria-pressed="${i === 0}">${urso(k, 30)}<span>${l}</span></button>`).join("")}</div>` })}</div>
    </div>
    <h2>Vidro, botões, folha e toast</h2>
    <div class="glass card"><div class="muted">Cartão de vidro: fundo branco 3 %, borda 5 %, raio 16.</div></div><div class="gap"></div>
    <div class="go"><button class="btn cta" data-act="cat-folha">Abrir folha</button><button class="btn" data-act="cat-desfazer">Toast com desfazer</button><button class="btn txt" data-act="cat-toast">Texto</button></div>
  </div>`;
}

export const acts = {
  "cat-comi": (b) => {
    const id = b.dataset.m, tinha = C.comeu.has(id);
    tinha ? C.comeu.delete(id) : C.comeu.add(id);
    rerender();
    toast(tinha ? "Desmarcado" : `${MEALS.find((m) => m.id === id).nome} marcado`, () => { tinha ? C.comeu.add(id) : C.comeu.delete(id); rerender(); });
  },
  "cat-agua": () => { C.ml = Math.min(4000, C.ml + 250); rerender(); toast(C.ml >= META.agua ? "Meta de água batida!" : "+250 ml de água"); },
  "cat-dia": (b) => { C.dia = b.dataset.d; rerender(); },
  "cat-toast": () => toast("Só um aviso"),
  "cat-desfazer": () => toast("Marcado", () => toast("Desfeito")),
  "cat-folha": () => abrirFolha(`<h2 class="h2">Folha</h2><p class="muted">Sobe de baixo, fecha tocando fora, no Esc ou no “voltar” do Android.</p>
    <div class="gap"></div><button class="btn cta block" data-act="cat-fechar">${esc("Fechar")}</button>`),
  "cat-fechar": () => fecharFolha(),
};
