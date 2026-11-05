/**
 * Lesões (RZ-107; docs/GAME_ENGINE.md §9): tipo, gravidade, duração, recaídas e risco. Funções puras.
 * O risco sobe com a fadiga, o calendário apertado (forma baixa), o relvado mau, a intensidade e o fair play duro do
 * adversário, e desce com aptidão física e staff médico. Staff médico bom também encurta a paragem.
 */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";

export type InjuryType = "knock" | "muscular" | "sprain" | "tendon" | "ligaments" | "fracture";
/** 1 ligeira · 2 moderada · 3 grave · 4 muito grave · 5 gravíssima. */
type Severity = 1 | 2 | 3 | 4 | 5;

export type Injury = { type: InjuryType; severity: Severity; /** Dias de paragem. */ days: number; relapse: boolean };

/** Que lesões acontecem em cada gravidade (pesos relativos). */
const TYPE_PER_SEVERITY: Record<Severity, Partial<Record<InjuryType, number>>> = {
  1: { knock: 0.5, muscular: 0.4, sprain: 0.1 },
  2: { muscular: 0.5, sprain: 0.35, tendon: 0.15 },
  3: { muscular: 0.3, sprain: 0.25, tendon: 0.2, fracture: 0.15, ligaments: 0.1 },
  4: { ligaments: 0.4, fracture: 0.35, tendon: 0.25 },
  5: { ligaments: 0.55, fracture: 0.45 },
};

export type RiskContext = {
  /** Forma do jogador (0,7-1,1; 1 = descansado). */
  form: number;
  /** Atributo `aptidaoFisica` (1-20). */
  physicalAptitude: number;
  /** Qualidade do relvado, 0 (péssimo) a 1 (perfeito). */
  turf?: number;
  /** Qualidade do staff médico (1-20). */
  medical?: number;
  /** Prudência do staff médico, -1..1. */
  caution?: number;
  /** Fair play do adversário (1-5). */
  opponentPlayFair?: 1 | 2 | 3 | 4 | 5;
  /** Intensidade da própria equipa (1-5). */
  intensity?: number;
  /** Pontos de força perdidos por cansaço neste momento. */
  fatigue?: number;
  /** Regressou há pouco da mesma lesão. */
  relapse?: boolean;
};

/** Probabilidade de o jogador se lesionar num jogo de 90 minutos nestas condições. */
export function riskPer90(c: RiskContext, params: Params): number {
  const p = params.injuries;
  const r = p.risk;
  const m =
    (1 + r.byForm * (1 - c.form)) *
    (1 + r.turf * (0.5 - (c.turf ?? 0.5))) *
    (1 + r.byPhysicalAptitude * (10 - c.physicalAptitude)) *
    (1 + r.byMedical * (10 - (c.medical ?? 10))) *
    (1 - params.staff.traits.cautionRisk * (c.caution ?? 0)) *
    (r.opponentPlayFair[(c.opponentPlayFair ?? 3) - 1] as number) *
    (1 + r.intensity * ((c.intensity ?? 3) - 3)) *
    (1 + r.fatigue * (c.fatigue ?? 0)) *
    (1 + (c.relapse ? r.relapse : 0));
  return clamp(p.pPerMatchPlayer * Math.max(0, m), 0, 1);
}

function chooseWeight<T extends string>(r: Rng, weights: Partial<Record<T, number>>): T {
  const keys = Object.keys(weights) as T[];
  let x = r.float() * keys.reduce((s, k) => s + (weights[k] as number), 0);
  for (const k of keys) {
    x -= weights[k] as number;
    if (x < 0) return k;
  }
  return keys[keys.length - 1] as T;
}

/** Sorteia uma lesão. Com `recaida`, é do mesmo tipo e dura mais. O staff médico encurta a paragem. */
export function drawLotsInjury(r: Rng, params: Params, options: { medical?: number; caution?: number; relapse?: InjuryType } = {}): Injury {
  const p = params.injuries;
  let x = r.float();
  let g = 0;
  for (; g < p.severities.length - 1; g++) {
    x -= (p.severities[g] as { weight: number }).weight;
    if (x < 0) break;
  }
  const severity = (g + 1) as Severity;
  const [min, max] = (p.severities[g] as { days: [number, number] }).days;
  const type = options.relapse ?? chooseWeight<InjuryType>(r, TYPE_PER_SEVERITY[severity]);
  let days = min + r.float() * (max - min);
  days *= clamp(1 - p.recoveryPerMedical * ((options.medical ?? 10) - 10), 0.5, 1.5) * (1 + params.staff.traits.cautionRecovery * (options.caution ?? 0));
  if (options.relapse) days *= p.relapseDuration;
  return { type, severity, days: Math.max(1, Math.round(days)), relapse: !!options.relapse };
}
