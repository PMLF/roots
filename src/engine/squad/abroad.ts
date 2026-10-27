/**
 * Mercado com o estrangeiro na passagem de época (RZ-237). Os clubes portugueses de IA vendem os seus destaques a clubes
 * estrangeiros por mais do que valem (entra dinheiro na categoria `transfers`) e repõem o plantel também com compras lá
 * fora, mais quanto melhor for o seu scouting. O resto do plantel continua a vir de livres e da formação.
 */
import type { Params, Tier } from "../config/parameters";
import type { BaseClub } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate, PlayerRecord } from "../persistence/types";
import { Rng, clamp } from "../random/rng";
import { ageAt } from "../calendar/dates";
import { adjustTransfers, clubBudget } from "../club/budget";
import { clubBalance, post } from "../club/finances";
import { marketValue } from "../market/value";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { scoutsOf } from "../scouting/scouting";
import { contractDates, wageFor } from "./youth";
import { foreignClubList } from "./foreign";

type Ctx = { season: number; seasonStart: IsoDate; seed: string };
const quality = (j: PlayerRecord): number => currentQuality(j.attributes as Attributes, (j.positions[0]?.pos ?? "CM") as Position);
const ageOf = (repo: Repository, j: PlayerRecord, on: IsoDate): number => ageAt((repo.person(j.person) as { birth: IsoDate }).birth, on);

const transferEvent = (repo: Repository, c: Ctx, person: string, seller: string, buyer: string, fee: number, kind: "sale" | "purchase") =>
  repo.appendEvent({ type: "TRANSFER", date: c.seasonStart, season: c.season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: person, roleKind: "player" }, { k: "club", id: seller, roleKind: "seller" }, { k: "club", id: buyer, roleKind: "buyer" }], data: { fee, abroad: kind } });

/** Vende ao estrangeiro os destaques do clube (acima do que o clube procura). Devolve quem saiu. */
export function sellAbroad(repo: Repository, params: Params, c: Ctx, club: BaseClub, tier: Tier, desired: number, squad: PlayerRecord[]): string[] {
  const s = params.squadCycle.abroad.sell;
  const clubs = foreignClubList(repo);
  if (clubs.length === 0) return [];
  const rng = new Rng(c.seed, `abroad/sell/${c.season}/${club.id}`);
  const sold: string[] = [];
  const candidates = squad
    .map((j) => ({ j, q: quality(j), age: ageOf(repo, j, c.seasonStart) }))
    .filter((x) => x.age <= s.maxAge && x.q >= desired + s.minAbove)
    .sort((a, b) => b.q - a.q || (a.j.person < b.j.person ? -1 : 1));
  for (const x of candidates) {
    if (sold.length >= s.maxPerClub) break;
    if (!rng.derive(`p/${x.j.person}`).prob(s.probability[tier])) continue;
    const buyers = clubs.filter((f) => (f.quality ?? 0) >= x.q - 1.5);
    if (buyers.length === 0) continue;
    const buyer = rng.derive(`b/${x.j.person}`).weighted(buyers, (f) => Math.max(0.1, (f.quality ?? 0) - x.q + 2));
    const ct = repo.contract(x.j.person);
    const wage = ct?.monthlyWage ?? 500;
    const value = marketValue({ quality: x.q, potential: x.j.potential, age: x.age, monthlyWage: wage, monthsLeft: ct ? Math.max(0, (Date.parse(ct.end) - Date.parse(c.seasonStart)) / 2_629_800_000) : 12 }, params);
    const fee = Math.round((value * rng.derive(`f/${x.j.person}`).float() * (s.feeFactor[1] - s.feeFactor[0]) + value * s.feeFactor[0]) / 100) * 100;
    repo.updatePlayer(x.j.person, { club: buyer.id });
    repo.saveContract({ person: x.j.person, club: buyer.id, monthlyWage: Math.round(wage * s.wageFactor), ...contractDates(c.seasonStart, rng.derive(`y/${x.j.person}`).integer(2, 4)) });
    post(repo, club, "transfers", fee);
    adjustTransfers(repo, club, params, c.season, fee);
    transferEvent(repo, c, x.j.person, club.id, buyer.id, fee, "sale");
    sold.push(x.j.person);
  }
  return sold;
}

export type ForeignPool = { list: { j: PlayerRecord; q: number; age: number; club: string }[] };

/** Os jogadores dos clubes estrangeiros que um clube português pode vir a contratar (calculado uma vez por passagem de época). */
export function foreignPool(repo: Repository, params: Params, c: Ctx): ForeignPool {
  const list: ForeignPool["list"] = [];
  for (const f of foreignClubList(repo)) for (const j of repo.clubPlayers(f.id)) if (j.state === "active") {
    const age = ageOf(repo, j, c.seasonStart);
    if (age <= params.squadCycle.abroad.buy.maxAge) list.push({ j, q: quality(j), age, club: f.id });
  }
  list.sort((a, b) => (a.j.person < b.j.person ? -1 : 1));
  return { list };
}

/** Tenta contratar no estrangeiro um jogador para a posição em falta. Devolve o jogador contratado, se houver. */
export function buyAbroad(repo: Repository, params: Params, c: Ctx, pool: ForeignPool, club: BaseClub, tier: Tier, wageScale: number, desired: number, position: Position, years: number): PlayerRecord | undefined {
  const b = params.squadCycle.abroad.buy;
  const scouts = scoutsOf(repo, club.id);
  const p = clamp(b.base + b.perScout * scouts.count + b.perScoutQuality * scouts.quality * Math.min(1, scouts.count), 0, b.max);
  const rng = new Rng(c.seed, `abroad/buy/${c.season}/${club.id}/${position}/${pool.list.length}`);
  if (!rng.prob(p)) return undefined;
  const budget = clubBudget(repo, club, params, c.season);
  let best = -1;
  let bestGap = Infinity;
  let bestFee = 0;
  pool.list.forEach((x, i) => {
    if ((x.j.positions[0]?.pos ?? "CM") !== position) return;
    const gap = Math.abs(x.q - desired);
    if (gap > b.tolerance || gap >= bestGap) return;
    const ct = repo.contract(x.j.person);
    const fee = Math.round((marketValue({ quality: x.q, potential: x.j.potential, age: x.age, monthlyWage: ct?.monthlyWage ?? 500, monthsLeft: 24 }, params) * b.feeFactor) / 100) * 100;
    if (fee > budget.transfers || fee > clubBalance(repo, club) * 0.5) return;
    best = i; bestGap = gap; bestFee = fee;
  });
  if (best < 0) return undefined;
  const [x] = pool.list.splice(best, 1) as [ForeignPool["list"][number]];
  repo.updatePlayer(x.j.person, { club: club.id, state: "active" });
  repo.saveContract({ person: x.j.person, club: club.id, monthlyWage: wageFor(params, tier, x.q, wageScale), ...contractDates(c.seasonStart, years) });
  post(repo, club, "transfers", -bestFee);
  adjustTransfers(repo, club, params, c.season, -bestFee);
  transferEvent(repo, c, x.j.person, x.club, club.id, bestFee, "purchase");
  return { ...x.j, club: club.id, state: "active" };
}
