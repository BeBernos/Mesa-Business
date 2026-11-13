// Ponto de entrada do Worker "plano-familia".
// - default: o app (worker.js: /api/*, planos, cron dos avisos).
// - Ponte: porta interna para o Pulse (app de treino), via ligação entre Workers (service binding com
//   "entrypoint": "Ponte" no wrangler do Pulse). Não tem rota pública.
//   Também usada pela Cesta (app do mercado, BeBernos/Cesta-Business) para trazer a lista de compras da dieta.
// Fica separado de worker.js porque "cloudflare:workers" só existe no Cloudflare (os testes rodam no Node).
import { WorkerEntrypoint } from "cloudflare:workers";
import worker, { ponteGravar, ponteLer, ponteCompras, ponteGuardarPrecos } from "./worker.js";

export class Ponte extends WorkerEntrypoint {
  /** Pesos da pessoa ("rafael", "marina"…) alterados depois de `since`. */
  pesos(person, since) {
    return ponteLer(this.env, person, since);
  }

  /** Grava peso ("weight"), "treinou hoje?" ("trained"), gasto do cardio ("burn") e a agenda de treino ("pulse") vindos do Pulse. */
  gravar(ops) {
    return ponteGravar(this.env, ops);
  }

  /** Lista de compras da dieta no período, para a Cesta (app do mercado). */
  compras(de, ate) {
    return ponteCompras(this.env, de, ate);
  }

  /** Preços (R$ por g/ml/un) dos itens da dieta que a Cesta ligou a produtos, para o custo da dieta. */
  precos(itens) {
    return ponteGuardarPrecos(this.env, itens);
  }
}

export default worker;
