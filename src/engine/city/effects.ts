/**
 * O que os serviços da cidade (RZ-233) fazem ao jogo. Todas as funções são puras ou só leem o estado da cidade do clube:
 * saúde e vida noturna mexem nas lesões e no cansaço, mobilidade e turismo na assistência, a habitação nos ordenados que os jogadores pedem.
 * Os números estão em `params.city.services.effects`.
 */
import { addDays } from "../calendar/dates";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate, NewEvent } from "../persistence/types";
import { cityStateNow } from "./cities";
import type { CityState } from "./state";

/** Estado atual da cidade onde joga o clube. */
export function clubCityState(repo: Repository, base: BaseData, params: Params, club: string): CityState | undefined {
  const c = base.clubs.find((x) => x.id === club);
  return c ? cityStateNow(repo, base, params, c.city) : undefined;
}

/** Quanto o jogador sai ao «sair à noite»: 0 a 1, maior com mais entretenimento na cidade e menos profissionalismo (abaixo de 10). */
export function nightlifeOf(professionalism: number, entertainment: number): number {
  return Math.max(0, (entertainment - 50) / 50) * Math.max(0, (10 - professionalism) / 10);
}

/** Multiplicador dos dias de uma lesão: cidade com boa saúde recupera mais depressa; a vida noturna atrasa quem não se cuida. */
export function recoveryFactor(state: Pick<CityState, "health" | "entertainment"> | undefined, professionalism: number, params: Params): number {
  if (!state) return 1;
  const e = params.city.services.effects;
  return Math.max(0.5, 1 - e.health.recoveryPerPoint * (state.health - 50)) * (1 + e.nightlife.recoveryExtra * nightlifeOf(professionalism, state.entertainment));
}

/** Perda de forma (fração) de quem abusa das saídas à noite. */
export function nightlifeFormLoss(state: Pick<CityState, "entertainment"> | undefined, professionalism: number, params: Params): number {
  return state ? params.city.services.effects.nightlife.formLoss * nightlifeOf(professionalism, state.entertainment) : 0;
}

/** Multiplicador da ocupação do estádio: bons acessos e, nos meses quentes, turismo, trazem mais gente. */
export function attendanceFactor(state: Pick<CityState, "mobility" | "tourism"> | undefined, month: number, params: Params): number {
  if (!state) return 1;
  const e = params.city.services.effects.attendance;
  return (1 + e.mobility * ((state.mobility - 50) / 50)) * (1 + (e.warmMonths.includes(month) ? e.tourismWarm * ((state.tourism - 50) / 50) : 0));
}

/** Multiplicador do ordenado que os jogadores pedem: numa cidade cara (habitação pouco acessível) pedem mais. */
export function wageFactor(state: Pick<CityState, "housing"> | undefined, params: Params): number {
  return state ? 1 + params.city.services.effects.wages.housing * ((50 - state.housing) / 50) : 1;
}

/** Acerta os dias de uma lesão ao que a cidade do clube faz à recuperação do jogador (saúde e vida noturna). */
export function adjustInjury(repo: Repository, base: BaseData, params: Params, e: NewEvent): NewEvent {
  const player = e.entities.find((x) => x.k === "person")?.id;
  const club = e.entities.find((x) => x.k === "club")?.id;
  const days = Number((e.data as { days?: number }).days);
  if (!player || !club || !(days >= 1)) return e;
  const f = recoveryFactor(clubCityState(repo, base, params, club), repo.person(player)?.personality.professionalism ?? 10, params);
  const adjusted = Math.max(1, Math.round(days * f));
  return adjusted === days ? e : { ...e, data: { ...e.data, days: adjusted, until: addDays(e.date as IsoDate, adjusted) } };
}
