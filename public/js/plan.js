// Formato "plano-familia/2": o Claude gera os DADOS do mês, o app desenha.
// Este módulo é usado no navegador e no Worker (sem DOM): normaliza, valida e
// deriva o que as telas e as notificações precisam (totais, agenda, compras).
// Especificação para humanos: docs/FORMATO-PLANO.md

export const FORMATO = "plano-familia/2";
export const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
export const DIAS_LONGOS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^(\d{1,2}):(\d{2})$/;
// Paleta de reserva para pessoas novas. Regra da identidade: nada de verde.
const CORES = ["#4263EB", "#D6336C", "#E8590C", "#AE3EC9", "#F59F00", "#1C7ED6"];

/** true se a cor (#rrggbb) cai na faixa do verde (matiz ~65°–190°, inclui verde-água) — essas são recusadas. */
export function ehVerde(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.12) return false; // cinzas
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 65 && h <= 190; // inclui verde-água/turquesa
}

// ---------- datas ----------
export const parseData = (d) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
export const diaSemana = (d) => parseData(d).getUTCDay();
export const somaDias = (d, n) => { const x = parseData(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const difDias = (a, b) => Math.round((parseData(b) - parseData(a)) / 864e5);
export const dataCurta = (d) => `${+d.slice(8, 10)} ${MESES[+d.slice(5, 7) - 1]}`;
export const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function slug(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(+v) ? +v : NaN);
const str = (v, n = 400) => (typeof v === "string" ? v.trim().slice(0, n) : v == null ? "" : String(v).slice(0, n));
const lista = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// ---------- tipos de refeição (ícone e cor da linha do tempo) ----------
export function tipoRefeicao(m) {
  const t = slug(m.tipo || "");
  if (["cafe", "almoco", "jantar", "lanche", "ceia", "treino"].includes(t)) return t;
  const n = slug(`${m.nome} ${m.titulo || ""}`);
  if (/pre-treino|pos-treino|treino|shake-pos/.test(n)) return "treino";
  if (/cafe/.test(n)) return "cafe";
  if (/almoco|marmita/.test(n)) return "almoco";
  if (/jantar|janta/.test(n)) return "jantar";
  if (/ceia|noite|leite-da-noite/.test(n)) return "ceia";
  return "lanche";
}

// ---------- normalização + validação ----------
function normItem(raw, onde, erros) {
  let nome, qtd, unid, obs, kcal, proteina;
  if (Array.isArray(raw)) [nome, qtd, unid, obs] = raw;
  else if (raw && typeof raw === "object") {
    nome = raw.nome ?? raw.n; qtd = raw.qtd ?? raw.q ?? raw.quantidade; unid = raw.unid ?? raw.u ?? raw.unidade; obs = raw.obs ?? raw.nota;
    kcal = raw.kcal; proteina = raw.proteina;
  } else if (typeof raw === "string") nome = raw;
  nome = str(nome, 80);
  if (!nome) { erros.push(`${onde}: item sem nome`); return null; }
  const q = num(qtd);
  if (Number.isNaN(q)) erros.push(`${onde}: quantidade inválida em "${nome}"`);
  const it = { nome, qtd: Number.isNaN(q) ? null : q, unid: str(unid, 12), obs: str(obs, 120) };
  // kcal/proteína por item são opcionais: deixam exato o "comi só parte" (sem eles, a Mesa estima)
  if (Number.isFinite(+kcal) && kcal !== null && kcal !== "") it.kcal = +kcal;
  if (Number.isFinite(+proteina) && proteina !== null && proteina !== "") it.proteina = +proteina;
  return it;
}

function normPessoa(p, i, erros) {
  const id = slug(p.id || p.nome);
  if (!id) { erros.push(`pessoas[${i}]: falta "id"`); return null; }
  const m = p.metas || {};
  let kcal = m.kcal;
  if (typeof kcal === "number") kcal = { padrao: kcal };
  const kcalOk = {};
  for (const [k, v] of Object.entries(kcal || {})) if (Number.isFinite(+v)) kcalOk[k] = +v;
  const peso = p.peso && typeof p.peso === "object" ? {
    atual: num(p.peso.atual), data: RE_DATA.test(p.peso.data || "") ? p.peso.data : "", meta: str(p.peso.meta, 40),
    historico: lista(p.peso.historico).filter((h) => Array.isArray(h) && RE_DATA.test(h[0]) && Number.isFinite(+h[1])).map((h) => [h[0], +h[1]]),
  } : null;
  return {
    id, nome: str(p.nome, 40) || id, cor: /^#[0-9a-f]{6}$/i.test(p.cor || "") && !ehVerde(p.cor) ? p.cor : CORES[i % CORES.length],
    resumo: str(p.resumo, 80), detalhe: str(p.detalhe, 160),
    metas: { kcal: kcalOk, proteina: num(m.proteina) || null, agua: num(m.agua) > 0 ? num(m.agua) : null },
    peso, suplementos: lista(p.suplementos).map((s) => str(s, 120)).filter(Boolean),
    restricoes: lista(p.restricoes).map((s) => str(s, 80)).filter(Boolean),
    // criança: marca "comeu bem / pouco / recusou" em vez de contar calorias (o Theo é criança mesmo sem o campo)
    crianca: typeof p.crianca === "boolean" ? p.crianca : id === "theo",
  };
}

function normRefeicao(raw, modelos, onde, erros, ehAlternativa = false) {
  if (!raw || typeof raw !== "object") { erros.push(`${onde}: refeição inválida`); return null; }
  let base = {};
  if (raw.modelo) {
    base = modelos[raw.modelo];
    if (!base) { erros.push(`${onde}: modelo "${raw.modelo}" não existe em "modelos"`); base = {}; }
  }
  const r = { ...base, ...raw };
  const hm = RE_HORA.exec(str(r.hora));
  if (!hm || +hm[1] > 23 || +hm[2] > 59) erros.push(`${onde}: hora inválida "${r.hora ?? ""}" (use HH:MM)`);
  const nome = str(r.nome, 60);
  if (!nome) erros.push(`${onde}: refeição sem "nome"`);
  const itens = lista(r.itens).map((it, k) => normItem(it, `${onde} item ${k + 1}`, erros)).filter(Boolean);
  const out = {
    hora: hm ? `${hm[1].padStart(2, "0")}:${hm[2]}` : "00:00",
    nome: nome || "Refeição", titulo: str(r.titulo, 120), nota: str(r.nota, 300),
    familia: !!r.familia, opcoes: str(r.opcoes, 60),
    kcal: num(r.kcal), proteina: num(r.proteina), carbo: num(r.carbo), gordura: num(r.gordura),
    itens,
  };
  for (const k of ["kcal", "proteina", "carbo", "gordura"]) if (Number.isNaN(out[k])) { erros.push(`${onde}: "${k}" não é número`); out[k] = null; }
  out.tipo = tipoRefeicao({ ...r, nome: out.nome });
  // alternativas: outras opções para o mesmo horário (id de modelo ou refeição completa); herdam hora, nome e tipo
  if (!ehAlternativa) {
    const alts = lista(r.alternativas).slice(0, 5)
      .map((a, k) => normRefeicao({ hora: out.hora, nome: out.nome, tipo: r.tipo, ...(typeof a === "string" ? { modelo: a } : a) }, modelos, `${onde} alternativa ${k + 1}`, erros, true))
      .filter(Boolean);
    if (alts.length) {
      out.alternativas = alts.map((a, k) => ({ ...a, numero: k + 2 }));
      out.numero = 1;
      out.opcoes = `Opção 1 de ${alts.length + 1}`;
    }
  }
  return out;
}

const TONS = ["info", "alerta", "ok"];
function normNota(n) {
  if (!n || typeof n !== "object") return null;
  const texto = str(n.texto, 4000);
  const titulo = str(n.titulo, 120);
  if (!texto && !titulo) return null;
  return { secao: slug(n.secao) || "plano", pessoa: slug(n.pessoa), titulo, texto, tom: TONS.includes(n.tom) ? n.tom : "info" };
}

/**
 * Planos sem "alternativas" mas com "Opção X de N": o plano roda as opções entre os dias (e a fruta/doce da semana
 * muda junto). As outras opções de uma refeição = a mesma refeição (pessoa + nome) com outro número, no dia mais
 * próximo. Assim "Opção 2 de 3" abre e troca mesmo em planos feitos antes do campo "alternativas".
 */
function opcoesPorRodizio(dias) {
  const reOp = /op[cç][aã]o\s*(\d+)\s*de\s*\d+/i;
  const porSlot = new Map();
  for (const d of dias) for (const [pid, ms] of Object.entries(d.refeicoes)) for (const m of ms) {
    const x = !m.alternativas && reOp.exec(m.opcoes || "");
    if (!x) continue;
    m.numero = +x[1];
    const k = `${pid}|${m.nome}`;
    if (!porSlot.has(k)) porSlot.set(k, []);
    porSlot.get(k).push({ data: d.data, m });
  }
  for (const lista of porSlot.values()) {
    const numeros = [...new Set(lista.map((o) => o.m.numero))].sort((a, b) => a - b);
    for (const it of lista) {
      const alts = numeros.filter((n) => n !== it.m.numero).map((n) => {
        const perto = lista.filter((o) => o.m.numero === n).sort((a, b) => Math.abs(difDias(it.data, a.data)) - Math.abs(difDias(it.data, b.data)))[0].m;
        const { id, alternativas, ...copia } = perto;
        return { ...copia, hora: it.m.hora };
      });
      if (alts.length) it.m.alternativas = alts;
    }
  }
}

/**
 * Recebe o JSON (objeto ou texto) e devolve { plano, erros, avisos }.
 * Se houver erros, o plano não deve ser publicado.
 */
export function normalizarPlano(entrada) {
  const erros = [];
  const avisos = [];
  let j = entrada;
  if (typeof j === "string") {
    try { j = JSON.parse(j); } catch (e) { return { plano: null, erros: [`O arquivo não é um JSON válido: ${e.message}`], avisos }; }
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { plano: null, erros: ["O conteúdo precisa ser um objeto JSON { ... }"], avisos };
  if (j.formato && !String(j.formato).startsWith("plano-familia/2")) erros.push(`Formato "${j.formato}" não suportado (esperado ${FORMATO})`);
  if (!j.formato) avisos.push(`Sem o campo "formato" — assumindo ${FORMATO}`);

  const pessoas = lista(j.pessoas).map((p, i) => normPessoa(p || {}, i, erros)).filter(Boolean);
  if (!pessoas.length) erros.push(`"pessoas" está vazio`);
  const ids = new Set();
  for (const p of pessoas) { if (ids.has(p.id)) erros.push(`Pessoa repetida: ${p.id}`); ids.add(p.id); }

  const tiposDeDia = { T: "Treino", D: "Descanso" };
  for (const [k, v] of Object.entries(j.tiposDeDia || {})) tiposDeDia[str(k, 8)] = str(v, 30);

  const modelos = {};
  for (const [k, v] of Object.entries(j.modelos || {})) if (v && typeof v === "object") modelos[k] = v;

  const conversoes = {};
  for (const [k, v] of Object.entries(j.conversoes || {})) if (Number.isFinite(+v) && +v > 0) conversoes[str(k, 80)] = +v;

  let diasIn = j.dias;
  if (diasIn && !Array.isArray(diasIn) && typeof diasIn === "object") diasIn = Object.entries(diasIn).map(([data, d]) => ({ data, ...d }));
  const dias = [];
  const vistos = new Set();
  for (const [i, d] of lista(diasIn).slice(0, 70).entries()) {
    const onde = `dias[${i}]${d && d.data ? ` (${d.data})` : ""}`;
    if (!d || !RE_DATA.test(d.data || "")) { erros.push(`${onde}: "data" inválida (use AAAA-MM-DD)`); continue; }
    if (vistos.has(d.data)) { erros.push(`${onde}: data repetida`); continue; }
    vistos.add(d.data);
    const tipo = {};
    for (const p of pessoas) tipo[p.id] = str(typeof d.tipo === "object" && d.tipo ? d.tipo[p.id] : d.tipo, 8) || "T";
    const refeicoes = {};
    for (const [pid, arr] of Object.entries(d.refeicoes || {})) {
      const id = slug(pid);
      if (!ids.has(id)) { erros.push(`${onde}: refeições para pessoa desconhecida "${pid}"`); continue; }
      const ms = lista(arr).slice(0, 15).map((m, k) => normRefeicao(m, modelos, `${onde} ${id} refeição ${k + 1}`, erros)).filter(Boolean);
      ms.sort((a, b) => a.hora.localeCompare(b.hora));
      const usados = {};
      for (const m of ms) {
        const base = `${m.hora.replace(":", "")}-${slug(m.nome)}`;
        usados[base] = (usados[base] || 0) + 1;
        m.id = usados[base] > 1 ? `${base}-${usados[base]}` : base;
      }
      refeicoes[id] = ms;
    }
    const seNaoTreinar = {};
    for (const [pid, t] of Object.entries(d.seNaoTreinar || {})) if (ids.has(slug(pid)) && str(t)) seNaoTreinar[slug(pid)] = str(t, 300);
    // contexto: um texto para todos ou { pessoa: texto }
    const contexto = {};
    for (const p of pessoas) contexto[p.id] = str(d.contexto && typeof d.contexto === "object" ? d.contexto[p.id] : d.contexto, 120);
    dias.push({
      data: d.data, tipo, contexto, destaque: str(d.destaque, 120),
      preparo: lista(d.preparo).map((s) => str(s, 500)).filter(Boolean),
      avisos: lista(d.avisos).map((a) => (a && typeof a === "object" ? { pessoa: slug(a.pessoa), titulo: str(a.titulo, 120), texto: str(a.texto, 1000), tom: TONS.includes(a.tom) ? a.tom : "alerta" } : null)).filter((a) => a && (a.titulo || a.texto)),
      seNaoTreinar, refeicoes,
    });
  }
  dias.sort((a, b) => a.data.localeCompare(b.data));
  if (!dias.length) erros.push(`"dias" está vazio`);
  opcoesPorRodizio(dias);

  const inicio = RE_DATA.test(j.inicio || "") ? j.inicio : dias[0]?.data;
  const fim = RE_DATA.test(j.fim || "") ? j.fim : dias[dias.length - 1]?.data;
  if (inicio && fim) {
    if (inicio > fim) erros.push(`"inicio" é depois de "fim"`);
    const total = difDias(inicio, fim) + 1;
    if (total > 70) erros.push(`O plano tem ${total} dias (máximo 70)`);
    const faltam = [];
    for (let k = 0; k < total && k < 70; k++) { const dd = somaDias(inicio, k); if (!vistos.has(dd)) faltam.push(ddmm(dd)); }
    if (faltam.length) avisos.push(`Dias sem cardápio: ${faltam.slice(0, 8).join(", ")}${faltam.length > 8 ? "…" : ""}`);
  }

  const testes = lista(j.testes).map((t) => (t && typeof t === "object" ? {
    pessoa: slug(t.pessoa), grupo: str(t.grupo, 80), alimento: str(t.alimento, 80), criterio: str(t.criterio, 1000), texto: str(t.texto, 1000),
    doses: lista(t.doses).filter((x) => x && RE_DATA.test(x.data || "")).map((x, k) => ({ data: x.data, n: k + 1, quantidade: str(x.quantidade, 40), refeicao: str(x.refeicao, 40), texto: str(x.texto, 300) })),
  } : null)).filter((t) => t && (t.grupo || t.alimento));

  const cmp = j.compras || {};
  const compras = {
    categorias: Object.fromEntries(Object.entries(cmp.categorias || {}).map(([k, v]) => [str(k, 80), str(v, 30)])),
    feitoEmCasa: {}, porDia: [], observacoes: lista(cmp.observacoes).map((s) => str(s, 400)).filter(Boolean),
  };
  for (const [k, arr] of Object.entries(cmp.feitoEmCasa || {})) {
    compras.feitoEmCasa[str(k, 80)] = lista(arr).map((it) => normItem(it, `compras.feitoEmCasa.${k}`, erros)).filter(Boolean);
  }
  for (const x of lista(cmp.porDia)) {
    const it = x && normItem(x.item || x, "compras.porDia", erros);
    if (it) compras.porDia.push({ pessoa: slug(x.pessoa), ...it });
  }

  const plano = {
    formato: FORMATO, titulo: str(j.titulo, 60) || (inicio ? `Plano de ${dataCurta(inicio)}` : "Plano"),
    subtitulo: str(j.subtitulo, 120), inicio, fim, pessoas, tiposDeDia, conversoes, dias, testes, compras,
    lotes: lista(j.lotes).map((l) => (l && typeof l === "object" ? { titulo: str(l.titulo, 80) || "Preparo em lote", quando: str(l.quando, 40), passos: lista(l.passos).map((s) => str(s, 500)).filter(Boolean) } : null)).filter((l) => l && l.passos.length),
    regras: lista(j.regras).map((s) => str(s, 400)).filter(Boolean),
    notas: lista(j.notas).map(normNota).filter(Boolean),
  };

  // conferência das somas contra as metas (só aviso)
  const fora = [];
  for (const d of dias) for (const p of pessoas) {
    const ms = d.refeicoes[p.id];
    if (!ms || !ms.length) continue;
    const alvo = metaDoDia(plano, p.id, d.tipo[p.id]).kcal;
    const tot = totais(ms).kcal;
    if (alvo && tot && Math.abs(tot - alvo) / alvo > 0.1) fora.push(`${p.nome} ${ddmm(d.data)}: ${tot} de ${alvo} kcal`);
  }
  if (fora.length) avisos.push(`Dias com soma de kcal mais de 10% longe da meta — ${fora.slice(0, 4).join("; ")}${fora.length > 4 ? ` (+${fora.length - 4})` : ""}`);

  return { plano: erros.length ? null : plano, erros: erros.slice(0, 40), avisos, rascunho: plano };
}

/** Tira o JSON de dentro de um texto: o próprio JSON, um bloco ```json``` ou um HTML com <script type="application/json" id="plano">. */
export function extrairJson(texto) {
  const t = String(texto || "").trim();
  if (t.startsWith("{")) return t;
  const tag = t.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (tag) return tag[1].trim();
  const bloco = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (bloco) return bloco[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

// ---------- consultas usadas pelas telas ----------
export const pessoaDe = (plano, id) => plano.pessoas.find((p) => p.id === id) || plano.pessoas[0];
export const diaDe = (plano, data) => plano.dias.find((d) => d.data === data) || null;

export function metaDoDia(plano, pid, tipo) {
  const p = plano.pessoas.find((x) => x.id === pid);
  if (!p) return { kcal: null, proteina: null };
  const k = p.metas.kcal;
  return { kcal: k[tipo] ?? k.T ?? k.padrao ?? Object.values(k)[0] ?? null, proteina: p.metas.proteina };
}

// ---------- busca: em que dias e refeições aparece um alimento ----------
const semAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** [{ data, pessoa, id, nome, hora, titulo, achou: [nomes de itens], opcao: nº da opção ou null }] na ordem dos dias. */
export function buscarNoPlano(plano, termo) {
  const t = semAcento(termo).trim();
  if (t.length < 2) return [];
  const out = [];
  for (const d of plano.dias) for (const p of plano.pessoas) for (const m of d.refeicoes[p.id] || []) {
    for (const [o, i] of [m, ...(m.alternativas || [])].map((o, i) => [o, i])) {
      const achou = o.itens.filter((it) => semAcento(it.nome).includes(t)).map((it) => it.nome);
      if (achou.length || semAcento(o.titulo).includes(t)) {
        out.push({ data: d.data, pessoa: p.id, id: m.id, nome: m.nome, hora: m.hora, titulo: o.titulo || o.nome, achou, opcao: i ? o.numero || i + 1 : null });
        break; // uma linha por refeição (a primeira opção que tem)
      }
    }
  }
  return out;
}

// ---------- análise: o que foi comido, comida × sintoma, resultado dos testes ----------
/** Nomes dos itens comidos no dia: refeições marcadas, na opção escolhida, sem o que ficou de fora. get(kind, mealId) → valor ou null. */
export function comidoNoDia(plano, data, pid, get) {
  const out = [];
  for (const m of diaDe(plano, data)?.refeicoes[pid] || []) {
    if (!get("eaten", m.id) || get("aceite", m.id) === "recusou") continue;
    const i = +(get("swap", m.id) || 0);
    const o = (i > 0 && m.alternativas?.[i - 1]) || m;
    let p = {};
    try { p = JSON.parse(get("partial", m.id) || "{}"); } catch (e) {}
    if (p.outra) continue;
    for (const it of o.itens) if (!(p.fora || []).includes(it.nome)) out.push(it.nome);
  }
  return out;
}

const NIVEL_SINTOMA = { leve: 1, moderado: 2, forte: 3 };
/**
 * Alimentos que aparecem mais nos dias com sintoma. Só um padrão para conversar com o Claude, não uma prova.
 * get(kind, data, mealId); sintomas: [{ day, nivel, hora }]. Um sintoma de manhã (antes das 12h) conta também para o dia anterior.
 * → [{ alimento, dias, comSintoma, semEle, semEleComSintoma }] (até 5, o mais forte primeiro)
 */
export function comidaXSintoma(plano, pid, get, sintomas, ate) {
  const ruins = new Set();
  for (const x of sintomas) if (NIVEL_SINTOMA[x.nivel]) { ruins.add(x.day); if (x.hora && x.hora < "12:00") ruins.add(somaDias(x.day, -1)); }
  const dias = plano.dias.filter((d) => d.data <= ate).map((d) => ({ data: d.data, comido: comidoNoDia(plano, d.data, pid, (k, id) => get(k, d.data, id)) })).filter((d) => d.comido.length);
  if (dias.length < 5 || !dias.some((d) => ruins.has(d.data))) return [];
  const grupos = new Map(); // 1ª palavra do nome: "Feijão carioca" e "Feijão preto" contam juntos
  for (const d of dias) for (const n of d.comido) {
    const k = slug(n).split("-")[0];
    if (!grupos.has(k)) grupos.set(k, { nome: n, dias: new Set() });
    const g = grupos.get(k);
    g.dias.add(d.data);
    if (n.length < g.nome.length) g.nome = n;
  }
  const out = [];
  for (const g of grupos.values()) {
    const com = g.dias.size, s = [...g.dias].filter((d) => ruins.has(d)).length;
    const sem = dias.length - com, ss = dias.filter((d) => !g.dias.has(d.data) && ruins.has(d.data)).length;
    if (com >= 3 && s >= 2 && sem >= 2 && s / com >= 0.5 && s / com - ss / sem >= 0.25) out.push({ alimento: g.nome, dias: com, comSintoma: s, semEle: sem, semEleComSintoma: ss, forca: s / com - ss / sem });
  }
  return out.sort((a, b) => b.forca - a.forca).slice(0, 5).map(({ forca, ...x }) => x);
}

/** Resultado de um teste de reintrodução pelas doses: "passou" | "leve" | "nao" | "andamento" | "sem". */
export function veredito(resultados, total) {
  const r = resultados.filter(Boolean);
  if (r.includes("forte")) return "nao";
  if (r.length < total) return r.length ? "andamento" : "sem";
  return r.includes("leve") ? "leve" : "passou";
}
export const VEREDITOS = { passou: "Passou", leve: "Passou com sintoma leve", nao: "Não passou", andamento: "Em andamento", sem: "Ainda não começou" };

/** Testes de todos os meses a partir do registro (k = "<alimento>-<dose>"): [{ alimento, doses: [{ n, dia, v }], veredito }]. */
export function historicoTestes(linhas) {
  const m = new Map();
  for (const l of linhas) {
    const x = /^(.*)-(\d+)$/.exec(l.k || "");
    if (!x) continue;
    if (!m.has(x[1])) m.set(x[1], []);
    m.get(x[1]).push({ n: +x[2], dia: l.day, v: l.v });
  }
  return [...m.entries()].map(([alimento, doses]) => {
    doses.sort((a, b) => a.n - b.n);
    return { alimento, doses, veredito: veredito(doses.map((d) => d.v), doses.length), ultima: doses[doses.length - 1].dia };
  }).sort((a, b) => (a.ultima < b.ultima ? 1 : -1));
}

// ---------- agenda de treino do Pulse (ponte, registro "pulse": "1|HH:MM|Nome" ou "0") ----------
/** { treino: true, hora, nome } | { treino: false } | null (sem informação do Pulse). */
export function lerAgendaPulse(v) {
  if (v == null) return null;
  const [t, hora = "", ...nome] = String(v).split("|");
  return t === "1" ? { treino: true, hora: /^\d{2}:\d{2}$/.test(hora) ? hora : "", nome: nome.join("|") } : { treino: false };
}
/** Tipo do dia seguindo o Pulse: dia de descanso lá vira "D"; treino lá num dia "D" do plano vira "T". */
export function tipoPeloPulse(tipo, agenda) {
  if (!agenda) return tipo;
  if (!agenda.treino) return "D";
  return tipo === "D" ? "T" : tipo;
}
const somaMin = (hm, n) => { const t = (+hm.slice(0, 2) * 60 + +hm.slice(3) + n + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
/** Pré-treino 1 h antes e pós-treino ~1h15 depois do horário de treino do Pulse; null se a refeição não é de treino. */
export function horaPeloPulse(m, horaTreino) {
  if (!horaTreino) return null;
  const n = slug(`${m.nome} ${m.titulo || ""}`);
  if (/pre-treino/.test(n)) return somaMin(horaTreino, -60);
  if (/pos-treino|shake-pos/.test(n)) return somaMin(horaTreino, 75);
  return null;
}

// ---------- água ----------
/** Meta de água do dia em ml: a do plano (metas.agua) ou 35 ml/kg do peso mais recente, entre 1,5 e 4 L; sem peso, 2 L. */
export function metaAgua(plano, pid, pesoKg) {
  const p = plano.pessoas.find((x) => x.id === pid);
  if (p?.metas.agua) return p.metas.agua;
  const kg = pesoKg || p?.peso?.atual;
  return kg ? Math.round(Math.min(4000, Math.max(1500, kg * 35)) / 250) * 250 : 2000;
}

// ---------- comer só parte da refeição ----------
// Densidade aproximada (kcal/g, proteína g/g) do alimento cru, pela 1ª palavra-chave que aparecer no nome.
// Só serve para repartir o total da refeição entre os itens: o resultado é reescalado para fechar com o plano.
const DENSIDADE = [
  ["azeite|oleo", 9, 0], ["manteiga", 7.2, 0.01], ["pasta-de-amendoim|amendoim|pacoca", 5.9, 0.25], ["castanha|nozes|amendoa", 6.2, 0.18],
  ["chocolate|sonho-de-valsa|bombom|ouro-branco|lollo|moranguete|bis", 5.3, 0.06], ["ninho", 4.9, 0.2],
  ["whey|beef-protein|proteina", 3.9, 0.78], ["creatina", 0, 0], ["toddy|nesquik|achocolatado", 3.8, 0.04],
  ["aveia", 3.9, 0.14], ["macarrao|massa", 3.7, 0.12], ["arroz", 3.6, 0.07], ["cuscuz|flocao|farinha", 3.6, 0.08], ["tapioca|goma", 3.4, 0],
  ["feijao", 3.3, 0.21], ["mel|geleia|acucar", 3, 0], ["queijo|mussarela", 3, 0.22], ["pao", 2.8, 0.09], ["requeijao", 1.8, 0.1],
  ["sobrecoxa", 2, 0.26], ["frango|peito", 1.6, 0.31], ["patinho|carne|maminha|musculo|acem|paleta|contrafile|file|blend", 1.6, 0.27],
  ["ovo", 1.4, 0.13], ["peixe|tilapia|salmao|atum", 1.3, 0.22], ["leite-fermentado", 0.7, 0.02], ["integral", 0.6, 0.032],
  ["leite", 0.35, 0.033], ["iogurte", 0.6, 0.04], ["batata", 0.8, 0.02], ["banana", 0.9, 0.012], ["kiwi", 0.6, 0.011],
  ["maca|laranja|suco|mamao|morango|fruta|melao|abacaxi|uva|manga", 0.45, 0.007],
  ["salada|folha|alface|cenoura|abobrinha|vagem|chuchu|tomate|brocolis|legume|pepino|repolho", 0.25, 0.012],
];
// shortcut: "un" vale 30 g e item sem quantidade 20 g; se ficar torto para algum alimento, o plano pode mandar kcal por item.
function gramas(it) { return it.qtd == null ? 20 : it.unid === "un" ? it.qtd * 30 : it.qtd; }
function densidade(nome) {
  const s = slug(nome);
  const d = DENSIDADE.find(([chaves]) => chaves.split("|").some((c) => s.includes(c)));
  return d ? [d[1], d[2]] : [1.5, 0.05];
}

/** kcal e proteína de cada item da refeição: o que o plano mandou ou a estimativa, fechando com o total da refeição. */
export function estimarItens(m) {
  const out = m.itens.map((it) => ({ kcal: it.kcal, proteina: it.proteina }));
  for (const [campo, i] of [["kcal", 0], ["proteina", 1]]) {
    const total = m[campo];
    const dado = out.reduce((s, x) => s + (x[campo] ?? 0), 0);
    const bruto = m.itens.map((it, k) => (out[k][campo] == null ? gramas(it) * densidade(it.nome)[i] : 0));
    const soma = bruto.reduce((a, b) => a + b, 0);
    const escala = total != null && soma > 0 ? Math.max(0, total - dado) / soma : 1;
    m.itens.forEach((_, k) => { if (out[k][campo] == null) out[k][campo] = bruto[k] * escala; });
  }
  return out;
}

/** Quanto foi comido da refeição: tira os itens de `fora` (nomes) e soma "outra coisa" (kcal aproximada). */
export function consumido(m, fora = [], outraKcal = 0) {
  if (!fora.length && !outraKcal) return { kcal: m.kcal, proteina: m.proteina, carbo: m.carbo, gordura: m.gordura };
  const est = estimarItens(m);
  let kcal = 0, proteina = 0;
  m.itens.forEach((it, k) => { if (!fora.includes(it.nome)) { kcal += est[k].kcal; proteina += est[k].proteina; } });
  const parte = m.kcal ? kcal / m.kcal : 0; // carbo e gordura acompanham a fração de kcal
  return { kcal: kcal + (Number(outraKcal) || 0), proteina, carbo: m.carbo == null ? null : m.carbo * parte, gordura: m.gordura == null ? null : m.gordura * parte };
}

export function totais(refeicoes) {
  const t = { kcal: 0, proteina: 0, carbo: 0, gordura: 0 };
  for (const m of refeicoes || []) for (const k in t) t[k] += m[k] || 0;
  for (const k in t) t[k] = Math.round(t[k]);
  return t;
}

/** "80g cru" de arroz → "≈200g cozido" (se houver conversão no plano). */
export function cozido(plano, it) {
  const f = plano.conversoes[it.nome];
  if (!f || it.qtd == null || it.unid !== "g") return "";
  return `≈${Math.round((it.qtd * f) / 5) * 5}g pronto`;
}

export function fmtQtd(q, u) {
  if (q == null) return u || "";
  const r = (x) => (Math.round(x * 10) / 10).toLocaleString("pt-BR");
  if (u === "g" && q >= 1000) return `${r(q / 1000)} kg`;
  if (u === "ml" && q >= 1000) return `${r(q / 1000)} L`;
  const n = Number.isInteger(q) ? q.toLocaleString("pt-BR") : r(q);
  return u === "g" || u === "ml" ? `${n}${u}` : `${n} ${u}`.trim();
}

export function testesDoDia(plano, data, pid) {
  const out = [];
  for (const t of plano.testes) for (const d of t.doses) if (d.data === data && (!pid || !t.pessoa || t.pessoa === pid)) out.push({ teste: t, dose: d });
  return out;
}

export function notasDe(plano, secao, pid) {
  return plano.notas.filter((n) => n.secao === secao && (!pid || !n.pessoa || n.pessoa === pid));
}

/** Semanas do plano (blocos de 7 dias a partir do início). */
export function semanas(plano) {
  const out = [];
  if (!plano.inicio) return out;
  const total = difDias(plano.inicio, plano.fim) + 1;
  for (let i = 0; i < total; i += 7) out.push({ n: out.length + 1, de: somaDias(plano.inicio, i), ate: somaDias(plano.inicio, Math.min(i + 6, total - 1)) });
  return out;
}

/** Lista de compras somada no período, por categoria. */
/** opcao(data, pessoa, idDaRefeicao) → nº da opção trocada (0 = a do plano): "seguir trocas" na lista. Sem ela, vale o plano. */
export function listaDeCompras(plano, de, ate, pid, opcao) {
  const acc = new Map();
  const soma = (nome, qtd, unid) => {
    const k = `${nome}|${unid}`;
    const cur = acc.get(k) || { nome, unid, qtd: 0, semQtd: false };
    if (qtd == null) cur.semQtd = true; else cur.qtd += qtd;
    acc.set(k, cur);
  };
  for (const d of plano.dias) {
    if (d.data < de || d.data > ate) continue;
    for (const p of plano.pessoas) {
      if (pid && pid !== p.id) continue;
      for (const m of d.refeicoes[p.id] || []) {
        const i = opcao ? +opcao(d.data, p.id, m.id) || 0 : 0;
        for (const it of ((i > 0 && m.alternativas?.[i - 1]) || m).itens) soma(it.nome, it.qtd, it.unid);
      }
      for (const x of plano.compras.porDia) if (!x.pessoa || x.pessoa === p.id) soma(x.nome, x.qtd, x.unid);
    }
  }
  // produtos feitos em casa viram os ingredientes que vão para o carrinho
  for (const [prod, ings] of Object.entries(plano.compras.feitoEmCasa)) {
    for (const [k, v] of [...acc]) {
      if (v.nome !== prod) continue;
      acc.delete(k);
      for (const ing of ings) soma(ing.nome, ing.qtd == null ? null : v.qtd * ing.qtd, ing.unid);
    }
  }
  const cats = new Map();
  for (const v of acc.values()) {
    const c = plano.compras.categorias[v.nome] || "Outros";
    if (!cats.has(c)) cats.set(c, []);
    const qtd = v.unid === "un" ? Math.ceil(v.qtd) : Math.round(v.qtd);
    cats.get(c).push({ nome: v.nome, qtd: v.semQtd && !v.qtd ? null : qtd, unid: v.unid, chave: slug(`${v.nome}-${v.unid}`) });
  }
  const ordem = ["Açougue", "Peixaria", "Hortifruti", "Laticínios", "Padaria", "Mercearia", "Congelados", "Suplementos", "Farmácia", "Outros"];
  return [...cats.entries()]
    .sort((a, b) => ((ordem.indexOf(a[0]) + 1 || 99) - (ordem.indexOf(b[0]) + 1 || 99)) || a[0].localeCompare(b[0]))
    .map(([categoria, itens]) => ({ categoria, itens: itens.sort((a, b) => a.nome.localeCompare(b.nome)) }));
}

/** Custo da lista com os preços que a Cesta mandou (R$ por g, ml ou un do item da dieta, chave "nome|unid" em slug).
 *  → { total, comPreco, itens } — itens sem preço (ou sem quantidade) ficam de fora do total. */
export function custoDaLista(cats, precos) {
  let total = 0, comPreco = 0, itens = 0;
  for (const c of cats) for (const it of c.itens) {
    itens++;
    const p = precos?.[`${slug(it.nome)}|${it.unid}`];
    if (p > 0 && it.qtd != null) { total += p * it.qtd; comPreco++; }
  }
  return { total: Math.round(total * 100) / 100, comPreco, itens };
}

/** Preparo em lote: os itens da semana que o texto do lote cita (ex.: "cozinhe o arroz") com o total cru e pronto. */
export function quantidadesDoLote(plano, lote, de, ate) {
  const texto = ` ${semAcento([lote.titulo, ...lote.passos].join(" ")).replace(/[^a-z0-9]+/g, " ")} `;
  const out = [];
  for (const { itens } of listaDeCompras(plano, de, ate)) for (const it of itens) {
    // qualquer palavra do nome com 4+ letras: "Peito de frango" entra por "asse o frango"
    if (it.qtd == null || !slug(it.nome).split("-").some((w) => w.length >= 4 && new RegExp(` ${w}s? `).test(texto))) continue;
    out.push({ nome: it.nome, qtd: it.qtd, unid: it.unid, pronto: cozido(plano, it) });
  }
  return out;
}

/** "cozinhe por 20 min" → 20 (o primeiro tempo em minutos do passo, para o temporizador). */
export function minutosDoPasso(t) {
  const m = /(\d{1,3})\s*(?:a\s*\d{1,3}\s*)?(?:min|minutos)\b/i.exec(String(t));
  return m ? +m[1] : null;
}

/** Agenda compacta que o cron do Worker usa para as notificações. */
export function agenda(plano) {
  const persons = Object.fromEntries(plano.pessoas.map((p) => [p.id, p.nome]));
  const days = {};
  for (const d of plano.dias) {
    const meals = {};
    for (const [pid, ms] of Object.entries(d.refeicoes)) {
      meals[pid] = ms.map((m) => ({
        t: m.hora, name: m.nome, pre: m.titulo, sub: "", kcal: m.kcal,
        items: m.itens.map((it) => [it.nome.toLowerCase(), fmtQtd(it.qtd, it.unid)].filter(Boolean).join(" ")),
        key: m.id,
      }));
    }
    const p0 = plano.pessoas[0];
    const testes = plano.testes.flatMap((t) => t.doses.filter((x) => x.data === d.data).map((x) => ({ pessoa: t.pessoa, alimento: t.alimento || t.grupo, n: x.n, k: `${t.alimento || t.grupo}-${x.n}`, quantidade: x.quantidade, refeicao: x.refeicao })));
    days[d.data] = { wd: DIAS_SEMANA[diaSemana(d.data)], label: p0 ? plano.tiposDeDia[d.tipo[p0.id]] || "" : "", meals, testes };
  }
  return { title: plano.titulo, method: "json", persons, days };
}
