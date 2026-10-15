/** Geração de nomes por família linguística (RZ-132). Determinística e sem colisões com pessoas conhecidas. */
import type { Rng } from "../aleatorio/rng";
import { estaBloqueado, LISTA_BLOQUEIO } from "./bloqueio";
import { LISTAS, type ListaNomes } from "./listas";

export type Nome = { proprios: string[]; apelidos: string[]; completo: string; desportivo: string };

/** Escolha enviesada para o início da lista (os nomes mais comuns saem mais vezes). */
function comum(rng: Rng, xs: readonly string[], excluir: readonly string[] = []): string {
  for (let i = 0; i < 12; i++) {
    const x = xs[Math.min(xs.length - 1, Math.floor(xs.length * rng.float() ** 1.7))] as string;
    if (!excluir.includes(x)) return x;
  }
  return xs.find((x) => !excluir.includes(x)) ?? (xs[0] as string);
}

function montar(rng: Rng, l: ListaNomes): Nome {
  const proprios = [comum(rng, l.proprios)];
  const apelidos: string[] = [];
  if (l.estilo === "pt") {
    if (rng.prob(0.3)) proprios.push(comum(rng, l.proprios, proprios));
    apelidos.push(comum(rng, l.apelidos));
    if (rng.prob(0.65)) apelidos.push(comum(rng, l.apelidos, apelidos));
    return { proprios, apelidos, completo: [...proprios, ...apelidos].join(" "), desportivo: `${proprios[0]} ${apelidos[apelidos.length - 1]}` };
  }
  if (l.estilo === "es") {
    if (rng.prob(0.15)) proprios.push(comum(rng, l.proprios, proprios));
    apelidos.push(comum(rng, l.apelidos), comum(rng, l.apelidos));
    return { proprios, apelidos, completo: [...proprios, ...apelidos].join(" "), desportivo: `${proprios[0]} ${apelidos[0]}` };
  }
  apelidos.push(comum(rng, l.apelidos));
  const nome = `${proprios[0]} ${apelidos[0]}`;
  return { proprios, apelidos, completo: nome, desportivo: nome };
}

export const familiasDeNomes = (): string[] => Object.keys(LISTAS);

/** Gera um nome da família dada; repete se coincidir com a lista de bloqueio. */
export function gerarNome(rng: Rng, familia: string, bloqueio: ReadonlySet<string> = LISTA_BLOQUEIO): Nome {
  const l = LISTAS[familia];
  if (!l) throw new Error(`Família de nomes desconhecida: ${familia}`);
  for (let i = 0; i < 30; i++) {
    const n = montar(rng, l);
    const primeiroUltimo = `${n.proprios[0]} ${n.apelidos[n.apelidos.length - 1]}`;
    if (![n.completo, n.desportivo, primeiroUltimo].some((x) => estaBloqueado(x, bloqueio))) return n;
  }
  throw new Error(`Não foi possível gerar um nome livre de bloqueio para ${familia}`);
}
