/**
 * Assistência simples (RZ-115 v1): estádio × ocupação do escalão × valor do clube × cultura de futebol da cidade × dérbi ×
 * grande visitante × final. Determinística, sem aleatoriedade (o jogo já tem a sua). Forma, preço e decisões de subida/descida
 * entram na versão completa do RZ-115. A receita de bilheteira é a assistência × preço do escalão.
 */
import type { Params, StadiumSector } from "../config/parameters";
import type { BaseClub } from "../data/types";
import { factorReputation } from "./finances";

export type AttendanceInput = { home: BaseClub; away: BaseClub; footballCulture: number; final?: boolean; /** Multiplicador da cidade (mobilidade e turismo, RZ-233); 1 se não se conhece. */ cityFactor?: number;
  /** Setores à venda (RZ-116): lugares abertos, preço (múltiplo do escalão) e cobertura. Sem eles, vende-se a capacidade toda ao preço do escalão. */
  sectors?: { id: StadiumSector; seats: number; price: number; covered: boolean }[];
  /** Mês do jogo (1-12), para o mau tempo nos setores descobertos. */
  month?: number;
};

export function matchAttendance(e: AttendanceInput, params: Params): { attendance: number; revenue: number; /** Ocupação de cada setor, 0-1. */ bySector?: Partial<Record<StadiumSector, number>> } {
  const m = params.finances.model;
  const a = params.attendance;
  const tier = e.home.tier;
  let occupancy = m.occupancy[tier] * factorReputation(e.home, params) ** 0.5;
  occupancy *= 1 - m.cultureOccupancy + 2 * m.cultureOccupancy * (e.footballCulture / 100);
  const derby = e.home.rival === e.away.id || e.away.rival === e.home.id;
  if (derby) occupancy *= e.home.rival === e.away.id && e.away.rival === e.home.id ? a.mutualDerby : a.derby;
  if (e.away.reputation > e.home.reputation) occupancy *= 1 + a.bigCoefAway * Math.min(1, e.away.reputation / e.home.reputation - 1);
  if (e.final) occupancy *= a.finalMult;
  occupancy *= e.cityFactor ?? 1;
  if (e.sectors && e.sectors.length > 0) {
    // por setor: procura relativa (normalizada para a média do estádio ser a ocupação geral), preço, cobertura e mau tempo.
    // Com tudo a preço normal e sem coberturas dá a mesma assistência que o modelo simples.
    const s = params.stadium.pricing;
    const seatsTotal = e.sectors.reduce((t, x) => t + x.seats, 0);
    const meanDemand = e.sectors.reduce((t, x) => t + x.seats * s.demand[x.id], 0) / Math.max(1, seatsTotal);
    const bad = e.month !== undefined && s.badWeatherMonths.includes(e.month);
    let people = 0, takings = 0;
    const bySector: Partial<Record<StadiumSector, number>> = {};
    for (const x of e.sectors) {
      const priceRatio = x.price / (x.covered ? s.coverPremium : 1);
      const occ = Math.min(1, Math.max(0.05, occupancy * (s.demand[x.id] / meanDemand) * priceRatio ** -s.elasticity * (x.covered ? 1 + s.coverBoost + (bad ? s.badWeatherLoss : 0) : 1)));
      const n = Math.round(x.seats * occ);
      bySector[x.id] = occ;
      people += n;
      takings += n * m.ticketPrice[tier] * x.price;
    }
    return { attendance: people, revenue: Math.round(takings), bySector };
  }
  const attendance = Math.round(e.home.stadium.capacity * Math.min(1, Math.max(0.05, occupancy)));
  return { attendance, revenue: Math.round(attendance * m.ticketPrice[tier]) };
}
