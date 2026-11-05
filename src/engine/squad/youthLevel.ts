/**
 * Formação do clube (RZ-234): quanto do talento da terra o clube consegue aproveitar. É um nível oculto (0-100) que se move devagar,
 * em direção a um alvo que depende da aposta nos jovens do presidente (paciência/ambição), da qualidade do treinador, dos meios do
 * clube (finanças contra o escalão) e da educação da cidade. O gamer vê-o em palavras com seta e causa. O aproveitamento
 * (`yieldOf`, 0,4 a 1,0) multiplica a entrada de jovens e dá potencial extra aos que saem da formação.
 */
import { clamp } from "../random/rng";
import { cityStateNow } from "../city/cities";
import type { Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { youthFocus } from "./youthFocus";
import { consumeCouncilYouth, councilYouthBonus } from "../council/requests";

export type YouthDriver = "patience" | "coach" | "finances" | "education" | "council";
type Stored = { v: number; prev: number; cause?: YouthDriver };

const key = (club: string) => `youth.level.${club}`;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 1;
};

/** Para onde o nível do clube tende e o que mais pesa nisso (positivo ou negativo). */
export function youthTarget(repo: Repository, data: BaseData, params: Params, club: BaseClub): { target: number; terms: Record<YouthDriver, number> } {
  const d = params.squadCycle.youth.development;
  const focus = youthFocus(repo, club, club.tier, params);
  const coachRole = repo.publicRoles({ club: club.id }).find((p) => p.fn === "coach");
  const q = coachRole ? repo.role(coachRole.id)?.quality : undefined;
  const coach = q ? ((q.tactics ?? 10) + (q.motivation ?? 10)) / 2 : 10;
  const sameTier = data.clubs.filter((c) => c.tier === club.tier).map((c) => c.finances);
  const money = Math.log2(Math.max(0.01, club.finances / Math.max(1, median(sameTier))));
  const education = cityStateNow(repo, data, params, club.city)?.education ?? 50;
  const terms: Record<YouthDriver, number> = {
    patience: d.byFocus * (focus - 1),
    coach: d.byCoach * (coach - 10),
    finances: d.byFinances * clamp(money, -2, 2),
    education: d.byEducation * (education - 50),
    council: councilYouthBonus(repo, params, club.id),
  };
  return { target: clamp(d.base + terms.patience + terms.coach + terms.finances + terms.education + terms.council, 5, 95), terms };
}

const read = (repo: Repository, club: string): Stored | undefined => {
  const raw = repo.meta(key(club));
  return raw ? (JSON.parse(raw) as Stored) : undefined;
};

/** Nível de formação do clube agora (sem história guardada, o do alvo) e o do ano anterior. */
export function youthLevelOf(repo: Repository, data: BaseData, params: Params, club: BaseClub): { value: number; previous: number; cause?: YouthDriver } {
  const s = read(repo, club.id);
  if (s) return { value: s.v, previous: s.prev, ...(s.cause ? { cause: s.cause } : {}) };
  const t = youthTarget(repo, data, params, club).target;
  return { value: t, previous: t };
}

/** Aproveitamento do talento da terra (0,4 a 1,0). */
export function yieldOf(level: number, params: Params): number {
  const d = params.squadCycle.youth.development;
  return d.yieldMin + (d.yieldMax - d.yieldMin) * clamp(level / 100, 0, 1);
}

/** Fim de época: cada clube aproxima o seu nível do alvo (devagar: a formação demora anos a render). */
export function updateYouthLevels(repo: Repository, data: BaseData, params: Params): void {
  const d = params.squadCycle.youth.development;
  for (const club of data.clubs) {
    const now = youthLevelOf(repo, data, params, club).value;
    const { target, terms } = youthTarget(repo, data, params, club);
    const v = clamp(now + clamp((target - now) * d.regression, -d.maxStep, d.maxStep), 0, 100);
    // a causa é o fator que mais empurrou na direção da mudança
    const sign = Math.sign(v - now);
    const cause = sign === 0 ? undefined : (Object.entries(terms) as [YouthDriver, number][]).filter(([, t]) => Math.sign(t) === sign).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0];
    repo.setMeta(key(club.id), JSON.stringify({ v, prev: now, ...(cause ? { cause } : {}) } satisfies Stored));
    consumeCouncilYouth(repo, club.id);
  }
}
