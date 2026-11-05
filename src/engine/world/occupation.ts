/**
 * Profissão fora do futebol (RZ-318). Deriva-se de forma estável do jogador (semente + id), da idade e do setor da cidade
 * onde nasceu: quem é novo estuda; os outros têm um emprego sorteado com pesos por setor. Não se guarda: dá sempre o mesmo.
 */
import type { Params } from "../config/parameters";
import { Rng } from "../random/rng";

const YEAR_MS = 365.25 * 86_400_000;

export function occupationOf(seed: string, personId: string, birth: string, today: string, citySector: string | undefined, params: Params): string {
  const o = params.occupation;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${birth}T00:00:00Z`)) / YEAR_MS;
  const rng = new Rng(seed, `occupation/${personId}`);
  const student = rng.prob(o.studentShare);
  if (age < o.studentUntilAge && student) return "student";
  const codes = Object.entries(o.codes);
  return rng.weighted(codes, ([, c]) => c.weight * (citySector ? (c.sectors?.[citySector] ?? 1) : 1))[0];
}

/** Só aparece a quem o futebol não paga para viver: sem contrato ou com ordenado abaixo do mínimo de profissional. */
export const hasOutsideLife = (monthlyWage: number | undefined, params: Params) => monthlyWage === undefined || monthlyWage < params.occupation.fullTimeWage;
