/**
 * Movimentos entre escalões no fim da época (RZ-111; docs/DESIGN_RULES.md §1 e §2, passos 4 e 5). Puro: recebe as
 * classificações finais (do melhor para o pior) e devolve a nova composição de cada competição, sem tocar no repositório.
 *
 * Prémio do Estado (passo 2), Fase de Promoção (passo 3, RZ-125) e reajuste das distritais (passo 6, RZ-113) ficam
 * fora: os promovidos da Fase de Promoção entram como dado, e as distritais só perdem os promovidos e recebem os
 * despromovidos do CP.
 */
import { derived, type Params } from "../config/parameters";
import type { ClubId, DistrictId, CpSeries } from "../data/types";

export const SERIES: readonly CpSeries[] = ["A", "B", "C", "D"];

export type Pyramid = {
  first: ClubId[];
  second: ClubId[];
  third: ClubId[];
  cp: Record<CpSeries, ClubId[]>;
  districtLeagues: Record<DistrictId, ClubId[]>;
};

/** Classificações finais, do 1.º ao último. As séries do CP e as distritais só têm de listar os clubes da competição. */
export type FinalStandings = {
  first: ClubId[];
  second: ClubId[];
  third: ClubId[];
  cp: Record<CpSeries, ClubId[]>;
  /** Os promovidos da Fase de Promoção (2 por grupo), cada um com a série do CP para onde sobe. */
  promotionPhasePromoted: { club: ClubId; series: CpSeries }[];
};

export type Local = "first" | "second" | "third" | `cp-${CpSeries}` | `district-${DistrictId}`;

export type Movement = { club: ClubId; from: Local; to: Local; reason: "rise" | "relegation" | "promotion" };

export type MovementsResult = { pyramid: Pyramid; movements: Movement[]; warnings: string[] };

/** Onde cada clube joga: serve para saber a série do CP e o distrito de um clube que desce. */
export type Context = { districtOf: (c: ClubId) => DistrictId; districtSeries: (d: DistrictId) => CpSeries };

export function applyMovements(current: Pyramid, final: FinalStandings, params: Params, ctx: Context): MovementsResult {
  const { firstLeague, secondLeague, thirdLeague, cp } = params.pyramid;
  const warnings: string[] = [];
  const movements: Movement[] = [];
  const move = (club: ClubId, from: Local, to: Local, reason: Movement["reason"]) => movements.push({ club, from, to, reason });
  const lastN = (list: readonly ClubId[], n: number) => (n > 0 ? list.slice(-n) : []);
  const first = (list: readonly ClubId[], n: number) => list.slice(0, n);

  const check = (name: string, expected: readonly ClubId[], listFinal: readonly ClubId[]) => {
    const a = [...expected].sort().join("|");
    const b = [...listFinal].sort().join("|");
    if (a !== b) warnings.push(`classificação final de ${name} não coincide com os clubes da competição`);
  };
  check("first", current.first, final.first);
  check("second", current.second, final.second);
  check("third", current.third, final.third);
  for (const s of SERIES) check(`cp-${s}`, current.cp[s], final.cp[s]);

  // 1. Primeira ⇄ Segunda ⇄ Terceira
  const pDrops = lastN(final.first, firstLeague.drop);
  const sRises = first(final.second, secondLeague.rise);
  const sDrops = lastN(final.second.filter((c) => !sRises.includes(c)), secondLeague.drop);
  const tRises = first(final.third, thirdLeague.rise);
  const tDrops = lastN(final.third.filter((c) => !tRises.includes(c)), thirdLeague.drop);
  for (const c of pDrops) move(c, "first", "second", "relegation");
  for (const c of sRises) move(c, "second", "first", "rise");
  for (const c of sDrops) move(c, "second", "third", "relegation");
  for (const c of tRises) move(c, "third", "second", "rise");

  // 2. CP: o campeão de cada série sobe; descem `promovidos_da_série + descidos_da_Terceira_na_série − subida`
  const seriesOf = (c: ClubId) => ctx.districtSeries(ctx.districtOf(c));
  const champions: { club: ClubId; series: CpSeries }[] = [];
  const cpDrops: { club: ClubId; series: CpSeries }[] = [];
  for (const s of SERIES) {
    const table = final.cp[s];
    const rise = first(table, cp.risePerSeries);
    for (const c of rise) champions.push({ club: c, series: s });
    const promoInputs = final.promotionPhasePromoted.filter((p) => p.series === s).length;
    const thirdInputs = tDrops.filter((c) => seriesOf(c) === s).length;
    const drop = Math.max(0, promoInputs + thirdInputs - rise.length);
    for (const c of lastN(table.filter((x) => !rise.includes(x)), drop)) cpDrops.push({ club: c, series: s });
  }
  for (const c of champions) move(c.club, `cp-${c.series}`, "third", "rise");
  for (const c of tDrops) move(c, "third", `cp-${seriesOf(c)}`, "relegation");
  for (const c of cpDrops) move(c.club, `cp-${c.series}`, `district-${ctx.districtOf(c.club)}`, "relegation");
  for (const p of final.promotionPhasePromoted) move(p.club, `district-${ctx.districtOf(p.club)}`, `cp-${p.series}`, "promotion");

  const promoExpected = derived(params).promotedAtCp;
  if (final.promotionPhasePromoted.length !== promoExpected) warnings.push(`a Fase de Promoção devia ter ${promoExpected} promovidos e tem ${final.promotionPhasePromoted.length}`);

  // 3. Nova composição
  const leave = new Map<Local, Set<ClubId>>();
  const enter = new Map<Local, ClubId[]>();
  for (const m of movements) {
    (leave.get(m.from) ?? leave.set(m.from, new Set()).get(m.from)!).add(m.club);
    (enter.get(m.to) ?? enter.set(m.to, []).get(m.to)!).push(m.club);
  }
  const compose = (local: Local, base: readonly ClubId[]) => [...base.filter((c) => !leave.get(local)?.has(c)), ...(enter.get(local) ?? [])];
  const fresh: Pyramid = {
    first: compose("first", current.first),
    second: compose("second", current.second),
    third: compose("third", current.third),
    cp: Object.fromEntries(SERIES.map((s) => [s, compose(`cp-${s}`, current.cp[s])])) as Record<CpSeries, ClubId[]>,
    districtLeagues: Object.fromEntries(Object.entries(current.districtLeagues).map(([d, l]) => [d, compose(`district-${d}`, l)])),
  };

  const sizes: [string, number, number][] = [
    ["first", fresh.first.length, firstLeague.clubs],
    ["second", fresh.second.length, secondLeague.clubs],
    ["third", fresh.third.length, thirdLeague.clubs],
    ...SERIES.map((s): [string, number, number] => [`cp-${s}`, fresh.cp[s].length, cp.clubsPerSeries]),
  ];
  for (const [name, n, expected] of sizes) if (n !== expected) warnings.push(`${name} fica com ${n} clubes (esperado ${expected})`);
  return { pyramid: fresh, movements, warnings };
}
