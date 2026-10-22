/** Vista da campanha autárquica do concelho do gamer (RZ-236B). Só o que o gamer pode saber; nunca os votos nem a verdade oculta. */
import type { BaseData } from "../data/types";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { CampaignView, ViewCityLevel } from "../api/contracts";
import { mayorOf } from "../council/agenda";
import { electionOf, gamerWeight, platformOf, promisesKept, termsOf } from "../council/elections";
import { relationOf } from "../council/relation";
import { levelOf } from "./state";

export function campaignView(repo: Repository, data: BaseData, params: Params): CampaignView | null {
  const club = data.clubs.find((c) => c.id === repo.meta("gamer.club"));
  const e = electionOf(repo);
  if (!club || !e || e.stage !== "campaign") return null;
  const list = e.cities[club.city] ?? [];
  const city = data.cities.find((c) => c.id === club.city);
  if (!city || list.length === 0) return null;
  const current = mayorOf(repo, data, club.city)?.person;
  const term = termsOf(repo, data, params, club.city).at(-1);
  return {
    city: { k: "city", id: city.id, name: city.name },
    date: e.date,
    weight: levelOf(gamerWeight(repo, data, params, club) * 100, params) as ViewCityLevel,
    candidates: list.map((c) => {
      const rel = repo.meta(`council.relation.${c.p}`) ? relationOf(repo, params, c.p) : undefined;
      const platform = platformOf(repo, params, c);
      return {
        person: { k: "person" as const, id: c.p, name: repo.publicPerson(c.p)?.sportingName ?? c.p },
        kind: c.k,
        current: c.p === current,
        ...platform,
        ...(rel ? { relation: { level: rel.level as ViewCityLevel, trend: rel.trend } } : {}),
        ...(c.k === "incumbent" && term ? { kept: promisesKept(repo, data, params, club.city, term) } : {}),
      };
    }),
    ...(e.choice !== undefined ? { choice: e.choice } : {}),
  };
}
