/**
 * O que um clube leva para o jogo além do plantel (RZ-263): a qualidade do treinador e do staff médico, e o ambiente do estádio
 * (tamanho do estádio e cultura futebolística da cidade), que dá força a quem joga em casa.
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { stadiumCapacity } from "../club/stadiumState";

export type ClubEdge = { coach: number; medical: number; /** -1..1: médico/fisio prudente (paciente) arrisca menos e recupera mais devagar. */ caution: number; /** 0-1: 0,5 = ambiente normal. */ crowd: number };

const mean = (xs: number[]) => (xs.length === 0 ? 10 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Ambiente do estádio, 0-1: mistura do tamanho do estádio (em escala logarítmica) com a cultura futebolística da cidade. */
export function crowdOf(capacity: number, culture: number, params: Params): number {
  const e = params.match.edge;
  const size = Math.min(1, Math.max(0, Math.log(Math.max(1, capacity) / e.smallStadium) / Math.log(e.bigStadium / e.smallStadium)));
  return Math.min(1, Math.max(0, e.capacityWeight * size + (1 - e.capacityWeight) * Math.min(1, Math.max(0, culture / 100))));
}

export function clubEdge(repo: Repository, data: BaseData, club: string, params: Params): ClubEdge {
  const base = data.clubs.find((c) => c.id === club);
  const quality = (fn: string): Record<string, number> | undefined => {
    const holder = repo.publicRoles({ club }).find((p) => p.fn === fn);
    return holder ? repo.role(holder.id)?.quality : undefined;
  };
  const coach = quality("coach");
  const medical = quality("medical");
  const holder = (fn: string) => repo.publicRoles({ club }).find((p) => p.fn === fn)?.id;
  const t = params.staff.traits;
  const assistantId = holder("assistant");
  const assistant = assistantId ? repo.role(assistantId)?.quality : undefined;
  const assistantBonus = assistant ? t.assistantPoints * (mean([assistant.tactics ?? 10, assistant.motivation ?? 10]) - 10) + t.assistantProfessionalism * ((repo.person(assistantId!)?.personality.professionalism ?? 10) - 10) : 0;
  const medId = holder("medical"), physioId = holder("physio");
  const cautions = [medId, physioId].flatMap((id) => (id ? [((repo.person(id)?.personality.patience ?? 10) - 10) / 10] : []));
  const cultureEvent = base ? repo.last("CITY_SEASON", { k: "city", id: base.city }) : undefined;
  const culture = Number((cultureEvent?.data as { footballCulture?: number } | undefined)?.footballCulture ?? 50);
  return {
    coach: (coach ? mean([coach.tactics ?? 10, coach.motivation ?? 10]) : 10) + assistantBonus,
    medical: medical?.medicine ?? 10,
    caution: cautions.length > 0 ? mean(cautions) : 0,
    crowd: base ? crowdOf(stadiumCapacity(repo, base, params), culture, params) : 0.5,
  };
}
