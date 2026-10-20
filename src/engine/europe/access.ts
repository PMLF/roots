/**
 * Acesso de Portugal às competições europeias (RZ-252): quantas vagas a Primeira Liga dá depende do lugar de Portugal no
 * ranking de associações (coeficiente: pontos por clube das últimas épocas); a Taça e os vencedores europeus entram à
 * maneira da vida real, e quando o vencedor já estava apurado a vaga desce para o clube seguinte da liga.
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { foreignClubList } from "../squad/foreign";
import { EUROPE_NAME, EUROPEAN } from "./europe";
import type { EuropeSlots } from "./zones";
export type { EuropeSlots } from "./zones";


const PT = "pt";
const slotsKey = (season: number) => `europe.slots.${season}`;

/** Coeficiente de cada país: soma, nas últimas épocas, dos pontos por clube (vitória 2, empate 1); épocas sem história valem um valor de partida. */
export function associationRanking(repo: Repository, data: BaseData, params: Params, season: number): { country: string; coefficient: number }[] {
  const a = params.europe.access;
  const foreign = foreignClubList(repo);
  const countryOf = new Map<string, string>([...data.clubs.map((c) => [c.id, PT] as const), ...foreign.map((c) => [c.id, c.country] as const)]);
  const quality = new Map<string, number[]>();
  for (const c of foreign) (quality.get(c.country) ?? quality.set(c.country, []).get(c.country)!).push(c.quality);
  const countries = [PT, ...quality.keys()];
  const prior = new Map<string, number>(countries.map((c) => [c, ((c === PT ? a.portugalQuality : mean(quality.get(c) ?? [0])) * a.pointsPerQuality)] as const));
  const total = new Map<string, number>(countries.map((c) => [c, 0] as const));
  const first = Math.max(1, season - a.seasonsCounted);
  const missing = a.seasonsCounted - (season - first);
  for (const c of countries) total.set(c, (prior.get(c) ?? 0) * missing);
  for (let s = first; s < season; s++) {
    const points = new Map<string, number>();
    const clubs = new Map<string, Set<string>>();
    for (const kind of EUROPEAN) {
      for (const m of repo.competitionMatches(EUROPE_NAME[kind], s)) {
        for (const [club, mine, theirs] of [[m.home, m.homeGoals, m.awayGoals], [m.away, m.awayGoals, m.homeGoals]] as const) {
          const country = countryOf.get(club);
          if (!country) continue;
          points.set(country, (points.get(country) ?? 0) + (mine > theirs ? 2 : mine === theirs ? 1 : 0));
          (clubs.get(country) ?? clubs.set(country, new Set()).get(country)!).add(club);
        }
      }
    }
    for (const c of countries) total.set(c, (total.get(c) ?? 0) + (clubs.get(c)?.size ? (points.get(c) ?? 0) / (clubs.get(c) as Set<string>).size : 0));
  }
  return countries.map((country) => ({ country, coefficient: total.get(country) ?? 0 })).sort((x, y) => y.coefficient - x.coefficient || (x.country === PT ? -1 : y.country === PT ? 1 : x.country < y.country ? -1 : 1));
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

/** Vagas de Portugal para a classificação da época (calculadas com os resultados europeus até à época anterior). */
export function computeSlots(repo: Repository, data: BaseData, params: Params, season: number): EuropeSlots {
  const ranking = associationRanking(repo, data, params, season);
  const rank = ranking.findIndex((r) => r.country === PT) + 1;
  const band = params.europe.access.bands.find((b) => rank <= b.maxRank) ?? params.europe.access.bands.at(-1)!;
  return { rank, championsLeague: band.championsLeague, championsQualifying: band.championsQualifying, europaLeague: band.europaLeague, conferenceLeague: band.conferenceLeague };
}

/** As vagas guardadas no início da época; se ainda não foram guardadas, calculam-se (sem escrever). */
export function europeSlots(repo: Repository, data: BaseData, params: Params, season: number): EuropeSlots {
  const raw = repo.meta(slotsKey(season));
  return raw ? (JSON.parse(raw) as EuropeSlots) : computeSlots(repo, data, params, season);
}

/** Guarda as vagas da época (corre dentro de uma transação). */
export function saveSlots(repo: Repository, data: BaseData, params: Params, season: number): EuropeSlots {
  const existing = repo.meta(slotsKey(season));
  if (existing) return JSON.parse(existing) as EuropeSlots;
  const slots = computeSlots(repo, data, params, season);
  repo.setMeta(slotsKey(season), JSON.stringify(slots));
  return slots;
}

export type PortugueseEntries = { championsLeague: string[]; championsQualifying: string[]; europaLeague: string[]; conferenceLeague: string[] };
export type Winners = { cup?: string | undefined; champions?: string | undefined; europa?: string | undefined; conference?: string | undefined };

/**
 * Reparte as vagas de Portugal. `order` é a classificação da Primeira Liga; os vencedores europeus (Liga dos Campeões e Liga Europa →
 * Liga dos Campeões; Conferência → Liga Europa) e da Taça (→ Liga Europa) entram à frente; se já estavam apurados para a prova (ou
 * para melhor), a vaga passa ao clube seguinte da liga; as restantes descem um lugar.
 */
export function allocateEntries(order: readonly string[], slots: EuropeSlots, winners: Winners): PortugueseEntries {
  const TIERS = ["championsLeague", "championsQualifying", "europaLeague", "conferenceLeague"] as const;
  const assigned = new Map<string, number>();
  const claim = (club: string | undefined, tier: number) => { if (club && !(assigned.has(club) && (assigned.get(club) as number) <= tier)) assigned.set(club, tier); };
  claim(winners.champions, 0);
  claim(winners.europa, 0);
  claim(winners.conference, 2);
  const pool = (europaLeague: number, skip: ReadonlyMap<string, number>): Map<string, number> => {
    const list = [...Array(slots.championsLeague).fill(0), ...Array(slots.championsQualifying).fill(1), ...Array(europaLeague).fill(2), ...Array(slots.conferenceLeague).fill(3)] as number[];
    const out = new Map<string, number>();
    let i = 0;
    for (const club of order) { if (i >= list.length) break; if (skip.has(club)) continue; out.set(club, list[i++] as number); }
    return out;
  };
  let result = pool(slots.europaLeague, assigned);
  const cup = winners.cup;
  if (cup) {
    const already = assigned.get(cup);
    const viaLeague = result.get(cup);
    if ((already !== undefined && already <= 2) || (viaLeague !== undefined && viaLeague <= 2)) {
      // já tinha Liga Europa (ou melhor): a vaga da Taça desce para o clube seguinte
      result = pool(slots.europaLeague + 1, assigned);
    } else {
      assigned.set(cup, 2);
      result = pool(slots.europaLeague, assigned);
    }
  }
  const out: PortugueseEntries = { championsLeague: [], championsQualifying: [], europaLeague: [], conferenceLeague: [] };
  for (const [club, tier] of [...assigned, ...result].sort((a, b) => a[1] - b[1] || order.indexOf(a[0]) - order.indexOf(b[0]))) out[TIERS[tier] as keyof PortugueseEntries].push(club);
  return out;
}
