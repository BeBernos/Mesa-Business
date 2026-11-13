# Estudo de caso — Mesa

*[Read in English](case-study.md)*

**Papel:** produto, UX e engenharia, de ponta a ponta · **Período:** out/2026 – hoje, 10 versões · **Usuários:** uma
família de verdade (dois adultos com planos diferentes e uma criança), todo dia

## O problema

A dieta da família era um documento HTML longo, escrito todo mês com um assistente de IA: três pessoas, metas de calorias
diferentes, dias de treino e de descanso, um protocolo de reintrodução de alimentos, uma lista de compras. Ótimo no
computador, inútil na cozinha. Ninguém sabia às 7 da manhã qual era a porção, a lista de compras era redigitada à mão e o
plano do mês seguinte era escrito de memória — a IA nunca via o que foi comido de verdade.

## Objetivos

- Responder "o que eu como agora, e quanto?" num relance, para cada pessoa, no próprio celular.
- Manter a IA como assistente da nutrição — mas alimentada com dados reais em vez de impressões.
- Uma lista de compras só para a casa, usada por duas pessoas no mesmo mercado.
- Custo zero, sem API paga de IA, nada que a família precise manter.

## Decisões principais

| Decisão | Por quê | Custo |
|---|---|---|
| **O plano é um contrato JSON escrito pela IA**, interpretado por um motor único | Mês novo não exige versão nova do app; a IA não consegue produzir algo que o app não entenda | O contrato evolui com cuidado → toda mudança atualiza validador, prompt, exemplo e testes juntos |
| **Conector MCP em vez de API paga** | O Claude do próprio usuário lê o mês e publica o próximo plano; sem conta de API, sem automatizar a conta do claude.ai | Publicar exige um "sim" humano → rascunho em partes, validação, resumo e só então publicação |
| **Registro de eventos em vez de documentos** | "Comi só parte", trocas, sintomas e compras são todos eventos → sincronização, fila offline e análises saem de um modelo só | "Vence a última gravação" por chave: bom para uma família, não para um hospital |
| **Perguntar, não insistir** | Dado de adesão só vale se as pessoas anotam; perguntas respondidas na própria notificação deixam o atrito perto de zero | Limites rígidos (2 por dia, nunca de noite, nunca repetida) e um botão para desligar |
| **Visão da criança sem calorias** | Contar calorias para criança é o sinal errado | "Comeu bem / pouco / recusou" vira o dado que a IA usa para ajustar as refeições dela |

## O que saiu

- O plano do mês chega em todos os celulares no minuto em que a IA publica; os avisos de refeição pulam o que já foi comido.
- O próximo plano da IA nasce da adesão, das sobras ("deixou 40 g de arroz no jantar três dias seguidos"), das trocas, dos
  padrões de sintoma, do peso vindo do app de treino e do custo da semana vindo do app de mercado.
- A lista de compras segue as refeições escolhidas de fato, sabe o que já tem na despensa e quanto custa.
- Efeito de conjunto: Mesa, o app de treino (Pulse) e o de mercado (Cesta) trocam dados por ligações privadas entre
  Workers, e cada um continua pequeno.

## O que eu faria a seguir

OAuth no conector MCP se o link um dia precisar circular; uma versão white-label em que uma nutricionista publica planos
para várias famílias a partir do mesmo contrato.
