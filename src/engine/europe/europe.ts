/**
 * Competições europeias (RZ-902, formato de 2024/25), à imagem das verdadeiras e sobre o motor genérico de competições:
 *  - **Liga dos Campeões** e **Liga Europa**: 36 clubes em 4 potes, fase de liga «suíça» de 8 jogos (2 contra cada pote, um em
 *    casa e outro fora), uma só tabela;
 *  - **Liga Conferência**: 36 clubes em 6 potes, 6 jogos (1 contra cada pote);
 *  - nas três, os 8 primeiros vão direto aos oitavos, do 9.º ao 24.º jogam um play-off a duas mãos (os 9.º-16.º, cabeças de
 *    série, jogam a 2.ª mão em casa), do 25.º para baixo ficam fora; oitavos, quartos e meias a duas mãos; final a uma mão em
 *    campo neutro. Não há golos fora: se o agregado ficar empatado, prolongamento e penáltis na 2.ª mão (ou na final).
 * Os clubes portugueses entram pela classificação da Primeira Liga da época anterior (e a Taça de Portugal dá lugar na Liga
 * Europa); os restantes vêm dos clubes estrangeiros inventados (`world/foreign.ts`), ordenados pela força do plantel.
 */
import { addDays, createDate, nextWeekday } from "../calendar/dates";
import type { CompetitionDef, Entrant } from "../competition/format/types";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import { DEFAULT_FORMATION, lineupWithValue } from "../match/team";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { Rng } from "../random/rng";
import { foreignClubList } from "../squad/foreign";
import { allocateEntries, type EuropeSlots, type Winners } from "./access";

export type EuropeKind = keyof Params["europe"]["competitions"];
export const CHAMPIONS_LEAGUE = "Liga dos Campeões";
export const EUROPA_LEAGUE = "Liga Europa";
export const CONFERENCE_LEAGUE = "Liga Conferência";
export const EUROPEAN: readonly EuropeKind[] = ["championsLeague", "europaLeague", "conferenceLeague"];
export const EUROPE_NAME: Record<EuropeKind, string> = { championsLeague: CHAMPIONS_LEAGUE, europaLeague: EUROPA_LEAGUE, conferenceLeague: CONFERENCE_LEAGUE };
export const europeKind = (competition: string): EuropeKind | undefined => EUROPEAN.find((k) => EUROPE_NAME[k] === competition);
export const isEuropean = (competition: string): boolean => europeKind(competition) !== undefined;

/** A definição de uma competição europeia: fase de liga e, a seguir, o play-off e as eliminatórias. */
export function europeDef(kind: EuropeKind, params: Params): CompetitionDef {
  const c = params.europe.competitions[kind];
  return {
    id: EUROPE_NAME[kind],
    stages: [
      { kind: "leaguePhase", name: EUROPE_NAME[kind], pots: c.pots, perPot: c.perPot },
      { kind: "knockout", name: EUROPE_NAME[kind], legs: 2, finalLegs: 1, finalNeutral: true, rules: { pairing: "seeded", advantage: "betterSeed" } },
    ],
    // 1.º-8.º entram só nos oitavos; 9.º-24.º jogam o play-off (a ordem da tabela é o seed)
    qualify: (_stage, outcomes, all) => {
      const r = outcomes[0]?.ranking ?? [];
      const e = (club: string, seed: number): Entrant => ({ ...(all.get(club) as Entrant), seed });
      return { entrants: r.slice(8, 24).map((club, i) => e(club, 9 + i)), lateWaves: [r.slice(0, 8).map((club, i) => e(club, 1 + i))] };
    },
  };
}

export type EuropeDates = { leaguePhase: IsoDate[]; knockout: IsoDate[] };

/** Datas de uma competição europeia numa época: jornadas a meio da semana, eliminatórias (duas mãos) e a final. */
export function europeDates(params: Params, season: number, kind: EuropeKind): EuropeDates {
  const eu = params.europe;
  const c = eu.competitions[kind];
  const first = nextWeekday(createDate(params.calendar.initialYear + season - 1, eu.calendar.anchor.month, eu.calendar.anchor.day), c.weekday);
  const base = (week: number) => addDays(first, week * 7);
  const final = nextWeekday(base(c.finalWeek), c.finalWeekday);
  return { leaguePhase: eu.calendar.leaguePhaseWeeks.map(base), knockout: [...eu.calendar.knockoutWeeks.map(base), final] };
}

/** Força de um plantel: o valor médio do melhor onze (escala 1-20). */
function squadStrength(repo: Repository, club: string, params: Params): number {
  const candidates = repo.clubPlayers(club).filter((j) => j.state === "active").map((j) => ({ person: j.person, positions: j.positions, attributes: j.attributes, heightCm: j.heightCm }));
  return candidates.length < 11 ? 0 : lineupWithValue(candidates, DEFAULT_FORMATION, params).value;
}

export type EuropeEntrants = Record<EuropeKind, Entrant[]>;

/** Quem ganhou (na época anterior) a Taça e as três provas europeias. */
export type PreviousWinners = Winners;

/**
 * Quem joga cada competição europeia na época. `undefined` se o save não tem clubes estrangeiros suficientes (saves antigos).
 * Portugal: vagas pelo ranking (`access.ts`) sobre a classificação da Primeira Liga da época anterior (na 1.ª época, pela reputação),
 * com a Taça e os vencedores europeus. A vaga de pré-eliminatória da Liga dos Campeões joga-se contra um clube estrangeiro; quem
 * perde cai para a Liga Europa. O resto: os clubes estrangeiros mais fortes (os vencedores europeus estrangeiros entram sempre).
 */
export function europeEntrants(repo: Repository, data: BaseData, params: Params, season: number, winners: PreviousWinners, previousTable: readonly string[] | undefined, slots: EuropeSlots): EuropeEntrants | undefined {
  const eu = params.europe;
  const foreign = foreignClubList(repo);
  const top = data.clubs.filter((c) => c.tier === "firstLeague");
  const order = previousTable && previousTable.length > 0 ? previousTable.filter((id) => data.clubs.some((c) => c.id === id)) : [...top].sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1)).map((c) => c.id);
  const known = (id: string | undefined) => (id && data.clubs.some((c) => c.id === id) ? id : undefined);
  const pt = allocateEntries(order, slots, { cup: known(winners.cup), champions: known(winners.champions), europa: known(winners.europa), conference: known(winners.conference) });
  const q = pt.championsQualifying.length;
  const need = { championsLeague: eu.size - pt.championsLeague.length - q, europaLeague: eu.size - pt.europaLeague.length - q, conferenceLeague: eu.size - pt.conferenceLeague.length };
  if (foreign.length < need.championsLeague + need.europaLeague + need.conferenceLeague + q) return undefined;
  const strength = new Map<string, number>();
  const ratingOf = (id: string) => strength.get(id) ?? strength.set(id, squadStrength(repo, id, params)).get(id) as number;
  const sorted = [...foreign].sort((a, b) => ratingOf(b.id) - ratingOf(a.id) || (a.id < b.id ? -1 : 1)).map((c) => c.id);
  const taken = new Set<string>();
  const fill = (n: number): string[] => { const out: string[] = []; for (const id of sorted) { if (out.length >= n) break; if (!taken.has(id)) { out.push(id); taken.add(id); } } return out; };
  const force = (id: string | undefined, into: string[]) => { if (id && foreign.some((c) => c.id === id) && !taken.has(id)) { into.push(id); taken.add(id); } };
  // vencedores estrangeiros: Liga dos Campeões e Liga Europa → Liga dos Campeões; Conferência → Liga Europa
  const cl: string[] = [];
  const el: string[] = [];
  force(winners.champions, cl); force(winners.europa, cl); force(winners.conference, el);
  const out = {} as EuropeEntrants;
  const abroad: Record<EuropeKind, string[]> = { championsLeague: [], europaLeague: [], conferenceLeague: [] };
  abroad.championsLeague = [...cl, ...fill(need.championsLeague - cl.length)];
  const opponents = fill(q);
  abroad.europaLeague = [...el, ...fill(need.europaLeague - el.length)];
  abroad.conferenceLeague = fill(need.conferenceLeague);
  // pré-eliminatória: o vencedor fica com a vaga na Liga dos Campeões, o vencido cai para a Liga Europa
  const rng = new Rng(repo.meta("seed") ?? "?", `europe/qualifier/${season}`);
  const joined: Record<EuropeKind, string[]> = { championsLeague: [...pt.championsLeague, ...abroad.championsLeague], europaLeague: [...pt.europaLeague, ...abroad.europaLeague], conferenceLeague: [...pt.conferenceLeague, ...abroad.conferenceLeague] };
  pt.championsQualifying.forEach((club, i) => {
    const rival = opponents[i] as string;
    const p = 1 / (1 + Math.exp(-eu.access.qualifierSensitivity * (ratingOf(club) - ratingOf(rival))));
    const [winner, loser] = rng.derive(`${club}|${rival}`).prob(p) ? [club, rival] : [rival, club];
    joined.championsLeague.push(winner);
    joined.europaLeague.push(loser);
    repo.appendEvent({ type: "EUROPE_QUALIFIER", date: (repo.meta("date.today") as IsoDate | undefined) ?? createDate(params.calendar.initialYear + season - 1, params.calendar.seasonStartMonth, 1), season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "qualifier" }], data: { competition: CHAMPIONS_LEAGUE, opponent: rival, won: winner === club } });
  });
  for (const k of EUROPEAN) out[k] = joined[k].sort((a, b) => ratingOf(b) - ratingOf(a) || (a < b ? -1 : 1)).map((club, i) => ({ club, seed: i + 1, tier: 0 }));
  return out;
}
