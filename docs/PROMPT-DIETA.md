# Como pedir a dieta do mês ao Claude

> **Jeito mais fácil:** ligue o **conector Mesa** no Claude (Mesa → Ajustes → Claude). Aí basta pedir "monte a dieta do mês que vem": o Claude lê o feedback e o histórico, monta, valida e publica sozinho — sem colar este texto nem subir arquivo. O texto abaixo é para quando não houver conector.

Na conversa em que você monta a dieta, cole o bloco abaixo **depois** de explicar o que quer para o mês: metas, mudanças, testes e preferências. O Claude devolve um arquivo `.json`. No celular, abra o app → ⚙ → **Atualizar plano** e escolha o arquivo, ou compartilhe o arquivo direto com o app.

O app confere tudo antes de publicar. Se algo estiver errado, ele mostra a lista de erros e um botão **Copiar erros** para você colar de volta na conversa.

---

## ✂️ Copie a partir daqui

> **Entrega do plano para o app da família.** Além de montar a dieta, entregue o resultado como **um arquivo `plano-AAAA-MM.json`** no formato `plano-familia/2` descrito abaixo. **Gere o arquivo com código (Python)**: monte as estruturas em laços (dias × pessoas × refeições), confira as somas e salve o JSON para download. Não escreva o JSON à mão. Não precisa gerar HTML: o app desenha tudo a partir desses dados.
>
> **Regras gerais**
> - JSON válido, UTF-8, chaves exatamente como abaixo. Datas `AAAA-MM-DD`, horas `HH:MM` (24h, horário de São Paulo).
> - Quantidades **sempre em peso cru**. Unidades: `g`, `ml` ou `un`.
> - Um item é `["Nome", quantidade, "unidade"]` ou `["Nome", quantidade, "unidade", "observação"]`. Também pode ser objeto `{"nome": "Arroz", "qtd": 80, "unid": "g", "kcal": 288, "proteina": 6}`: kcal e proteína **por item** são opcionais, mas deixam exato o "comi só parte" do app (vale nos itens que mais pesam). Use o **mesmo nome** para o mesmo alimento em todo o plano, porque a lista de compras soma pelo nome.
> - `kcal` e `proteina` de cada refeição precisam ser números. Opcionais: `carbo` e `gordura` (g). Some as refeições do dia e confira contra a meta (tolerância de ±5%).
> - **Não use verde em nada** (nem no campo `cor` das pessoas). O app recusa cores verdes. Pode omitir `cor`: o app já tem a paleta da família.
> - Um alimento de teste (FODMAP etc.) entra como **item da refeição** do dia do teste. Também deve aparecer em `testes` e, de preferência, num `avisos` do dia.
>
> **Estrutura**
> ```
> {
>   "formato": "plano-familia/2",
>   "titulo": "Novembro 2026",                    // curto: aparece no topo do app
>   "subtitulo": "Ciclo 4 · recomposição",        // opcional
>   "inicio": "2026-10-26", "fim": "2026-11-22",  // um dia em "dias" para cada data do período
>   "pessoas": [{
>     "id": "rafael", "nome": "Rafael",             // ids fixos: rafael, marina, theo
>     "resumo": "Recompor sem forçar comida",     // 1 linha
>     "detalhe": "2.400 treino / 2.200 descanso · 150g de proteína",
>     "metas": { "kcal": { "T": 2400, "D": 2200, "X": 2400 }, "proteina": 150, "agua": 3000 },   // kcal por tipo de dia, ou um número só; "agua" em ml (opcional; sem ela, 35 ml/kg)
>     "peso": { "atual": 83.8, "data": "2026-10-17", "meta": "83–84 kg", "historico": [["2026-09-20", 84.2]] },  // opcional
>     "suplementos": ["Ômega 3 2×/dia"], "restricoes": ["Alergia a ovo"],
>     "crianca": false   // opcional; true = a Mesa marca "comeu bem / pouco / recusou" em vez de calorias (o Theo já é tratado como criança)           // opcionais
>   }],
>   "tiposDeDia": { "T": "Treino", "D": "Descanso", "X": "Treino 5h" },
>   "conversoes": { "Arroz": 2.5, "Feijão": 2.2, "Macarrão": 2.2 },    // cru → pronto (o app mostra "≈200g pronto")
>   "modelos": {                                  // opcional: refeições que se repetem, definidas uma vez
>     "shake-banana": { "nome": "Café da manhã", "titulo": "Shake de banana com aveia", "opcoes": "Opção 1 de 3",
>                       "kcal": 531, "proteina": 43, "itens": [["Whey Protein", 30, "g"], ["Banana", 100, "g"]] }
>   },
>   "dias": [{
>     "data": "2026-10-26",
>     "tipo": { "rafael": "T", "marina": "T", "theo": "T" },          // ou só "T" para todos
>     "contexto": { "rafael": "Treino 5h · escritório", "marina": "Treino à tarde" },   // 1 linha sobre o dia, por pessoa (ou um texto só)
>     "destaque": "Dia do preparo em lote",                           // opcional
>     "preparo": ["Tempere o frango…", "Grelhe 4–5 min de cada lado…"],   // passos de cozinha do dia (modo cozinha)
>     "avisos": [{ "pessoa": "rafael", "tom": "alerta", "titulo": "Teste · Alho · dose 1/3", "texto": "Hoje entra **alho 2g** no jantar." }],
>     "seNaoTreinar": { "marina": "Sem treino: tire 25g cru de arroz do jantar." },   // opcional: aparece o botão "Treinou hoje?"
>     "refeicoes": {
>       "rafael": [
>         { "hora": "07:00", "modelo": "shake-banana", "alternativas": ["shake-morango", "iogurte-mamao"] },  // modelo + outras opções
>         { "hora": "13:00", "nome": "Almoço", "titulo": "Peito de frango grelhado", "familia": true,
>           "kcal": 704, "proteina": 54, "itens": [["Peito de frango", 100, "g"], ["Arroz", 80, "g"]],
>           "nota": "Inclui o shake pós-treino" }
>       ],
>       "marina": [ … ], "theo": [ … ]
>     }
>   }],
>   "lotes": [{ "titulo": "Domingo · preparo em lote", "quando": "DOM", "passos": ["…"] }],
>   "compras": {
>     "categorias": { "Peito de frango": "Açougue", "Banana": "Hortifruti", "Arroz": "Mercearia" },   // todo item usado
>     "feitoEmCasa": { "Pão caseiro": [["Farinha de trigo", 0.909, "g"], ["Sal", 0.018, "g"]] },      // fator por 1 unidade do produto
>     "porDia": [{ "pessoa": "rafael", "item": ["Ômega 3", 2, "un"] }],                                  // consumo diário fora das refeições
>     "observacoes": ["Tudo em peso **cru**."]
>   },
>   "testes": [{ "pessoa": "rafael", "grupo": "Frutano (alho)", "alimento": "Alho fresco", "criterio": "**Passou:** …",
>                "doses": [{ "data": "2026-10-27", "quantidade": "2g", "refeicao": "Jantar", "texto": "alho 2g no tempero" }] }],
>   "regras": ["**Pese sempre cru.** …"],                                        // lembretes curtos, aparecem no fim do dia
>   "notas": [{ "secao": "saude", "pessoa": "rafael", "tom": "alerta", "titulo": "…", "texto": "…" }]
> }
> ```
>
> **Campos de refeição**
> - `nome`: o momento ("Café da manhã", "Almoço", "Lanche da tarde", "Jantar", "Ceia", "Pré-treino").
> - `titulo`: o prato ("Peito de frango grelhado").
> - `familia: true` quando é a mesma comida da família, que só muda a porção.
> - `alternativas`: as **outras opções** para aquele horário (ids de `modelos` ou refeições completas). No app, a pessoa toca e troca a opção do dia; as calorias acompanham. A lista de compras segue a opção principal. Não precisa escrever "Opção 1 de 3": o app numera sozinho.
> - `nota`: 1 frase.
> - `tipo` (opcional): `cafe`, `almoco`, `jantar`, `lanche`, `ceia` ou `treino`. Escolhe o ícone; sem ele, o app deduz pelo nome.
>
> **Textos**
> - `notas` são os textos explicativos (o porquê das mudanças, saúde, intestino, Theo, alertas).
> - `secao`: `"saude"` aparece na aba Saúde da pessoa; `"plano"` aparece em Semana, em "Por que o plano é assim".
> - `tom`: `info`, `alerta` ou `ok`.
> - Escreva em parágrafos curtos, separados por linha em branco, com `**negrito**` no essencial. Nada de HTML.
>
> **Antes de entregar, confira com o código**
> 1. Todas as datas de `inicio` a `fim` estão em `dias`.
> 2. Toda refeição tem `hora`, `nome`, `kcal`, `proteina` e `itens`.
> 3. A soma do dia de cada pessoa está a ±5% da meta do tipo de dia.
> 4. Todo nome de item aparece em `compras.categorias`.
> 5. O JSON abre sem erro com `json.loads`.
>
> Ao final, mostre um resumo: dias, refeições por pessoa e médias de kcal/proteína contra a meta.

## ✂️ Até aqui

---

Exemplo completo e válido: [`exemplo-plano.json`](exemplo-plano.json). O validador que o app usa está em `public/js/plan.js` (`normalizarPlano`).
