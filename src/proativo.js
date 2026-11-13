// Mesa proativa: o app nota o que falta e pergunta na hora certa, com resposta direto na notificação.
// Função pura (testada): recebe os fatos do dia de uma pessoa e devolve as perguntas daquele minuto.
// Cada resposta já leva as gravações prontas ("ops" do registro) — o service worker só repassa.
// Limites (no Worker): no máximo 2 por pessoa por dia, cada pergunta uma vez por dia, só nos horários abaixo.

export const HORARIOS = ["10:00", "10:30", "15:30", "19:00", "20:00", "21:00"];

const somaDias = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const difDias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const lerJson = (v) => { try { return JSON.parse(v); } catch (e) { return {}; } };

/**
 * f: { hm "HH:MM", dow (0 = domingo), hoje, pid, nome, refeicoes: [{ t, name, key }] (as de hoje),
 *      linhas: [{ kind, day, k, v }] (registro da pessoa, últimos dias), testes: [{ alimento, n, k, data }] (doses de ontem e anteontem),
 *      testesHoje: [{ alimento, n, quantidade, refeicao }] (doses de hoje),
 *      ultimaSumido: data da última pergunta "sumido" ou null }
 */
export function perguntasDoMomento(f) {
  const { hm, dow, hoje, pid, nome } = f;
  const ontem = somaDias(hoje, -1);
  const tem = (kind, day, k) => f.linhas.some((l) => l.kind === kind && l.day === day && (k === undefined || l.k === k));
  const op = (kind, day, k, v) => ({ kind, day, person: pid, k, v });
  const pergunta = (id, title, body, respostas, url = "/?aba=saude") => ({ id, payload: { kind: "pergunta", title, body, tag: `pro-${id}-${hoje}`, url, respostas } });
  const out = [];

  if (hm === "10:00") {
    const sintoma = f.linhas.find((l) => l.kind === "symptom" && l.day === ontem && ["leve", "moderado", "forte"].includes(lerJson(l.v).nivel));
    if (sintoma && !tem("checkin", hoje, "estomago")) {
      out.push(pergunta("estomago", `E o estômago hoje, ${nome}?`, `Ontem você anotou: “${lerJson(sintoma.v).texto || "um sintoma"}”. Melhorou?`, [
        { titulo: "👍 Melhorou", ops: [op("checkin", hoje, "estomago", "melhor")] },
        { titulo: "👎 Ainda não", ops: [op("checkin", hoje, "estomago", "pior")], abrir: "/?aba=saude" },
      ]));
    }
  }

  if (hm === "10:00" && f.testesHoje?.length) {
    const t = f.testesHoje[0];
    const quanto = [t.quantidade, t.refeicao && `no ${t.refeicao.toLowerCase()}`].filter(Boolean).join(", ");
    out.push(pergunta("dose", `Hoje tem teste: ${t.alimento.toLowerCase()}`, `Dose ${t.n}${quanto ? ` · ${quanto}` : ""}. Amanhã a Mesa pergunta como foi.`, [
      { titulo: "Ver o teste", abrir: "/?aba=saude" },
    ]));
  }

  if (hm === "10:30") {
    const resultado = (t) => f.linhas.find((l) => l.kind === "test" && l.day === t.data && l.k === t.k)?.v;
    const dose24 = f.testes.find((t) => t.data === ontem && !resultado(t));
    const dose48 = f.testes.find((t) => t.data === somaDias(hoje, -2) && (!resultado(t) || resultado(t) === "ok"));
    const t = dose24 || dose48;
    if (t) {
      out.push(pergunta("teste", dose24 ? `Alguma reação ao ${t.alimento.toLowerCase()}?` : `48 h depois do ${t.alimento.toLowerCase()}: tudo certo?`,
        `Dose ${t.n} do teste. Gás leve sozinho não reprova.`, [
          { titulo: "✅ Nenhuma reação", ops: [op("test", t.data, t.k, "ok")] },
          { titulo: "Tive reação", abrir: "/?aba=saude" },
        ]));
    }
  }

  if (hm === "15:30") {
    const ateAgora = f.refeicoes.filter((m) => m.t <= "15:00" && m.key);
    if (ateAgora.length && !f.linhas.some((l) => l.kind === "eaten" && l.day === hoje)) {
      out.push(pergunta("dia", `Como está indo o dia, ${nome}?`, "Ainda não marcou nenhuma refeição hoje.", [
        { titulo: "✅ Comi tudo certo", ops: ateAgora.map((m) => op("eaten", hoje, m.key, "1")) },
        { titulo: "Abrir a Mesa", abrir: "/?aba=hoje" },
      ], "/?aba=hoje"));
    }
  }

  if (hm === "19:00") {
    const recente = f.linhas.some((l) => l.day >= ontem);
    if (!recente && (!f.ultimaSumido || difDias(f.ultimaSumido, hoje) >= 3)) {
      out.push(pergunta("sumido", `Tudo bem por aí, ${nome}?`, "Faz uns dias que a Mesa não tem notícias. Como você está se sentindo?", [
        { titulo: "👍 Bem", ops: [op("checkin", hoje, "geral", "bem")] },
        { titulo: "👎 Não muito", ops: [op("checkin", hoje, "geral", "mal")], abrir: "/?aba=saude" },
      ]));
    }
  }

  if (hm === "20:00" && dow === 0 && !f.linhas.some((l) => l.kind === "feedback" && l.k === "semana" && l.day >= somaDias(hoje, -6))) {
    out.push(pergunta("semana", "Fecha a semana? Leva 1 minuto", "O que funcionou, o que não funcionou e o que mudar — é o que o Claude lê no próximo plano.", [
      { titulo: "Fechar agora", abrir: "/?aba=saude&fechamento=1" },
    ], "/?aba=saude&fechamento=1"));
  }

  if (hm === "21:00" && !tem("feedback", hoje, "dia") && !tem("checkin", hoje, "dia")) {
    out.push(pergunta("noite", `Como foi o dia, ${nome}?`, "Energia, fome e intestino: 10 segundos que ajudam o próximo plano.", [
      { titulo: "👍 Foi bem", ops: [op("checkin", hoje, "dia", "bom")] },
      { titulo: "👎 Foi difícil", ops: [op("checkin", hoje, "dia", "ruim")], abrir: "/?aba=saude" },
    ]));
  }
  return out;
}
