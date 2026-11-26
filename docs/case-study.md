# Case study — Mesa

*[Leia em português](case-study.pt-BR.md)*

**Role:** product, UX and engineering, end to end · **Period:** Oct 2026 – today, 22 releases · **Users:** a real family
(two adults on different plans, one child), every day

## The problem

The family's diet was a long HTML document written every month with an AI assistant: three people, different calorie
targets, training and rest days, a food-reintroduction protocol, a shopping list. It was excellent on a laptop and useless
in the kitchen. Nobody knew at 7 a.m. what the portions were, the shopping list was retyped by hand, and the next month's
plan was written from memory — the AI never saw what was actually eaten.

## Goals

- Answer "what do I eat now, and how much?" in one glance, for each person, on their own phone.
- Keep the AI as the nutritionist's assistant — but feed it real data instead of impressions.
- One shopping list for the household, usable by two people in the same store.
- Zero running cost, no paid AI API, nothing the family has to maintain.

## Key decisions

| Decision | Why | Trade-off |
|---|---|---|
| **The plan is a JSON contract written by the AI**, interpreted by one shared engine | The app never needs a release for a new month; the AI can't produce something the app doesn't understand | The contract has to evolve carefully → every change updates the validator, the prompt, the example and the tests together |
| **MCP connector instead of a paid API** | The user's own Claude reads the month and publishes the next plan; no API bill, no automation of the claude.ai account | Publishing needs a human "yes" → drafts in parts, validate, summary, then publish |
| **Event log instead of documents** | "Ate only part", swaps, symptoms and purchases are all events → sync, offline queue and analytics fall out of one model | Last-write-wins per key, good enough for a family, not for a hospital |
| **Ask, don't nag** | Adherence data is only useful if people log; proactive questions answered from the notification keep friction near zero | Strict limits (2 a day, never at night, never twice) and a switch to turn it off |
| **Child view without calories** | Counting calories for a child is the wrong signal | "Ate well / little / refused" becomes the data the AI uses to adjust the child's meals |

## What came out

- The month's plan arrives on every phone the minute the AI publishes it; meal reminders skip what was already eaten.
- The AI's next plan is built from adherence, leftovers ("left 40 g of rice at dinner three days in a row"), swaps,
  symptom patterns, weight from the training app and the cost of the week from the grocery app.
- The shopping list follows the meals actually chosen, knows what is already in the pantry and how much it costs.
- A suite effect: Mesa, the training app (Pulse) and the grocery app (Cesta) share data over private Worker bindings,
  each one staying small.

## Mesa 3.0 — the redesign (November 2026)

After two months of daily use the app worked, but it had grown screen by screen. 3.0 rebuilt the interface from one
reference design instead of patching it:

- **One skin, "Orbit"** — dark, the brand glow behind glass cards, thin strokes and light numbers. Four tabs (Today, Plan,
  Shopping, Diary) instead of five; Health moved into the Diary. Tested with Android's large font from day one.
- **Each person, their own screen** — the family reported that one adult's health notes and food tests
  were showing on the other adult's and the child's days. Everything personal now carries an owner, and the one text the
  AI writes for the whole family (the day's highlight) is filtered per person.
- **Asking for less, getting better data** — "something else" became a small basket (several items with quantities, or
  just a name), and when a plan arrived without carbs and fat the app started estimating them from the ingredients
  instead of showing a dash; the connector's rules now ask the AI for those values.
- **The entrance** — the lock screen became a short animation of the logo with the passkey asked on tap, never
  automatically, so opening the app is not a security prompt.
- **A public twin** — this repository is generated from the private one by a script that swaps the real family for a
  fictitious one and refuses to finish if a real name is left; the README images are recorded from the live demo in CI.

## What I would do next

OAuth for the MCP connector if the link ever has to circulate; a white-label build where a nutritionist publishes plans
for many families from the same contract.
