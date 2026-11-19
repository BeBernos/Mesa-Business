// Registro do celular (public/js/sync.js): a água vai ao servidor como soma, para não apagar um "+250" da notificação.
import { test } from "node:test";
import assert from "node:assert/strict";
import { log } from "../public/js/sync.js";

const pushReal = log.push;
log.push = async () => {}; // sem rede no teste: só olhamos a fila
const limpar = () => { log.rows.clear(); log.pending = []; };
const D = "2026-11-19";

test("água: somas seguidas viram uma soma só na fila, e o valor local acompanha", () => {
  limpar();
  log.add("water", D, "rafael", "", 250);
  log.add("water", D, "rafael", "", 250);
  assert.equal(log.get("water", D, "rafael").v, "500");
  assert.deepEqual(log.pending.map((p) => [p.kind, p.add, p.v]), [["water", 500, "500"]]);
});

test("água: tirar mais do que tem para em zero e manda só o que tirou de fato", () => {
  limpar();
  log.set("water", D, "marina", "", "250");
  log.pending = []; // já subiu
  log.add("water", D, "marina", "", -500);
  assert.equal(log.get("water", D, "marina").v, "0");
  assert.deepEqual(log.pending.map((p) => p.add), [-250]);
});

test("água: com um valor absoluto ainda na fila (versão anterior), continua absoluto", () => {
  limpar();
  log.set("water", D, "rafael", "", "500");
  log.add("water", D, "rafael", "", 250);
  assert.deepEqual(log.pending.map((p) => [p.add, p.v]), [[undefined, "750"]]);
});

test("água: copo somado enquanto o envio anterior está no ar não manda a soma duas vezes", async () => {
  limpar();
  const enviados = [];
  let soltar;
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, init) => { enviados.push(JSON.parse(init.body).ops); await new Promise((r) => (soltar = r)); return new Response("{}", { status: 200 }); };
  log.add("water", D, "rafael", "", 250);
  const envio = pushReal.call(log);
  await new Promise((r) => setTimeout(r, 10));
  log.add("water", D, "rafael", "", 250); // durante o envio
  soltar();
  await envio;
  globalThis.fetch = fetchReal;
  assert.deepEqual(enviados[0].map((o) => o.add), [250]);
  assert.deepEqual(log.pending.map((p) => p.add), [250], "fica só o copo novo para mandar");
  assert.equal(log.get("water", D, "rafael").v, "500");
});
