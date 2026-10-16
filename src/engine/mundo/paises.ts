/** Tabela de países (RZ-132) e pesos de nascimento/migração (MODELO_DADOS §15, GERACAO_MUNDO §4). */
import { readTable } from "../dados/csv";
import type { Tier, Params } from "../config/parametros";
import { clamp } from "../aleatorio/rng";

export type Country = {
  id: string;
  name: string;
  /** Milhões de habitantes. */
  population: number;
  /** 0-100 */
  tradition: number;
  infrastructure: number;
  /** 0-1: quão natural é um jogador deste país vir para Portugal. */
  portugalAffinity: number;
  familyNames: string;
  lusofono: boolean;
  /** (tradição + infraestrutura) / 2 */
  index: number;
};

export function importCountries(csv: string): { ok: true; countries: Country[] } | { ok: false; errors: string[] } {
  const t = readTable(csv);
  const errors = [...t.errors];
  const countries: Country[] = [];
  const ids = new Set<string>();
  for (const l of t.lines) {
    const v = l.values;
    const n = (c: string) => Number(v[c]);
    const p: Country = {
      id: v.id ?? "",
      name: v.nome ?? "",
      population: n("populacao_milhoes"),
      tradition: n("tradition"),
      infrastructure: n("infrastructure"),
      portugalAffinity: n("afinidade_pt"),
      familyNames: v.familia_nomes ?? "",
      lusofono: v.lusofono === "1",
      index: 0,
    };
    const where = `paises linha ${l.number}`;
    if (!p.id || ids.has(p.id)) errors.push(`${where}: id vazio ou repetido`);
    ids.add(p.id);
    if (!p.name || !p.familyNames) errors.push(`${where}: nome e familia_nomes obrigatórios`);
    if (!(p.population > 0)) errors.push(`${where}: população > 0`);
    for (const [c, x] of [["tradition", p.tradition], ["infrastructure", p.infrastructure]] as const) if (!(x >= 0 && x <= 100)) errors.push(`${where}: ${c} entre 0 e 100`);
    if (!(p.portugalAffinity >= 0 && p.portugalAffinity <= 1)) errors.push(`${where}: afinidade_pt entre 0 e 1`);
    p.index = (p.tradition + p.infrastructure) / 2;
    countries.push(p);
  }
  if (!countries.some((p) => p.id === "pt")) errors.push("paises: falta Portugal (pt)");
  return errors.length > 0 ? { ok: false, errors } : { ok: true, countries };
}

/** Quantos jogadores um país produz (relativo): √população × (0,3 + índice/100). */
export const birthWeight = (p: Country): number => Math.sqrt(p.population) * (0.3 + p.index / 100);

/** Qualidade necessária (0-1) de um escalão: cresce com o nível. */
export const necessaryQuality = (tier: Tier): number => ({ firstLeague: 1, secondLeague: 0.75, thirdLeague: 0.5, cp: 0.3, district: 0.1 })[tier];

/** w(país → Portugal) = peso de nascimento × afinidade × (0,5 + qualidade necessária). */
export const weightForPortugal = (p: Country, tier: Tier): number => birthWeight(p) * p.portugalAffinity * (0.5 + necessaryQuality(tier));

/** Probabilidade de cauda do país: sobe com o índice, nunca é zero. */
export function tailProb(p: Country, m: Params["world"]["talent"]): number {
  return m.seasonsIndex0 + (m.seasonsIndex100 - m.seasonsIndex0) * clamp(p.index / 100, 0, 1);
}
