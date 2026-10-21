/**
 * Últimos jogos de um clube em todas as competições (cartão da página inicial, RZ-245).
 * Código novo em inglês (CLAUDE.md).
 */
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { cupKind } from "../season/competitions";
import { europeKind } from "../europe/europe";
import { currentSeason, pyramidData } from "../season/seasonPyramid";

/** Chave do nome curto da competição: um escalão ou um tipo de taça/fase (a UI traduz: 1L, 2L, 3L, CP, Dist., TP, TD, ST, SD, FP). */
type CompetitionShort = "firstLeague" | "secondLeague" | "thirdLeague" | "cp" | "district" | "cup" | "districtCup" | "supercup" | "districtSupercup" | "promotion" | "championsLeague" | "europaLeague" | "conferenceLeague";

export type RecentMatch = {
  id: string;
  date: string;
  competition: string;
  short: CompetitionShort;
  opponent: string;
  opponentName: string;
  atHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  /** Prolongamento/penáltis (taças). */
  shootout?: { for: number; against: number };
  extraTime?: boolean;
  outcome: "win" | "draw" | "loss";
};

export function recentMatches(repo: Repository, data: BaseData, club: string, limit = 3, season = currentSeason(repo)): RecentMatch[] {
  const clubs = new Map(pyramidData(repo, data, season).clubs.map((c) => [c.id, c] as const));
  const name = (id: string) => data.clubs.find((c) => c.id === id)?.name ?? data.foreignClubs?.find((c) => c.id === id)?.name ?? id;
  const shortOf = (competition: string): CompetitionShort => {
    const k = cupKind(competition);
    const eu = europeKind(competition);
    if (eu) return eu;
    if (k === "cup") return "cup";
    if (k === "supercup") return "supercup";
    if (k === "districtCup") return "districtCup";
    if (k === "districtSupercup") return "districtSupercup";
    if (competition.startsWith("Fase de Promoção")) return "promotion";
    if (competition.startsWith("CP ")) return "cp";
    return (clubs.get(club)?.tier ?? "district") as CompetitionShort;
  };
  const played = repo.clubCalendar(club, season).flatMap((g) => {
    const m = repo.match(g.id);
    return m ? [{ g, m }] : [];
  });
  played.sort((a, b) => (a.g.date < b.g.date ? -1 : a.g.date > b.g.date ? 1 : 0));
  return played.slice(-limit).reverse().map(({ g, m }) => {
    const home = m.home === club;
    const gf = home ? m.homeGoals : m.awayGoals;
    const ga = home ? m.awayGoals : m.homeGoals;
    const pf = home ? m.homePenalties : m.awayPenalties;
    const pa = home ? m.awayPenalties : m.homePenalties;
    const win = gf !== ga ? gf > ga : pf !== undefined && pa !== undefined && pf !== pa ? pf > pa : undefined;
    const opponent = home ? m.away : m.home;
    return {
      id: g.id, date: g.date, competition: g.competition, short: shortOf(g.competition), opponent, opponentName: name(opponent), atHome: home, goalsFor: gf, goalsAgainst: ga,
      ...(pf !== undefined && pa !== undefined ? { shootout: { for: pf, against: pa } } : {}),
      ...(m.extraTime ? { extraTime: true } : {}),
      outcome: win === undefined ? "draw" : win ? "win" : "loss",
    };
  });
}
