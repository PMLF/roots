/**
 * Pré-história (RZ-265): como eram os clubes e as cidades nas épocas anteriores ao arranque do save (épocas 0, −1, …). Só serve
 * para o gamer ver de onde vêm: posições e subidas/descidas dos clubes, população e indicadores das cidades. Não há jogos nem
 * jogadores. Tudo é função pura da seed, por isso nada se guarda e o resultado é sempre o mesmo.
 */
import type { Params, Tier } from "../config/parameters";
import type { BaseCity, BaseClub, BaseData } from "../data/types";
import { clamp, Rng } from "../random/rng";
import { sectorEffect, type CityState, type CityTargets } from "../city/state";

export type PastSeason = {
  /** 0, −1, −2, … */
  season: number;
  tier: Tier;
  league: string;
  /** Lugar final na liga e n.º de clubes dela. */
  position: number;
  of: number;
  /** O que aconteceu no fim dessa época: subiu ou desceu de escalão. */
  movement?: "promoted" | "relegated";
};

const TIERS: readonly Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
/** Clubes por liga de cada escalão (os dados têm 20, 20, 20, 10 por série do CP e 10 por distrital). */
const LEAGUE_SIZE: Record<Tier, number> = { firstLeague: 20, secondLeague: 20, thirdLeague: 20, cp: 10, district: 10 };

/** Subidas e descidas por época de cada escalão (para o lugar do clube que sobe ou desce). */
const zones = (tier: Tier, params: Params): { promoted: number; relegated: number } => {
  const p = params.pyramid;
  switch (tier) {
    case "firstLeague": return { promoted: 0, relegated: p.firstLeague.drop };
    case "secondLeague": return { promoted: p.secondLeague.rise, relegated: p.secondLeague.drop };
    case "thirdLeague": return { promoted: p.thirdLeague.rise, relegated: p.thirdLeague.drop };
    case "cp": return { promoted: p.cp.risePerSeries, relegated: 2 };
    case "district": return { promoted: 1, relegated: 0 };
  }
};

/** O nome da liga do escalão para este clube (a do próprio clube se for o escalão dele; senão, a série ou o distrito dele). */
function leagueOf(club: BaseClub, tier: Tier, data: BaseData): string {
  if (club.tier === tier) return club.league;
  if (tier === "cp") {
    const series = data.districts?.find((d) => d.id === club.district || d.name === club.district)?.cpSeries;
    return data.clubs.find((c) => c.tier === "cp" && series !== undefined && c.league === `CP Série ${series}`)?.league ?? data.clubs.find((c) => c.tier === "cp")?.league ?? "";
  }
  if (tier === "district") return data.clubs.find((c) => c.tier === "district" && c.district === club.district)?.league ?? "";
  return data.clubs.find((c) => c.tier === tier)?.league ?? "";
}

/**
 * As `preHistory.seasons` épocas anteriores de um clube, da mais antiga para a mais recente. Caminha para trás a partir do escalão
 * de hoje: em cada época pode ter vindo de um escalão abaixo (subiu) ou de um acima (desceu); quem subiu acabou nos lugares de
 * subida, quem desceu nos de descida e os outros no meio, com a reputação a puxar para cima ou para baixo.
 */
export function clubPreHistory(seed: string, club: BaseClub, data: BaseData, params: Params): PastSeason[] {
  const h = params.preHistory;
  const rng = new Rng(seed, `prehistory/club/${club.id}`);
  // reputação do clube entre os do mesmo escalão (0 = o mais pequeno, 1 = o maior)
  const peers = data.clubs.filter((c) => c.tier === club.tier).map((c) => c.reputation);
  const lo = Math.min(...peers), hi = Math.max(...peers);
  const standing = hi > lo ? (club.reputation - lo) / (hi - lo) : 0.5;

  const out: PastSeason[] = [];
  let next: Tier = club.tier;
  for (let k = 0; k < h.seasons; k++) {
    const index = TIERS.indexOf(next);
    const roll = rng.float();
    // veio de baixo (subiu para `next`) ou de cima (desceu para `next`)
    const promoted = index < TIERS.length - 1 && roll < h.club.promoted;
    const relegated = !promoted && index > 0 && roll < h.club.promoted + h.club.relegated;
    const tier = promoted ? (TIERS[index + 1] as Tier) : relegated ? (TIERS[index - 1] as Tier) : next;
    const of = LEAGUE_SIZE[tier];
    const z = zones(tier, params);
    let position: number;
    if (promoted) position = rng.integer(1, Math.max(1, z.promoted));
    else if (relegated) position = rng.integer(of - Math.max(1, z.relegated) + 1, of);
    else {
      // mesmo escalão: a reputação puxa para cima (clubes grandes ficam mais acima), sem tocar nas zonas de subida/descida
      const share = clamp(1 - standing + rng.gauss(0, h.club.positionNoise), 0, 1);
      const first = z.promoted + 1, last = of - z.relegated;
      position = clamp(Math.round(first + share * (last - first)), first, Math.max(first, last));
    }
    out.push({ season: 0 - k, tier, league: leagueOf(club, tier, data), position, of });
    next = tier;
  }
  // o movimento de uma época vê-se pela época a seguir: escalão acima = subiu, abaixo = desceu
  const withMovement = out.map((s, i): PastSeason => {
    const after = i === 0 ? club.tier : (out[i - 1] as PastSeason).tier;
    const moved = TIERS.indexOf(after) < TIERS.indexOf(s.tier) ? "promoted" : TIERS.indexOf(after) > TIERS.indexOf(s.tier) ? "relegated" : undefined;
    return { ...s, ...(moved ? { movement: moved } : {}) };
  });
  return withMovement.reverse();
}

/**
 * As épocas anteriores de uma cidade a partir do estado de arranque, da mais antiga para a mais recente: a população recua com a
 * variação anual (setor e ruído) e os indicadores aproximam-se, para trás, de onde estavam há um ano (perto do estado de hoje, com
 * metade da tendência para o alvo já feita).
 */
export function cityPreHistory(seed: string, city: BaseCity, initial: CityState, targets: CityTargets, params: Params): { season: number; state: CityState }[] {
  const h = params.preHistory;
  const rng = new Rng(seed, `prehistory/city/${city.id}`);
  const drift = sectorEffect(city, "populationPct", params);
  const pct = (x: number) => clamp(x, 0, 100);
  const out: { season: number; state: CityState }[] = [];
  let next = initial;
  for (let k = 0; k < h.seasons; k++) {
    const growth = clamp(drift + rng.gauss(0, h.city.populationNoisePct), -3, 3);
    const back = (now: number, target: number) => pct(now - (target - now) * h.city.trendShare * 0.2 + rng.gauss(0, h.city.indicatorNoise));
    const state: CityState = {
      population: Math.max(50, Math.round(next.population / (1 + growth / 100))),
      employment: back(next.employment, targets.employment),
      economy: back(next.economy, targets.economy),
      tourism: back(next.tourism, targets.tourism),
      pride: back(next.pride, targets.pride),
      notoriety: back(next.notoriety, targets.notoriety),
      footballCulture: clamp(next.footballCulture + rng.gauss(0, h.city.indicatorNoise / 2), 5, 95),
    };
    out.push({ season: 0 - k, state });
    next = state;
  }
  return out.reverse();
}
