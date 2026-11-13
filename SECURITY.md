# Security

*[Português abaixo](#segurança-resumo-em-português)*

Mesa holds a family's meals, body weight and health notes. The design goal: **only the family's devices and the
family's own AI assistant can read or change anything**, with no third-party services in between.

## Threat model

| Threat | Mitigation |
|---|---|
| Someone finds the app's address | Every API route needs a device cookie created with the family password (checked in constant time). Without it the app shows only the login screen. |
| A phone is lost or left unlocked | A sliding 4-hour session sits on top of the device cookie: after 4 hours without use the API answers `423 Locked` and the app asks for a **passkey** (WebAuthn, challenge and signature verified on the server) or the password. Notification actions ("Ate it", "15 min") stay available. |
| Cross-site request forgery | `SameSite=None; Secure; Partitioned; HttpOnly` cookies plus an `Origin` check on every write. |
| Clickjacking | `frame-ancestors` allows only the companion training app, which embeds Mesa on purpose. |
| The AI connector link leaks | The MCP endpoint is a long random secret stored server-side; "Generate another" revokes the old one instantly. Publishing a plan always takes a validation step and the user's confirmation in the conversation. |
| Push service reading messages | Web Push payloads are encrypted end to end (RFC 8291, `aes128gcm`) with VAPID authentication. |
| Other apps of the suite | Pulse and Cesta reach Mesa only through private service bindings (no public route); each method accepts a fixed set of record kinds and validated fields. |

## Data minimisation

- The grocery app receives only `{ category, name, quantity, unit }` of the diet's shopping list and sends back only
  `{ name, unit, price }` — no meals, weight or health data.
- Receipts, documents and personal identifiers are never stored.

## Reporting

Please open a private security advisory on GitHub or contact the author through [github.com/BeBernos](https://github.com/BeBernos).

---

## Segurança (resumo em português)

A Mesa guarda refeições, peso e anotações de saúde de uma família. O objetivo: **só os aparelhos da família e o assistente
de IA da própria família leem ou mudam algo**, sem serviços de terceiros no meio.

- **Endereço descoberto:** toda rota da API exige o cookie do aparelho, criado com a senha da família.
- **Celular perdido ou destravado:** depois de 4 horas sem uso a API responde `423` e o app pede a **passkey** (WebAuthn
  conferido no servidor) ou a senha; os botões das notificações continuam funcionando.
- **Requisição forjada e moldura:** cookies `SameSite=None; Secure; Partitioned; HttpOnly`, checagem de `Origin` nas
  gravações e `frame-ancestors` só para o app de treino parceiro.
- **Link do conector vazado:** segredo longo guardado no servidor; "Gerar outro" desliga o anterior na hora; publicar
  sempre passa por validação e confirmação.
- **Notificações:** criptografia de ponta a ponta (RFC 8291) com VAPID.
- **Apps do conjunto:** Pulse e Cesta só chegam à Mesa por ligações privadas entre Workers, com tipos e campos conferidos;
  a Cesta recebe só a lista de compras e devolve só preços.
