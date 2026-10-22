/** Tabela «História» de uma pessoa (RZ-229): uma linha por profissão e período, só com factos públicos. */
import { termsOf } from "../council/elections";
import { cityHistory } from "../city/cities";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { CompanyRecord } from "../persistence/types";
import type { EntityRef, HistoryRow } from "./contracts";

/** Empregados estimados: volume de negócio a dividir pelo volume típico por empregado da escala (pelo menos 1). */
const employeesOf = (c: Pick<CompanyRecord, "capital" | "scale">, params: Pick<Params, "companies">): number =>
  Math.max(1, Math.round(c.capital / params.companies.capitalPerEmployee[c.scale]));

export function personHistory(repo: Repository, data: BaseData, base: BaseData, params: Params, person: string, season: number): HistoryRow[] {
  const rows: HistoryRow[] = [];
  const club = (id: string): EntityRef => ({ k: "club", id, name: data.clubs.find((c) => c.id === id)?.name ?? data.foreignClubs?.find((c) => c.id === id)?.name ?? id });
  const pub = repo.publicPerson(person);
  const role = repo.role(person);

  // jogador: por época e clube (todas as competições somadas)
  const extras = repo.playerSeasonExtras(person);
  const lines = new Map<string, { season: number; club: string; matches: number; goals: number; assists: number }>();
  for (const s of repo.playerStats(person)) {
    const k = `${s.season}\u0000${s.club}`;
    const a = lines.get(k) ?? { season: s.season, club: s.club, matches: 0, goals: 0, assists: 0 };
    a.matches += s.matches; a.goals += s.goals; a.assists += s.assists;
    lines.set(k, a);
  }
  const goalkeeper = pub?.player?.position === "GK";
  for (const l of lines.values()) {
    const x = extras.find((e) => e.season === l.season && e.club === l.club);
    rows.push({ profession: goalkeeper ? "goalkeeper" : "player", season: l.season, club: club(l.club), matches: l.matches, goals: l.goals, assists: l.assists, cleanSheets: x?.cleanSheets ?? 0, ...(x?.avgRating !== undefined ? { avgRating: x.avgRating } : {}) });
  }
  // jogador ativo ainda sem jogos: uma linha com a época atual
  if (pub?.player && pub.club && !rows.some((r) => r.season === season)) {
    rows.push({ profession: goalkeeper ? "goalkeeper" : "player", season, club: club(pub.club), matches: 0, goals: 0, assists: 0, cleanSheets: 0 });
  }

  // autarca: população da localidade no ano em que lá trabalhou (fim do ano menos início)
  if (role?.fn === "mayor" && role.city) {
    const city = base.cities.find((c) => c.id === role.city);
    if (city) {
      const history = cityHistory(repo, base, params, city.id);
      const place: EntityRef = { k: "city", id: city.id, name: city.name };
      // só as épocas em que foi autarca (os mandatos vêm das eleições, RZ-236B)
      const terms = termsOf(repo, base, params, city.id);
      const spans = terms.map((t, i) => ({ person: t.person, from: t.from, to: (terms[i + 1]?.from ?? season + 1) - 1 })).filter((t) => t.person === person);
      for (let s = 1; s <= season; s++) {
        if (!spans.some((t) => s >= t.from && s <= t.to)) continue;
        const start = history.find((h) => h.season === s)?.state.population;
        const end = history.find((h) => h.season === s + 1)?.state.population;
        rows.push({ profession: "mayor", season: s, place, ...(start !== undefined && end !== undefined ? { populationChange: end - start } : {}) });
      }
    }
  }

  // empresário: as empresas que possui (ano de fundação como ano de entrada)
  for (const c of repo.companies().filter((x) => x.owner === person)) {
    const city = base.cities.find((x) => x.id === c.city);
    const sponsored = [...new Set(repo.companySponsorships(c.id, undefined).filter((s) => !s.ended).map((s) => s.club))].map(club);
    rows.push({ profession: "businessperson", season, place: { k: "city", id: c.city, name: city?.name ?? c.city }, company: c.name, employees: employeesOf(c, params), sponsored });
  }

  // pessoal de clube: vitórias, empates e derrotas do clube em cada época (o motor ainda não troca de pessoal a meio)
  if (role?.club && role.fn && ["coach", "assistant", "scout", "medical", "physio", "community"].includes(role.fn)) {
    const records = repo.clubSeasonRecords(role.club);
    for (let s = 1; s <= season; s++) {
      const r = records.find((x) => x.season === s);
      rows.push({ profession: "staff", fn: role.fn, season: s, club: club(role.club), wins: r?.wins ?? 0, draws: r?.draws ?? 0, losses: r?.losses ?? 0 });
    }
  }
  return rows.sort((a, b) => b.season - a.season);
}
