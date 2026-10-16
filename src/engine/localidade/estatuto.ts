/**
 * Estatuto de uma localidade: aldeia, vila ou cidade (RZ-136; docs/CIDADE.md §6b).
 * Deriva da população com histerese: depois de subir (ou descer) de estatuto só se volta atrás
 * quando a população passa a margem `histerese` do outro lado do limiar, para o estatuto não oscilar.
 * Puro: quem decide quando avaliar (anualmente, com RZ-309) é o motor de jogo.
 */
import type { Params } from "../config/parametros";

export const STATUSES = ["aldeia", "vila", "city"] as const;
export type Status = (typeof STATUSES)[number];

type LocalityParams = Pick<Params, "locality">;

/** Limiares com as margens da histerese, em habitantes inteiros (evita erros de vírgula flutuante). */
function limits(p: LocalityParams) {
  const { townThreshold: v, cityThreshold: c, hysteresis: h } = p.locality;
  return { risesTown: Math.round(v * (1 + h)), dropsTown: Math.round(v * (1 - h)), risesCity: Math.round(c * (1 + h)), dropsCity: Math.round(c * (1 - h)) };
}

/** Estatuto de arranque, sem memória: pela população e pelos limiares. */
export function initialStatus(population: number, p: LocalityParams): Status {
  const { townThreshold, cityThreshold } = p.locality;
  return population >= cityThreshold ? "city" : population >= townThreshold ? "vila" : "aldeia";
}

/** Intervalo de população em que o estatuto é estável (inclui as margens da histerese). */
export function statusBand(status: Status, p: LocalityParams): { min: number; max: number } {
  const l = limits(p);
  if (status === "aldeia") return { min: 0, max: l.risesTown };
  if (status === "vila") return { min: l.dropsTown, max: l.risesCity };
  return { min: l.dropsCity, max: Number.POSITIVE_INFINITY };
}

export function coherentStatus(population: number, status: Status, p: LocalityParams): boolean {
  const b = statusBand(status, p);
  return population >= b.min && population < b.max;
}

/** Novo estatuto dado o atual e a população: sobe ou desce quantos degraus a população justificar. */
export function evaluateStatus(population: number, current: Status, p: LocalityParams): Status {
  const l = limits(p);
  let e = current;
  for (let i = 0; i < STATUSES.length; i++) {
    if (e === "aldeia" && population >= l.risesTown) e = "vila";
    else if (e === "vila" && population >= l.risesCity) e = "city";
    else if (e === "city" && population < l.dropsCity) e = "vila";
    else if (e === "vila" && population < l.dropsTown) e = "aldeia";
    else break;
  }
  return e;
}
