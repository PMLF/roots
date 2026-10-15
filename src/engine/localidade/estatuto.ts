/**
 * Estatuto de uma localidade: aldeia, vila ou cidade (RZ-136; docs/CIDADE.md §6b).
 * Deriva da população com histerese: depois de subir (ou descer) de estatuto só se volta atrás
 * quando a população passa a margem `histerese` do outro lado do limiar, para o estatuto não oscilar.
 * Puro: quem decide quando avaliar (anualmente, com RZ-309) é o motor de jogo.
 */
import type { Parametros } from "../config/parametros";

export const ESTATUTOS = ["aldeia", "vila", "cidade"] as const;
export type Estatuto = (typeof ESTATUTOS)[number];

type ParamsLocalidade = Pick<Parametros, "localidade">;

/** Limiares com as margens da histerese, em habitantes inteiros (evita erros de vírgula flutuante). */
function limites(p: ParamsLocalidade) {
  const { limiarVila: v, limiarCidade: c, histerese: h } = p.localidade;
  return { vilaSobe: Math.round(v * (1 + h)), vilaDesce: Math.round(v * (1 - h)), cidadeSobe: Math.round(c * (1 + h)), cidadeDesce: Math.round(c * (1 - h)) };
}

/** Estatuto de arranque, sem memória: pela população e pelos limiares. */
export function estatutoInicial(populacao: number, p: ParamsLocalidade): Estatuto {
  const { limiarVila, limiarCidade } = p.localidade;
  return populacao >= limiarCidade ? "cidade" : populacao >= limiarVila ? "vila" : "aldeia";
}

/** Intervalo de população em que o estatuto é estável (inclui as margens da histerese). */
export function bandaDoEstatuto(estatuto: Estatuto, p: ParamsLocalidade): { min: number; max: number } {
  const l = limites(p);
  if (estatuto === "aldeia") return { min: 0, max: l.vilaSobe };
  if (estatuto === "vila") return { min: l.vilaDesce, max: l.cidadeSobe };
  return { min: l.cidadeDesce, max: Number.POSITIVE_INFINITY };
}

export function estatutoCoerente(populacao: number, estatuto: Estatuto, p: ParamsLocalidade): boolean {
  const b = bandaDoEstatuto(estatuto, p);
  return populacao >= b.min && populacao < b.max;
}

/** Novo estatuto dado o atual e a população: sobe ou desce quantos degraus a população justificar. */
export function avaliarEstatuto(populacao: number, atual: Estatuto, p: ParamsLocalidade): Estatuto {
  const l = limites(p);
  let e = atual;
  for (let i = 0; i < ESTATUTOS.length; i++) {
    if (e === "aldeia" && populacao >= l.vilaSobe) e = "vila";
    else if (e === "vila" && populacao >= l.cidadeSobe) e = "cidade";
    else if (e === "cidade" && populacao < l.cidadeDesce) e = "vila";
    else if (e === "vila" && populacao < l.vilaDesce) e = "aldeia";
    else break;
  }
  return e;
}
