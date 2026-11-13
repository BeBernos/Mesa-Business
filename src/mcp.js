// Conector MCP para o Claude (claude.ai → Configurações → Conectores → Adicionar conector personalizado).
// Transporte "Streamable HTTP" no modo mais simples: cada POST traz uma mensagem JSON-RPC e a resposta é JSON
// (sem SSE e sem sessão — não precisamos de notificações do servidor).
import exemplo from "../docs/exemplo-plano.json" with { type: "json" };

const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const INSTRUCOES = `Este conector é a Mesa, o app de dieta da família (Rafael, Marina e Theo).
Para montar o plano novo:
1. Chame contexto_da_familia (feedback, peso, adesão, testes, diário) e, se for continuar o plano, plano_atual.
2. Chame formato_do_plano para ver as regras e um exemplo válido.
3. iniciar_rascunho com o cabeçalho (sem "dias"), depois adicionar_dias em blocos de até 7 dias.
4. publicar_rascunho com so_validar=true, mostre o resumo ao Rafael e só publique (so_validar=false) depois que ele confirmar.
Ao publicar, os celulares da família são avisados na hora.`;

export const REGRAS = `Formato "plano-familia/2" (JSON). Regras:
- Datas AAAA-MM-DD, horas HH:MM (24h, São Paulo). Um item de "dias" para cada data de "inicio" a "fim".
- Pessoas com ids fixos: rafael, marina, theo. "metas.kcal" por tipo de dia ({"T":2400,"D":2200}) ou um número; "metas.agua" (ml por dia) é opcional — sem ela, a Mesa usa 35 ml/kg. "crianca": true (opcional; o Theo já é) troca as calorias por "comeu bem / pouco / recusou" — no contexto vem como aceitacaoCrianca.
- Item de refeição: ["Nome", quantidade, "unidade"] ou ["Nome", qtd, "unid", "obs"]; unidades g, ml ou un; SEMPRE peso cru.
  Use o mesmo nome para o mesmo alimento no plano todo (a lista de compras soma pelo nome).
  Item também pode ser objeto {"nome","qtd","unid","kcal","proteina"}: kcal/proteína por item são opcionais e deixam exato o
  "comi só parte" (sem eles, a Mesa estima). Vale mandar nos itens que mais pesam (arroz, carne, azeite, pasta de amendoim).
- Toda refeição: hora, nome (o momento: "Café da manhã", "Almoço"...), titulo (o prato), kcal e proteina (números), itens.
  Opcionais: carbo, gordura, nota, familia (true = mesma comida da família, só muda a porção), tipo (cafe|almoco|jantar|lanche|ceia|treino).
- "modelos" define refeições que se repetem; use {"hora":"07:00","modelo":"id"}. "alternativas": ["id", ...] dá outras opções
  para o mesmo horário (a pessoa troca no app; as calorias acompanham; a lista de compras segue a principal).
- A soma do dia de cada pessoa deve ficar a ±5% da meta do tipo de dia.
- Todo nome de item deve estar em compras.categorias (Açougue, Hortifruti, Laticínios, Padaria, Mercearia, Congelados, Suplementos).
- Teste de reintrodução: o alimento entra como item da refeição do dia, aparece em "testes" e num "avisos" do dia.
- Textos (notas, avisos, regras): parágrafos curtos, **negrito** no essencial, sem HTML. notas.secao: "saude" (aba Saúde da
  pessoa) ou "plano" (aba Semana). tom: info | alerta | ok.
- Nada de verde em nenhum campo de cor (pode omitir "cor").
- "contexto" do dia pode ser um texto ou {pessoa: texto}; "seNaoTreinar": {pessoa: ajuste} mostra o botão "Treinou hoje?".`;

export const exemploDoFormato = () => exemplo;

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const erro = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function tratar(m, ferramentas) {
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return erro(m?.id ?? null, -32600, "Requisição inválida");
  if (m.id === undefined || m.id === null) return null; // notificação (ex.: notifications/initialized): sem resposta
  switch (m.method) {
    case "initialize":
      return ok(m.id, {
        protocolVersion: VERSOES.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mesa", title: "Mesa", version: "1.0.0" },
        instructions: INSTRUCOES,
      });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: ferramentas.map(({ run, ...t }) => t) });
    case "tools/call": {
      const f = ferramentas.find((t) => t.name === m.params?.name);
      if (!f) return erro(m.id, -32602, `Ferramenta desconhecida: ${m.params?.name}`);
      try {
        const r = await f.run(m.params.arguments || {});
        return ok(m.id, { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }], isError: false });
      } catch (e) {
        // erro de ferramenta volta como resultado, para o Claude ler e corrigir (ex.: lista de erros do plano)
        return ok(m.id, { content: [{ type: "text", text: e.message }], isError: true });
      }
    }
    default:
      return erro(m.id, -32601, `Método não suportado: ${m.method}`);
  }
}

/** Atende uma requisição HTTP do conector. `ferramentas`: [{ name, title, description, inputSchema, annotations, run(args) }]. */
export async function responderMcp(req, ferramentas) {
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Conector MCP da Mesa: use POST.", { status: 405, headers: { allow: "POST, DELETE" } });
  let msg;
  try { msg = await req.json(); } catch (e) { return Response.json(erro(null, -32700, "JSON inválido"), { status: 400 }); }
  const lote = Array.isArray(msg);
  const respostas = (await Promise.all((lote ? msg : [msg]).map((m) => tratar(m, ferramentas)))).filter(Boolean);
  if (!respostas.length) return new Response(null, { status: 202 });
  return Response.json(lote ? respostas : respostas[0], { headers: { "cache-control": "no-store" } });
}
