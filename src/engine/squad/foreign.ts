/** Ciclo anual dos plantéis das ligas estrangeiras (RZ-230): envelhecem, renovam e recebem jovens para se manterem estáveis. */
import { ageAt } from "../calendar/dates";
import type { BaseClub } from "../data/types";
import type { Params } from "../config/parameters";
import { Rng, clamp } from "../random/rng";
import type { Repository } from "../persistence/repository";
import type { IsoDate, WorldBatchRecord } from "../persistence/types";
import type { ForeignClub } from "../world/foreign";
import { distributePositions } from "../world/generateWorld";
import type { Position } from "../world/types";
import { developPlayer } from "./development";
import { retirementProbability } from "./rollover";
import { createYouth } from "./youth";

export const foreignClubList = (repo: Repository): ForeignClub[] => {
  const raw = repo.meta("foreign.clubs");
  return raw ? (JSON.parse(raw) as ForeignClub[]) : [];
};

export function rolloverForeign(repo: Repository, params: Params, o: { season: number; seasonStart: IsoDate }, batch: WorldBatchRecord, newId: () => string): number {
  let changes = 0;
  const seed = repo.meta("seed") ?? "?";
  for (const fc of foreignClubList(repo)) {
    const rng = new Rng(seed, `rollover/${o.season}/${fc.id}`);
    const kept: Position[] = [];
    for (const j of repo.clubPlayers(fc.id)) {
      if (j.state !== "active") continue;
      const birth = (repo.person(j.person) as { birth: IsoDate }).birth;
      const age = ageAt(birth, o.seasonStart);
      const position = (j.positions[0]?.pos ?? "CM") as Position;
      const prng = rng.derive(`player/${j.person}`);
      if (prng.derive("retire").prob(retirementProbability(age, position, false, params))) {
        repo.updatePlayer(j.person, { state: "retired", club: null });
        changes++;
        continue;
      }
      const d = developPlayer(prng.derive("develop"), { attributes: j.attributes, potential: j.potential, position, age }, params);
      repo.updatePlayer(j.person, { attributes: d.attributes, potential: d.potential });
      const ct = repo.contract(j.person);
      if (ct && ct.end < o.seasonStart) {
        const years = prng.derive("years").integer(1, 3);
        repo.saveContract({ ...ct, start: o.seasonStart, end: `${Number(o.seasonStart.slice(0, 4)) + years}-06-30` });
      }
      kept.push(position);
    }
    // jovens para repor o plantel
    const size = params.world.foreignLeagues.squad;
    const club = { id: fc.id, name: fc.name, city: "", district: "", tier: fc.tier } as unknown as BaseClub;
    const tq = params.world.targetQuality[fc.tier];
    const quality = fc.quality ?? tq.mean;
    const wanted = distributePositions(size, params.world.placesByPosition);
    const left = new Map<Position, number>();
    for (const p of kept) left.set(p, (left.get(p) ?? 0) + 1);
    for (const position of wanted) {
      const have = left.get(position) ?? 0;
      if (have > 0) { left.set(position, have - 1); continue; }
      const kit = createYouth(rng.derive(`youth/${batch.people.length}`), { id: newId(), club, tier: fc.tier, position, targetQuality: clamp(rng.gauss(quality - 0.5, tq.deviation), 1, 20), wageScale: 1, seasonStart: o.seasonStart, years: rng.integer(1, 3), cities: [], districtCities: [], nationality: fc.country, nameFamily: fc.family }, params);
      batch.people.push(kit.person);
      batch.players.push(kit.player);
      batch.contracts.push(kit.contract);
      changes++;
    }
  }
  return changes;
}
