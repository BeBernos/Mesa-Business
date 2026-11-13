// Novidades: aparece uma vez por versão ao abrir o app; lista completa em Ajustes → App → Novidades.
// Regra: TODA atualização sobe VERSAO e ganha uma entrada no topo de NOVIDADES (linguagem simples).
import { esc, icon, openSheet, closeSheet, sheetHead } from "../ui.js";
import { LS } from "../sync.js";

export const NOVIDADES = [
  {
    versao: "2.7.0", data: "2026-11-12", titulo: "Pulse e Cesta conversando com a Mesa",
    itens: [
      "**Dia de treino pelo Pulse:** o Pulse avisa a Mesa quais dias são de treino e de descanso. A meta do dia segue o Pulse, e o Hoje mostra “pelo Pulse” com o horário do treino.",
      "**Pré e pós-treino no horário certo:** quando o treino do Pulse está marcado para outra hora, o cartão do pré-treino e do pós-treino mostra o horário que combina (1 h antes e ~1h15 depois).",
      "**Quanto custa a dieta:** quando a Marina traz a lista da dieta para a Cesta, os preços voltam para cá. Em Compras aparece quanto custa a semana (ou o plano inteiro), e o Claude vê o custo ao montar o próximo plano.",
    ],
  },
  {
    versao: "2.6.0", data: "2026-11-12", titulo: "Mais rápida e mais segura",
    itens: [
      "**Abre mais rápido:** o plano do mês fica guardado no celular já conferido; não precisa validar tudo de novo a cada abertura.",
      "**Plano novo aparece na hora** em todos os celulares (antes podia levar até 1 minuto).",
      "**Voltar a um plano anterior:** em Ajustes → Plano do mês → Histórico, cada plano mostra quem publicou e quando, com o botão “Voltar a este”.",
      "Por trás: os testes da Mesa agora rodam sozinhos no GitHub a cada mudança, para nada quebrar sem ninguém ver.",
    ],
  },
  {
    versao: "2.5.0", data: "2026-11-12", titulo: "Cozinha e compras",
    itens: [
      "**Compras seguem as trocas:** trocou o café de morango pelo de kiwi? A lista passa a pedir kiwi. Dá para desligar em Compras → “Seguir as trocas de opção”.",
      "**Já tenho em casa:** toque na caixinha ao lado do item (arroz, azeite, whey…) e ele sai da conta da semana. “Comprar” traz de volta.",
      "**Preparo em lote com quantidades:** o preparo do domingo mostra quanto fazer na semana para a família (cru e pronto), por exemplo “Arroz 430 g ≈ 1 kg pronto”.",
      "**Temporizador:** passo de preparo que fala em minutos ganha um botão “⏱ 20 min”. Quando acaba, o celular vibra e avisa.",
      "**Imprimir a semana:** na aba Semana, um botão gera o cardápio de todos e a lista de compras para a geladeira (ou PDF).",
      "**No computador:** a ficha da refeição fica aberta ao lado da linha do tempo; tocar em outra refeição troca o que está aberto.",
    ],
  },
  {
    versao: "2.4.0", data: "2026-11-12", titulo: "Entender o mês",
    itens: [
      "**Como está indo o plano** (aba Semana): quanto das refeições foi marcado em cada semana, quanto foi comido por dia contra a meta (kcal e proteína), o peso desde o começo do plano e a água.",
      "**Comida × sintoma** (aba Saúde): a Mesa cruza o diário com o que foi marcado como comido e mostra o que mais aparece nos dias com sintoma — por exemplo, “feijão: 3 de 4 dias”. É um padrão, não uma prova; o Claude também vê.",
      "**Testes de reintrodução guiados:** no dia da dose a Mesa avisa de manhã; no dia seguinte pergunta como foi. Cada teste mostra o resultado (**passou**, **sintoma leve**, **não passou**) e os testes de meses anteriores ficam guardados.",
      "**Visão do Theo:** em vez de calorias, “comeu bem / comeu pouco / recusou” em cada refeição, e a alergia sempre à vista no Hoje. O Claude usa isso para ajustar as refeições dele.",
    ],
  },
  {
    versao: "2.3.0", data: "2026-11-12", titulo: "Ajustes novos, água e busca",
    itens: [
      "**Ajustes repaginados:** um menu por assunto (Notificações, Lembretes, Plano, Claude, Família, Segurança, Aparência), com um resumo em cada linha. Cada assunto abre na própria página, e o “voltar” do celular volta ao menu.",
      "**Desfazer no “Comi”:** marcou sem querer? Toque em **Desfazer** no aviso que aparece embaixo (fica 5 segundos).",
      "**Sem aviso repetido:** a notificação da refeição não chega se alguém já marcou “Comi” — nem a adiada.",
      "**Água:** cartão no Hoje com toque de um copo (250 ml). A meta vem do plano ou do peso (35 ml por kg).",
      "**Busca:** a lupa no topo mostra em que dias e refeições aparece um alimento (“frango”, “kiwi”), para todos da família.",
      "**Deslizar** para os lados no Hoje troca o dia; **puxar a tela para baixo** atualiza.",
      "**Sem internet:** um aviso no topo mostra quantas marcações estão esperando para subir.",
      "**Próximo plano:** quando o plano do mês seguinte já foi publicado, o Hoje avisa e deixa ver o cardápio e a compra da 1ª semana antes de começar. Quando o plano está acabando, lembra de pedir o próximo ao Claude.",
      "**Fonte grande:** telas revisadas para o celular com letra aumentada.",
    ],
  },
  {
    versao: "2.2.0", data: "2026-11-11", titulo: "Comer só parte e a Mesa que pergunta",
    itens: [
      "**Comeu só parte da refeição?** Abra a ficha e toque no ingrediente que não comeu: ele fica riscado e as calorias e a proteína do dia se ajustam. O que sobrou no prato vai para o Claude ajustar as porções do próximo plano.",
      "**Comeu outra coisa?** Na mesma ficha, escreva o que foi (e as kcal, se souber) e ele entra no lugar da refeição.",
      "**A Mesa agora pergunta:** quando falta algo, ela manda uma pergunta, e dá para responder na própria notificação. Por exemplo: “E o estômago hoje?” depois de um sintoma, “Alguma reação ao alho?” depois de uma dose de teste, “Como está indo o dia?” se nada foi marcado até a tarde, “Como foi o dia?” à noite e o fechamento da semana no domingo.",
      "No máximo **2 perguntas por dia**, nunca de madrugada. Dá para desligar em Ajustes → Notificações → Perguntas da Mesa.",
    ],
  },
  {
    versao: "2.1.1", data: "2026-11-05", titulo: "Cardio do Pulse",
    itens: ["**Cardio do Pulse no Hoje:** quando o treino do dia tem cardio com calorias registradas no Pulse, a Mesa mostra quanto foi gasto."],
  },
  {
    versao: "2.1.0", data: "2026-10-29", titulo: "A Mesa chegou",
    itens: [
      "**Novo nome: Mesa.** Mesmo app, mesmo endereço, ícone da família.",
      "**Opções de refeição funcionando:** toque em “Opção 1 de 3” na ficha da refeição e troque a do dia. Vale também para o plano de novembro, que já está no ar. A troca aparece nos dois celulares e as calorias acompanham.",
      "**Conector do Claude:** em Ajustes → Claude, copie o endereço e adicione no claude.ai. Aí é só pedir “monte a dieta do mês que vem”: ele lê o feedback, o peso e o que foi comido, monta, mostra o resumo e publica depois que você confirmar.",
      "**Digital:** depois de 4 horas sem uso, a Mesa trava e pede a digital (ou a senha). Ative em Ajustes → Segurança. As notificações (Comi, Adiar) continuam funcionando.",
      "**Feedback na aba Saúde:** “Como foi hoje?” (energia, fome, intestino) e o fechamento da semana. É o que o Claude lê para ajustar o próximo plano.",
      "**Compras:** “Tudo” vem primeiro e os botões das semanas ficaram menores.",
      "**No computador:** menu na lateral e as fichas abrem como janela.",
      "**Dentro do Pulse:** Ajustes → Família → Mesa (no computador, também no menu lateral).",
      "**Versão e novidades** agora aparecem em Ajustes → App.",
    ],
  },
  {
    versao: "2.0.0", data: "2026-10-18", titulo: "Identidade da família",
    itens: ["Ícone novo com os três pontos (Rafael, Marina e Theo).", "Nada de verde: Theo agora é laranja.", "Barra de baixo sem a faixa clara do Android."],
  },
  {
    versao: "1.0.0", data: "2026-10-17", titulo: "App novo",
    itens: ["Hoje, Semana, Compras e Saúde com o visual da família.", "Marcar “comi”, lista de compras dividida entre os celulares e modo cozinha."],
  },
];
export const VERSAO = NOVIDADES[0].versao;

const negrito = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

function lista(entradas) {
  return entradas.map((n) => `<div class="section-title" style="margin-top:18px"><h2>${esc(n.versao)} · ${esc(n.titulo)}</h2><span class="faint" style="font-size:12px">${n.data.slice(8, 10)}/${n.data.slice(5, 7)}</span></div>
    <div class="stack">${n.itens.map((t) => `<div class="note">${icon("sparkles")}<div class="md">${negrito(t)}</div></div>`).join("")}</div>`).join("");
}

/** Abre a janela com o que mudou desde a última versão vista neste celular. Devolve true se abriu. */
export function mostrarSeNovo({ aparelhoNovo = false, depois } = {}) {
  const visto = LS.get("app_versao_vista", null);
  if (aparelhoNovo || visto === VERSAO) { LS.set("app_versao_vista", VERSAO); return false; }
  const i = NOVIDADES.findIndex((n) => n.versao === visto);
  abrir(i > 0 ? NOVIDADES.slice(0, i) : NOVIDADES.slice(0, 1), depois);
  return true;
}

export function abrir(entradas = NOVIDADES, depois) {
  LS.set("app_versao_vista", VERSAO);
  openSheet(`${sheetHead("Novidades da Mesa", `versão ${VERSAO}`)}
    <div class="sb">${lista(entradas)}<div class="gap-m"></div></div>
    <div class="foot"><button class="btn primary block" data-act="close-sheet">Entendi</button></div>`, { onClose: depois });
}

export const acts = { novidades: () => abrir() };
