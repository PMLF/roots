/**
 * Plano de jogo do clube do gamer (RZ-158): tática e onze escolhidos, guardados no save (`plan.<clube>`). Pode mudar-se
 * a qualquer momento. Sem onze escolhido, joga-se com o automático. Quem estiver lesionado ou suspenso no dia do jogo é
 * trocado pelo melhor disponível para a mesma posição. O avanço pára antes do jogo do clube até o gamer o confirmar.
 */
import type { Params } from "../config/parameters";
import { clubSuspended } from "../discipline/suspensions";
import { aptitudeIn, automaticLineup, type LineupCandidate } from "../match/team";
import { FORMATIONS, DEFAULT_TACTIC, STYLES } from "../match/formations";
import type { OnPitchPlayer, Tactic } from "../match/types";
import { INJURY_EVENT } from "../injuries/state";
import type { Attributes, Position } from "../world/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

export type Plan = { tactic: Tactic; /** Sem onze, usa-se o automático. */ lineup?: { player: string; position: Position }[] };

const rowKey = (club: string) => `plan.${club}`;
const confirmationKey = (match: string) => `confirmed.${match}`;

export function readPlan(repo: Repository, club: string): Plan {
  const raw = repo.meta(rowKey(club));
  if (!raw) return { tactic: { ...DEFAULT_TACTIC } };
  try {
    const p = JSON.parse(raw) as Plan;
    return { tactic: { ...DEFAULT_TACTIC, ...p.tactic }, ...(p.lineup ? { lineup: p.lineup } : {}) };
  } catch {
    return { tactic: { ...DEFAULT_TACTIC } };
  }
}

const validLevel = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;

/** Lança se a tática não fizer sentido. */
export function validateTactic(t: Tactic): void {
  if (!(t.formation in FORMATIONS)) throw new Error("Formação desconhecida");
  if (!STYLES.includes(t.style)) throw new Error("Estilo desconhecido");
  for (const k of ["intensity", "line", "tempo", "fairPlay"] as const) if (!validLevel(t[k])) throw new Error(`${k} deve ser de 1 a 5`);
}

/** Valida e guarda. Lança se a tática ou o onze não fizerem sentido. */
export function savePlan(repo: Repository, club: string, plan: Plan): void {
  const t = plan.tactic;
  validateTactic(t);
  if (plan.lineup) {
    const squad = new Set(repo.clubPlayers(club).filter((j) => j.state === "active").map((j) => j.person));
    if (plan.lineup.length !== 11) throw new Error("O onze tem de ter 11 jogadores");
    if (new Set(plan.lineup.map((o) => o.player)).size !== 11) throw new Error("Jogador repetido no onze");
    if (plan.lineup.some((o) => !squad.has(o.player))) throw new Error("Há jogadores que não são do plantel");
    const expected = [...FORMATIONS[t.formation]].sort().join(",");
    if (plan.lineup.map((o) => o.position).sort().join(",") !== expected) throw new Error("As posições do onze não correspondem à formação");
  }
  repo.setMeta(rowKey(club), JSON.stringify(plan));
}

export const confirmMatch = (repo: Repository, match: string) => repo.setMeta(confirmationKey(match), "1");
export const confirmedMatch = (repo: Repository, match: string) => repo.meta(confirmationKey(match)) === "1";

export type Unavailable = { player: string; reason: "injury" | "suspended"; detail?: number };

/** Lesionados e suspensos de um clube para um jogo. */
export function unavailable(repo: Repository, club: string, players: readonly string[], competition: string, season: number, round: number, today: IsoDate, seed: string, params: Params): Map<string, Unavailable> {
  const out = new Map<string, Unavailable>();
  for (const e of repo.eventsOf({ k: "club", id: club }, { type: INJURY_EVENT })) {
    const until = (e.data as { until?: IsoDate }).until;
    const j = e.entities.find((x) => x.k === "person" && x.roleKind === "injured");
    if (j && until && e.date <= today && until > today) out.set(j.id, { player: j.id, reason: "injury" });
  }
  for (const s of clubSuspended(repo, club, players, competition, season, round, seed, params)) out.set(s.player, { player: s.player, reason: "suspended", detail: s.matchesPerMeet });
  return out;
}

/** Aplica o plano aos candidatos: o onze escolhido, com os indisponíveis trocados pelo melhor disponível na posição. */
export function planLineup(plan: Plan, candidates: readonly LineupCandidate[], away: ReadonlySet<string>, params?: Params): OnPitchPlayer[] {
  const positions = FORMATIONS[plan.tactic.formation];
  const free = candidates.filter((c) => !away.has(c.person));
  const use = free.length >= 12 ? free : [...candidates]; // plantel desfalcado: joga quem houver
  if (!plan.lineup) return automaticLineup(use, positions, params);
  const porId = new Map(candidates.map((c) => [c.person, c] as const));
  const lineup: OnPitchPlayer[] = [];
  const busy = new Set<string>();
  const vacancies: Position[] = [];
  for (const o of plan.lineup) {
    const c = porId.get(o.player);
    if (c && (!away.has(o.player) || use === candidates)) {
      lineup.push({ id: c.person, position: o.position, attributes: c.attributes as Attributes, heightCm: c.heightCm, form: c.form ?? 1, ...(params ? { aptitude: aptitudeIn(c.positions, o.position, params), positions: c.positions } : {}) });
      busy.add(c.person);
    } else vacancies.push(o.position);
  }
  if (vacancies.length > 0) {
    const remaining = use.filter((c) => !busy.has(c.person));
    const extra = automaticLineup(remaining, vacancies, params);
    lineup.push(...extra);
  }
  return lineup;
}
