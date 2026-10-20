/** Prémios e histórico das competições europeias (RZ-902): só os clubes portugueses recebem (os estrangeiros não têm finanças). Corre na transação de quem chama. */
import { post } from "../club/finances";
import { roundKey, type StageEvent } from "../competition/format/types";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { EUROPE_NAME, type EuropeKind } from "./europe";

export function announceEurope(repo: Repository, data: BaseData, params: Params, season: number, kind: EuropeKind, events: readonly StageEvent[], today: IsoDate): void {
  const competition = EUROPE_NAME[kind];
  const p = params.europe.competitions[kind].prizes;
  const byId = new Map(data.clubs.map((c) => [c.id, c] as const));
  const prize = (club: string, type: string, value: number, extra: Record<string, unknown> = {}) => {
    const cb = byId.get(club);
    if (!cb || value <= 0) return;
    post(repo, cb, "prizes", value);
    repo.appendEvent({ type: "COMPETITION_PRIZE", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "awarded" }, { k: "competition", id: competition }, ...(cb.city ? [{ k: "city" as const, id: cb.city, roleKind: "host" }] : [])], data: { competition, type, value, ...extra } });
  };
  for (const e of events) {
    if (e.type === "stageDone" && e.stage === 0) {
      // fim da fase de liga: participação, vitórias, empates e bónus de quem fica nos 8 primeiros
      const mine = new Set(e.outcome.ranking.filter((c) => byId.has(c)));
      const wins = new Map<string, number>();
      const draws = new Map<string, number>();
      for (const m of repo.competitionMatches(competition, season)) {
        if (m.homeGoals === m.awayGoals) for (const c of [m.home, m.away]) draws.set(c, (draws.get(c) ?? 0) + 1);
        else wins.set(m.homeGoals > m.awayGoals ? m.home : m.away, (wins.get(m.homeGoals > m.awayGoals ? m.home : m.away) ?? 0) + 1);
      }
      e.outcome.ranking.forEach((club, i) => {
        if (!mine.has(club)) return;
        const value = p.participation + (wins.get(club) ?? 0) * p.win + (draws.get(club) ?? 0) * p.draw + (i < 8 ? p.topEight : 0);
        prize(club, `${kind}LeaguePhase`, value, { position: i + 1, wins: wins.get(club) ?? 0, draws: draws.get(club) ?? 0 });
      });
    }
    if (e.type !== "roundPlayed") continue;
    const key = roundKey(e.label);
    for (const t of e.ties) {
      if (e.label.fromEnd === 0) {
        prize(t.winner, `${kind}Winner`, p.winner, { position: 1, round: key });
        prize(t.loser, `${kind}Finalist`, p.finalist, { position: 2, round: key });
        if (byId.has(t.winner)) repo.appendEvent({ type: "CHAMPION", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: t.winner, roleKind: "champion" }, { k: "competition", id: competition }], data: { league: competition, cup: true, runnerUp: t.loser } });
      } else {
        // play-off (fromEnd 4) → rounds[0], oitavos → [1], quartos → [2], meias → [3]
        const value = p.rounds[Math.max(0, Math.min(3, 4 - e.label.fromEnd))] ?? 0;
        prize(t.winner, `${kind}Round`, value, { round: key });
      }
    }
  }
}
