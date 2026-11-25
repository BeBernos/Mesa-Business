// Carbo e gordura aproximados por ingrediente (base TACO/rótulos; peso cru, como o plano pede): [carbo, gordura]
// em gramas por 100 g ou 100 ml, ou por unidade quando o plano conta em "un". Só entra quando o plano não traz
// "carbo"/"gordura" na refeição — o valor do plano sempre vale mais.
// shortcut: tabela com os ingredientes que os planos da família usam; ingrediente fora dela não soma (o total fica para baixo).
const POR_100 = {
  "abacate": [6, 8.4], "abacaxi": [12, 0.1], "arroz": [78, 0.5], "aveia": [57, 7], "azeite": [0, 92], "bacon": [1, 40],
  "banana": [22, 0.1], "batata frita (air fryer)": [18, 3], "batata para pure": [14, 0], "batata": [14, 0], "batata doce": [20, 0.1],
  "beef protein shark pro": [2, 0.5], "bisteca suina": [0, 15], "bolo de chocolate com brigadeiro": [50, 18], "brownie caseiro": [55, 25],
  "calabresa": [2, 25], "carne seca": [0, 15], "castanhas": [15, 60], "catupiry": [3, 25], "cebola": [9, 0.1], "cenoura": [8, 0.2],
  "chimichurri caseiro": [5, 40], "copa lombo": [0, 12], "costela bovina": [0, 25], "costelinha suina": [0, 25], "coxao duro": [0, 7],
  "coxao mole": [0, 6], "creatina": [0, 0], "creme de leite": [4, 20], "cupim": [0, 22], "farinha de mandioca": [80, 0.3],
  "feijao": [60, 1.3], "file mignon suino": [0, 4], "fraldinha": [0, 10], "geleia": [60, 0], "granola": [65, 12],
  "iogurte caseiro": [5, 3], "kiwi": [15, 0.5], "lagarto": [0, 4], "laranja": [9, 0.1], "leite ninho fases 1-3": [55, 20],
  "leite desnatado": [5, 0.2], "leite zero lactose desnatado": [5, 0.2], "lombo canadense": [1, 4], "lombo suino": [0, 8],
  "macarrao": [75, 1.5], "maminha": [0, 8], "mamao": [11, 0.1], "mandioca": [30, 0.3], "manga": [16, 0.3], "manteiga": [0, 82],
  "massa de lasanha sem ovo": [72, 1.5], "massa de pastel caseira": [55, 10], "massa de pizza caseira": [50, 5], "melancia": [8, 0],
  "mel": [82, 0], "milho verde": [17, 1.5], "miolo de alcatra": [0, 6], "molho barbecue caseiro": [40, 0.5],
  "molho de tomate caseiro": [8, 2], "molho madeira caseiro": [8, 4], "morango": [7, 0.3], "mostarda": [6, 4],
  "mousse de maracuja": [30, 10], "musculo": [0, 6], "nesquik": [90, 2], "ovo": [1, 10], "panetone bacio di latte": [55, 15],
  "panetone ofner recheado": [55, 18], "panetone ofner zero gotas": [55, 15], "parmesao": [3, 28], "pasta de amendoim": [20, 50],
  "patinho": [0, 6], "patinho moido": [0, 6], "pave de sonho de valsa": [35, 15], "peito de frango": [0, 2], "pernil suino": [0, 10],
  "picanha": [0, 15], "pimentao": [5, 0.2], "pitaya": [11, 0.4], "presunto": [2, 3], "pao caseiro": [50, 5],
  "pao de hamburguer": [50, 4], "queijo mussarela": [3, 25], "requeijao light": [4, 10], "salada (folhas)": [3, 0.2],
  "salsicha": [3, 20], "sobrecoxa de frango": [0, 12], "sorvete caseiro de ninho": [25, 10], "tangerina": [11, 0.2], "tender": [3, 8],
  "toddy": [90, 2], "tomate": [3, 0.2], "torta mousse de limao": [35, 15], "tortilla caseira": [50, 6], "uva": [17, 0.2],
  "whey baunilha dark lab": [8, 5], "whey": [8, 5], "leite": [5, 3],
};
const POR_UN = {
  "leite fermentado": [13, 0], "lollo": [17, 8], "moranguete": [8, 3], "ouro branco": [13, 6.5], "pacoca": [10, 6],
  "rabanada": [30, 10], "sonho de valsa": [12, 6.5], "omega 3": [0, 1], "ovo": [0.5, 5],
};

const chave = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** { carbo, gordura } estimados pelos itens, ou null se nenhum item é conhecido. */
export function estimarMacros(itens) {
  let carbo = 0, gordura = 0, achou = false;
  for (const it of itens || []) {
    if (it.qtd == null) continue;
    const k = chave(it.nome), u = chave(it.unid);
    const un = u === "un" || u === "unid" || u === "unidade";
    const v = un ? POR_UN[k] : POR_100[k];
    if (!v) continue;
    const f = un ? it.qtd : it.qtd / 100;
    carbo += v[0] * f; gordura += v[1] * f; achou = true;
  }
  return achou ? { carbo: Math.round(carbo), gordura: Math.round(gordura) } : null;
}
