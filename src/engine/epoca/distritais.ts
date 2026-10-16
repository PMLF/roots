/**
 * Distritais de tamanho variável e segunda distrital (RZ-113; docs/DESIGN_REGRAS.md §4). Puro: depois dos movimentos, cada
 * distrito tem `n' = n − p + r` clubes. Acima de `max`, os piores classificados (os recém-chegados do CP ficam
 * protegidos) descem para a segunda distrital; abaixo de `min`, a liga é completada com os que lá estão há menos tempo.
 * A segunda distrital é uma divisão que o jogo não simula: guarda o clube e a história, e os clubes podem voltar.
 * Se não houver clubes lá a liga joga com menos clubes (o gerador de clubes novos é o RZ-126).
 */
import type { Params } from "../config/parametros";
import type { ClubId, DistrictId } from "../dados/tipos";

export const SECOND_PREFIX = "Segunda Distrital ";
export const secondDistrictLeague = (district: DistrictId) => `${SECOND_PREFIX}${district}`;
export const isInSecondDistrict = (league: string) => league.startsWith(SECOND_PREFIX);

/** Um clube na segunda distrital e a época em que lá chegou. */
export type SecondDistrictInput = { club: ClubId; since: number };
export type SecondDistrict = Record<DistrictId, SecondDistrictInput[]>;

export type DistrictAdjustment = { club: ClubId; district: DistrictId; type: "relegation" | "ret" };

export type DistrictsResult = { districtLeagues: Record<DistrictId, ClubId[]>; second: SecondDistrict; adjustments: DistrictAdjustment[]; warnings: string[] };

export function adjustDistricts(
  fresh: Readonly<Record<DistrictId, readonly ClubId[]>>,
  ctx: {
    /** Classificação final de cada distrital desta época, do melhor para o pior. */
    final: Readonly<Record<DistrictId, readonly ClubId[]>>;
    /** Despromovidos do CP nesta passagem de época: não jogaram na distrital e ficam protegidos. */
    protected: ReadonlySet<ClubId>;
    second: Readonly<SecondDistrict>;
    season: number;
  },
  params: Params,
): DistrictsResult {
  const { max, min, hardMin } = params.districtLeagues;
  const districtLeagues: Record<DistrictId, ClubId[]> = {};
  const second: SecondDistrict = Object.fromEntries(Object.entries(ctx.second).map(([d, l]) => [d, [...l]]));
  const adjustments: DistrictAdjustment[] = [];
  const warnings: string[] = [];

  for (const district of Object.keys(fresh).sort()) {
    let list = [...(fresh[district] as readonly ClubId[])];
    const ofSecond = second[district] ?? (second[district] = []);

    if (list.length > max) {
      const surplus = list.length - max;
      const order = ctx.final[district] ?? [];
      const place = (c: ClubId) => order.indexOf(c);
      const candidates = list.filter((c) => !ctx.protected.has(c) && place(c) >= 0).sort((a, b) => place(b) - place(a) || (a < b ? -1 : 1));
      const leave = candidates.slice(0, surplus);
      if (leave.length < surplus) warnings.push(`${district}: ${surplus} a mais mas só ${leave.length} podem sair para a segunda distrital`);
      list = list.filter((c) => !leave.includes(c));
      for (const c of leave) {
        ofSecond.unshift({ club: c, since: ctx.season });
        adjustments.push({ club: c, district, type: "relegation" });
      }
    }

    if (list.length < min && ofSecond.length > 0) {
      // regressam primeiro os que desceram há menos tempo (em empate, por id)
      const byBack = [...ofSecond].sort((a, b) => b.since - a.since || (a.club < b.club ? -1 : 1)).slice(0, min - list.length);
      for (const e of byBack) {
        list.push(e.club);
        adjustments.push({ club: e.club, district, type: "ret" });
      }
      second[district] = ofSecond.filter((e) => !byBack.includes(e));
    }

    if (list.length < min) warnings.push(`${district}: ${list.length} clubes e a segunda distrital está vazia (um clube novo só com o RZ-126)`);
    if (list.length < hardMin) warnings.push(`${district}: abaixo do mínimo duro de ${hardMin} clubes`);
    districtLeagues[district] = list;
  }
  return { districtLeagues, second, adjustments, warnings };
}

