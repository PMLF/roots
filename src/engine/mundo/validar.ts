/** Validação do mundo gerado (GERACAO_MUNDO §3, passo 6). Devolve erros (bloqueiam) e avisos (calibração). */
import type { Tier, Params } from "../config/parametros";
import type { BaseData } from "../dados/tipos";
import { isBlocked } from "./bloqueio";
import { currentQuality } from "./jogador";
import type { Country } from "./paises";
import { ATTRIBUTES, POSITIONS, type WorldBatch } from "./tipos";

export type WorldSummary = {
  people: number;
  players: number;
  /** Por escalão: nº de jogadores, qualidade média, % de estrangeiros. */
  byTier: Record<string, { players: number; meanQuality: number; foreigners: number }>;
  sheetLargerThanCapital: number;
};

export function validateWorld(batch: WorldBatch, data: BaseData, countries: readonly Country[], p: Params): { errors: string[]; warnings: string[]; summary: WorldSummary } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const countryIds = new Set(countries.map((x) => x.id));
  const cityIds = new Set(data.cities.map((c) => c.id));
  for (const x of batch.people) {
    if (ids.has(x.id)) errors.push(`id repetido: ${x.id}`);
    ids.add(x.id);
    if (!countryIds.has(x.nationality)) errors.push(`${x.id}: país desconhecido ${x.nationality}`);
    if (x.naturalDe !== undefined && !cityIds.has(x.naturalDe)) errors.push(`${x.id}: concelho desconhecido ${x.naturalDe}`);
    if (isBlocked(x.name) || isBlocked(x.sportingName)) errors.push(`${x.id}: nome na lista de bloqueio (${x.name})`);
  }
  const playerOf = new Map<string, (typeof batch.players)[number]>();
  for (const j of batch.players) {
    if (!ids.has(j.person)) errors.push(`jogador sem pessoa: ${j.person}`);
    playerOf.set(j.person, j);
    for (const a of ATTRIBUTES) {
      const v = j.attributes[a];
      if (!Number.isInteger(v) || v < 1 || v > 20) errors.push(`${j.person}: atributo ${a}=${v} fora de 1-20`);
    }
    if (j.potential < 1 || j.potential > 20) errors.push(`${j.person}: potencial fora de 1-20`);
  }

  // posições cobertas e tamanho do plantel
  const byClub = new Map<string, typeof batch.players>();
  for (const j of batch.players) if (j.club) byClub.set(j.club, [...(byClub.get(j.club) ?? []), j]);
  for (const cl of data.clubs) {
    const js = byClub.get(cl.id) ?? [];
    if (js.length !== p.world.squad[cl.tier]) errors.push(`${cl.id}: ${js.length} jogadores (esperado ${p.world.squad[cl.tier]})`);
    const count = new Map<string, number>();
    for (const j of js) count.set(j.positions[0]!.pos, (count.get(j.positions[0]!.pos) ?? 0) + 1);
    for (const pos of POSITIONS) if ((count.get(pos) ?? 0) < (pos === "GK" ? 2 : 1)) errors.push(`${cl.id}: posição ${pos} mal coberta`);
  }

  // qualidade e estrangeiros por escalão
  const tierOf = new Map(data.clubs.map((c) => [c.id, c.tier] as const));
  const acc = new Map<Tier, { n: number; q: number; e: number }>();
  for (const j of batch.players) {
    if (!j.club) continue;
    const tier = tierOf.get(j.club) as Tier;
    const person = batch.people.find((x) => x.id === j.person);
    void person;
    const a = acc.get(tier) ?? { n: 0, q: 0, e: 0 };
    a.n++;
    a.q += currentQuality(j.attributes, j.positions[0]!.pos);
    acc.set(tier, a);
  }
  const nacion = new Map(batch.people.map((x) => [x.id, x.nationality] as const));
  for (const j of batch.players) {
    if (!j.club) continue;
    const a = acc.get(tierOf.get(j.club) as Tier);
    if (a && nacion.get(j.person) !== "pt") a.e++;
  }
  const byTier: WorldSummary["byTier"] = {};
  for (const [tier, a] of acc) {
    const q = a.q / a.n;
    const e = a.e / a.n;
    byTier[tier] = { players: a.n, meanQuality: Math.round(q * 100) / 100, foreigners: Math.round(e * 1000) / 1000 };
    const target = p.world.targetQuality[tier].mean;
    if (Math.abs(q - target) > 0.8) warnings.push(`${tier}: qualidade média ${q.toFixed(2)} longe do alvo ${target}`);
    if (Math.abs(e - p.foreigners[tier]) > 0.06) warnings.push(`${tier}: estrangeiros ${(e * 100).toFixed(1)} % longe de ${(p.foreigners[tier] * 100).toFixed(0)} %`);
  }

  // folha salarial vs capital (aviso)
  const sheet = new Map<string, number>();
  for (const c of batch.contracts) sheet.set(c.club, (sheet.get(c.club) ?? 0) + c.monthlyWage * 12);
  let above = 0;
  for (const cl of data.clubs) if ((sheet.get(cl.id) ?? 0) > 4 * cl.finances) above++;
  if (above > data.clubs.length * 0.1) warnings.push(`${above} clubes com folha anual > 4× o capital`);

  return {
    errors,
    warnings,
    summary: { people: batch.people.length, players: batch.players.length, byTier, sheetLargerThanCapital: above },
  };
}
