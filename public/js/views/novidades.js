// Novidades: aparecem uma vez por versão ao abrir o app (janela em public/v3/views/ajustes.js); lista completa em Ajustes → App.
// Regra: TODA atualização sobe VERSAO e ganha uma entrada no topo de NOVIDADES (linguagem simples).

export const NOVIDADES = [
  {
    versao: "3.0.4", data: "2026-11-27", titulo: "Treino e ideias",
    itens: [
      "**Treinou hoje?** Agora a resposta vale de verdade: “Sim” tira o cartão da Hoje (com Desfazer) e “Não” deixa só a orientação do plano para o dia sem treino.",
      "**Ideias e feedback** (Ajustes): mande uma ideia ou um problema da Mesa. Fica guardado para a família, o Claude lê pelo conector e a resposta aparece ali mesmo.",
    ],
  },
  {
    versao: "3.0.3", data: "2026-11-26", titulo: "Quatro anéis",
    itens: ["**Carbo e gordura nos anéis:** além de calorias e proteína, a Hoje mostra um anel para o carbo (amarelo) e outro para a gordura (lilás), nas mesmas cores das linhas embaixo."],
  },
  {
    versao: "3.0.2", data: "2026-11-25", titulo: "Agora, carbo e o mês",
    itens: [
      "**Cartão do agora:** tocar em qualquer parte dele abre a refeição, com as opções, “só parte” e “outra coisa”, como nas outras.",
      "**Carbo e gordura voltaram:** o plano de dezembro veio sem esses números; a Mesa agora calcula pelos ingredientes (aproximado) até o próximo plano trazer os valores do Claude.",
      "**Compras do mês:** além de Tudo e das semanas, dá para ver a lista de cada mês (Nov, Dez, Jan). E a lista de Tudo agora sincroniza entre os celulares — antes ficava só no aparelho.",
      "**Ajustes:** o cartão deste celular ficou com a cara do app, com a inicial de quem ele abre.",
      "**Correções:** o “agora” segue o horário ajustado pelo treino do Pulse, o Diário da criança não mostra calorias e o app não trava mais quando chega um plano novo com a Mesa bloqueada.",
    ],
  },
  {
    versao: "3.0.1", data: "2026-11-19", titulo: "Cada um com o seu",
    itens: [
      "**Cada pessoa vê só o que é dela:** o teste FODMAP do dia aparece só para quem está testando, e a tela do Theo não mostra mais as regras dos adultos.",
      "**Comi outra coisa:** dá para ir somando vários itens, cada um com a sua quantidade — até o que não está na lista (sem kcal).",
      "**Pizza de pepperoni** (e a da Pizza Hut) entrou na lista.",
      "**Opções sem repetição:** quando as opções de uma refeição são iguais, aparecem uma vez só.",
      "**Entrada nova:** ao abrir, o prato da Mesa se desenha e os pontos da família entram; a digital só é pedida quando você toca no botão.",
      "**Ícone novo:** o mesmo prato com garfo, agora escuro como o app e com o anel em gradiente. No Android ele troca sozinho em alguns dias (ou reinstale a Mesa para ver na hora).",
    ],
  },
  {
    versao: "3.0.0", data: "2026-11-19", titulo: "Mesa 3.0: agora é só a nova",
    itens: [
      "**A Mesa antiga saiu de vez.** Tudo o que ela fazia está na nova; os dados são os mesmos.",
      "**Ajustes completos:** de quem são os avisos deste celular, notificações (com os próximos avisos e o teste), lembretes, água, tratamento, planos antigos, o conector do Claude, digital e trava.",
      "**Subir o plano pelo app:** Ajustes → Plano → escolher o arquivo ou colar o texto, conferir a prévia e publicar. “Compartilhar → Mesa” também cai aqui.",
      "**Diário mais completo:** peso com gráfico, testes de reintrodução, comida × sintoma, sintomas anotados (dá para apagar e desfazer) e suplementos.",
      "**No computador:** a Hoje fica em duas colunas — o painel do dia de um lado, as refeições do outro.",
    ],
  },
  {
    versao: "3.0.0-beta.8", data: "2026-11-19", titulo: "A nova Mesa chegou",
    itens: [
      "**A Mesa mudou de cara:** escura, mais leve, com tudo do dia num lugar só — refeições, água, sintomas e o tratamento.",
      "**Abas:** Hoje (o dia), Plano (a semana em grade e o fechamento do mês), Compras (a mesma lista de sempre) e Diário (como foi o dia e a semana, e as análises do Claude).",
      "**Novidades:** botão **+** para anotar sintoma, água ou efeito; “comi outra coisa” com busca de lanches e pratos; lembrete de água que cobra; a tela do Theo com o Ursinho.",
      "**Nada se perdeu:** são os mesmos dados. Se preferir a de antes, Ajustes → “Voltar para a Mesa antiga”.",
    ],
  },
  {
    versao: "3.0.0-beta.7", data: "2026-11-19", so: "v3", titulo: "Plano e Compras na nova Mesa",
    itens: [
      "**Plano:** a semana em grade, uma bolinha por refeição (comeu, passou sem marcar, trocada) e a água do dia. Toque no dia para abrir na Hoje. Dá para buscar (“quando tem frango?”) e imprimir a semana.",
      "**Fechar o mês:** um resumo de cada um (adesão, água, peso, sintomas) e o botão que abre o Claude com o pedido do próximo plano já escrito.",
      "**Compras:** por seção do mercado, “já tenho em casa”, itens extras, seguir as trocas e o custo pela Cesta. É a mesma lista da Mesa antiga — dá para dividir no mercado.",
    ],
  },
  {
    versao: "3.0.0-beta.6", data: "2026-11-19", so: "v3", titulo: "Diário e a análise do Claude",
    itens: [
      "**Aba Diário:** os últimos dias (refeições, água, sintomas e como você fechou o dia), um gráfico dos sintomas por semana com o tratamento ao fundo e as análises do Claude.",
      "**Fechar o dia em 20 segundos:** humor, fome, energia, como foi o intestino (escala de Bristol) e uma nota de 0 a 3 para cada sintoma. Na Hoje, o cartão “Como foi o dia?” aparece a partir das 21:30; no domingo à noite, “Como foi a semana?”.",
      "**Pedir análise:** abre o Claude com o pedido já escrito — é só enviar. Com o conector ligado, ele lê a semana e grava a resposta aqui; ela aparece na Hoje até você ler. Sem conector: “Copiar relatório” e depois “Colar resposta”.",
      "Se os sintomas piorarem 3 semanas seguidas, o Diário avisa para procurar um médico.",
    ],
  },
  {
    versao: "3.0.0-beta.5", data: "2026-11-19", so: "v3", titulo: "Sintomas e tratamento no dia",
    itens: [
      "**Botão + na Hoje:** anote na hora um sintoma (inchaço, gases, dor, refluxo, cansaço…) com a intensidade, um copo d'água ou um efeito colateral. Tudo aparece na linha do tempo, no horário.",
      "**Tratamento:** em Ajustes, cadastre o tratamento (ex.: berberina + alicina) com as doses de cada refeição. As doses aparecem junto da refeição com **Tomei**, e o lembrete da refeição ganha o botão **💊 Tomei**. Nos 3 últimos dias a Mesa pergunta se estende, para ou começa a reintrodução.",
      "**Sinais de alerta** (sangue nas fezes, febre, perda de peso sem querer, dor que acorda à noite): a Mesa mostra com clareza para procurar um médico.",
      "O Claude passa a ver o tratamento, as doses tomadas e os efeitos colaterais quando analisar.",
    ],
  },
  {
    versao: "3.0.0-beta.4", data: "2026-11-19", so: "v3", titulo: "Comi outra coisa, em segundos",
    itens: [
      "**Comeu fora do plano?** Na ficha da refeição (ou segurando o cartão) toque em **Comeu outra coisa**: busque na lista — Big Mac, coxinha, açaí, pizza por fatia, marmita… — escolha quantas porções e pronto.",
      "**Não achou?** Use **Estimar**: diga o tipo (lanche, prato, doce, bebida, petisco) e o tamanho (leve, normal, exagerei). A Mesa conta o meio da faixa no anel.",
      "Tudo fica marcado como **estimativa**: o Claude vê o que você comeu no lugar do plano e ajusta quando analisar.",
    ],
  },
  {
    versao: "3.0.0-beta.3", data: "2026-11-19", titulo: "A Mesa lembra da água",
    itens: [
      "**Lembrete de água (Rafael e Marina):** se a água do dia ficar para trás, a Mesa avisa — no máximo a cada 1h30 quando falta pouco e a cada 45 min quando falta muito. Nada de madrugada, nada logo depois de você anotar e nada depois de bater a meta.",
      "**+250 e +500 na própria notificação:** anota sem abrir o app e soma com o que já estava anotado.",
      "**Dá para desligar:** Ajustes → Notificações → “Lembrar de beber água”. Na nova Mesa, Ajustes também tem os horários de acordar e dormir.",
      "Na nova Mesa, a garrafa mostra quantos **dias seguidos** você bateu a meta (a partir de 3).",
    ],
  },
  {
    versao: "3.0.0-beta.2", data: "2026-11-19", so: "v3", titulo: "Hoje completa e a tela do Theo",
    itens: [
      "**Tela do Theo com o Ursinho:** na página do Theo, cada refeição tem um bonequinho, e o urso mostra como ele comeu — toque em **comeu bem**, **comeu pouco** ou **não quis**. A alergia fica sempre à vista, num balão do urso.",
      "**Ficha da refeição:** toque no cartão para ver os ingredientes (cru e pronto), marcar o que não comeu, anotar que comeu outra coisa ou trocar de opção.",
      "**Segure uma refeição** para as ações rápidas, sem abrir a ficha. O círculo do cartão marca “comi”.",
      "**Avisos do dia, preparo e modo cozinha** voltaram para a Hoje. Deslize para os lados para trocar de dia e puxe para baixo para atualizar.",
    ],
  },
  {
    versao: "3.0.0-beta.1", data: "2026-11-18", titulo: "Prévia da nova Mesa",
    itens: [
      "**Uma Mesa nova está chegando:** escura, mais leve e com tudo do dia num lugar só. Para dar uma olhada, vá em Ajustes → App → **Experimentar a nova Mesa**.",
      "Por enquanto ela mostra o **Hoje** (refeições, água, kcal e proteína). As outras abas abrem aqui, na Mesa de sempre.",
      "**Nada se perde:** as duas usam os mesmos dados. Para voltar, Ajustes da nova → “Voltar para a Mesa antiga”.",
    ],
  },
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

/** Entradas desde a versão vista (`so: "v3"` marcava as da fase de teste; hoje todas valem). */
export function novasDesde(visto) {
  const i = NOVIDADES.findIndex((n) => n.versao === visto);
  return (i > 0 ? NOVIDADES.slice(0, i) : NOVIDADES.slice(0, 1));
}
