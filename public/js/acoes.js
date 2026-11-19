// Regras do que se grava no registro ao mexer numa refeição — uma só para a Mesa antiga e a nova (/v3/).
// Só dados: vibrar, avisar e redesenhar ficam com cada tela.
import { log } from "./sync.js";

const PARTES = ["eaten", "partial", "aceite"];

/** Estado da refeição antes de mexer, para o Desfazer. */
export const foto = (data, pessoa, id) => PARTES.map((k) => [k, log.get(k, data, pessoa, id)?.v]);
export function restaurar(data, pessoa, id, f) {
  for (const [k, v] of f) v == null ? log.del(k, data, pessoa, id) : log.set(k, data, pessoa, id, v);
}

/** Marca/desmarca "comi". Desmarcar apaga "só parte" e o aceite; criança marcada começa em "comeu bem". */
export function alternarComi(data, pessoa, id, crianca) {
  const on = log.toggle("eaten", data, pessoa, id);
  if (!on) { log.del("partial", data, pessoa, id); log.del("aceite", data, pessoa, id); }
  else if (crianca) log.set("aceite", data, pessoa, id, "bem");
  return on;
}

/** Grava o que ficou de fora. Comer parte conta como feita; tudo de fora (sem "outra coisa") desmarca. */
export function salvarParte(data, pessoa, m, p) {
  const vazio = !p.fora.length && !p.outra;
  if (vazio) log.del("partial", data, pessoa, m.id);
  else log.set("partial", data, pessoa, m.id, JSON.stringify(p));
  const nada = !p.outra && m.itens.every((it) => p.fora.includes(it.nome));
  if (nada) log.del("eaten", data, pessoa, m.id);
  else if (!vazio) log.set("eaten", data, pessoa, m.id, "1");
}

/** Troca a opção do dia (0 = a do plano). Os itens mudam, então o "só parte" daquela refeição sai. */
export function trocarOpcao(data, pessoa, id, i) {
  if (i) log.set("swap", data, pessoa, id, String(i)); else log.del("swap", data, pessoa, id);
  log.del("partial", data, pessoa, id);
}

/** Como a criança comeu ("bem" | "pouco" | "recusou"). Tocar de novo no mesmo desmarca a refeição. */
export function definirAceite(data, pessoa, id, v) {
  const atual = log.get("eaten", data, pessoa, id) ? log.get("aceite", data, pessoa, id)?.v || "bem" : "";
  if (atual === v) { log.del("eaten", data, pessoa, id); log.del("aceite", data, pessoa, id); }
  else { log.set("eaten", data, pessoa, id, "1"); log.set("aceite", data, pessoa, id, v); }
}

/** Soma (ou tira) água do dia, entre 0 e 8 L. Vai ao servidor como soma, junto com o "+250" das notificações. */
export function somarAgua(data, pessoa, ml) {
  log.add("water", data, pessoa, "", ml);
}
