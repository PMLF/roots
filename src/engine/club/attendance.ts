/**
 * Assistência simples (RZ-115 v1): estádio × ocupação do escalão × valor do clube × cultura de futebol da cidade × dérbi ×
 * grande visitante × final. Determinística, sem aleatoriedade (o jogo já tem a sua). Forma, preço e decisões de subida/descida
 * entram na versão completa do RZ-115. A receita de bilheteira é a assistência × preço do escalão.
 */
import type { Params } from "../config/parameters";
import type { BaseClub } from "../data/types";
import { factorReputation } from "./finances";

export type AttendanceInput = { home: BaseClub; away: BaseClub; footballCulture: number; final?: boolean };

export function matchAttendance(e: AttendanceInput, params: Params): { attendance: number; revenue: number } {
  const m = params.finances.model;
  const a = params.attendance;
  const tier = e.home.tier;
  let occupancy = m.occupancy[tier] * factorReputation(e.home, params) ** 0.5;
  occupancy *= 1 - m.cultureOccupancy + 2 * m.cultureOccupancy * (e.footballCulture / 100);
  const derby = e.home.rival === e.away.id || e.away.rival === e.home.id;
  if (derby) occupancy *= e.home.rival === e.away.id && e.away.rival === e.home.id ? a.mutualDerby : a.derby;
  if (e.away.reputation > e.home.reputation) occupancy *= 1 + a.bigCoefAway * Math.min(1, e.away.reputation / e.home.reputation - 1);
  if (e.final) occupancy *= a.finalMult;
  const attendance = Math.round(e.home.stadium.capacity * Math.min(1, Math.max(0.05, occupancy)));
  return { attendance, revenue: Math.round(attendance * m.ticketPrice[tier]) };
}
