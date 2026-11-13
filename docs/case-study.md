# Case study — Mesa

*[Leia em português](case-study.pt-BR.md)*

**Role:** product, UX and engineering, end to end · **Period:** Oct 2026 – today, 10 releases · **Users:** a real family
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

## What I would do next

OAuth for the MCP connector if the link ever has to circulate; a white-label build where a nutritionist publishes plans
for many families from the same contract.
