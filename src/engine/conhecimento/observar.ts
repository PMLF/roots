/**
 * Criação de observações (RZ-129): a ponte entre a "verdade" oculta e o que passa a ser conhecido.
 * Recebe os valores verdadeiros como argumento (quem chama é o olheiro, o treino, o jogo…), acrescenta
 * ruído que depende da qualidade da fonte e grava só a estimativa. A Vista nunca importa este módulo.
 */
import type { Params } from "../config/parametros";
import { clamp, type Rng } from "../aleatorio/rng";
import type { Repository } from "../persistencia/repositorio";
import type { IsoDate, EntityType } from "../persistencia/tipos";
import type { Label, ObservedValues } from "../vista/tipos";

export type ObservationRequest = {
  observer: string;
  target: { k: EntityType; id: string };
  group: string;
  source: keyof Params["knowledge"]["qualityPerSource"];
  /** 0-1; por omissão a da fonte (parâmetros). Um bom olheiro tem qualidade mais alta. */
  quality?: number;
  date: IsoDate;
  season: number;
};

type Knowledge = Params["knowledge"];

/** Desvio do erro de uma observação com a qualidade dada (interpolação linear). */
export function qualitySigma(quality: number, k: Knowledge): number {
  const q = clamp(quality, 0, 1);
  return k.worstSigmaQuality + (k.bestSigmaQuality - k.worstSigmaQuality) * q;
}

const qualityOf = (p: ObservationRequest, k: Knowledge) => clamp(p.quality ?? k.qualityPerSource[p.source], 0, 1);

/** Observa valores numéricos (atributos, potencial, …). Devolve o id da observação. */
export function observeFields(
  repo: Repository,
  p: ObservationRequest,
  yes: Readonly<Record<string, number>>,
  scale: [number, number],
  rng: Rng,
  k: Knowledge,
): number {
  const q = qualityOf(p, k);
  const sigma = qualitySigma(q, k);
  const fields: NonNullable<ObservedValues["fields"]> = {};
  for (const name of Object.keys(yes).sort()) {
    const est = clamp(rng.gauss(yes[name] as number, sigma), scale[0], scale[1]);
    fields[name] = { est: Math.round(est * 10) / 10, sigma };
  }
  const values: ObservedValues = { v: 1, scale, fields };
  return repo.appendObservation({ observer: p.observer, targetK: p.target.k, targetId: p.target.id, group: p.group, values, quality: q, source: p.source, date: p.date, season: p.season });
}

/**
 * Observa a personalidade como rótulos (PERSONALIDADE §7): só os traços nos extremos (≤ baixo ou ≥ alto),
 * os mais marcados primeiro, no máximo `maxRotulos`. Com qualidade baixa a faixa pode vir trocada.
 */
export function observePersonality(
  repo: Repository,
  p: ObservationRequest,
  traits: Readonly<Record<string, number>>,
  rng: Rng,
  k: Knowledge,
): number {
  const q = qualityOf(p, k);
  const pr = k.personality;
  const substitutionProb = pr.worstSubstitutionProbQuality * (1 - q);
  const labels: Label[] = Object.entries(traits)
    .filter(([, v]) => v <= pr.lowThreshold || v >= pr.highThreshold)
    .sort((a, b) => Math.abs(b[1] - 10.5) - Math.abs(a[1] - 10.5) || (a[0] < b[0] ? -1 : 1))
    .slice(0, pr.labelsMax)
    .map(([trait, v]) => {
      const strip: Label["strip"] = v >= pr.highThreshold ? "high" : "low";
      return { trait, strip: rng.prob(substitutionProb) ? (strip === "high" ? "low" : "high") : strip };
    });
  const values: ObservedValues = { v: 1, labels };
  return repo.appendObservation({ observer: p.observer, targetK: p.target.k, targetId: p.target.id, group: p.group, values, quality: q, source: p.source, date: p.date, season: p.season });
}

/**
 * O clube conhece bem o seu próprio plantel (fonte "proprioClube"): cria as observações iniciais de
 * atributos, potencial e personalidade de cada jogador. Chama-se uma vez no início do save (e ao contratar).
 */
export function observeOwnSquad(
  repo: Repository,
  club: string,
  when: { date: IsoDate; season: number },
  rng: Rng,
  k: Knowledge,
): number {
  let n = 0;
  for (const j of repo.clubPlayers(club)) {
    const p = repo.person(j.person);
    if (!p) continue;
    const base = { observer: club, target: { k: "person" as const, id: j.person }, source: "clubOwn" as const, ...when };
    observeFields(repo, { ...base, group: "attributes" }, j.attributes, [1, 20], rng, k);
    observeFields(repo, { ...base, group: "potential" }, { potential: j.potential }, [1, 20], rng, k);
    observePersonality(repo, { ...base, group: "personality" }, p.personality, rng, k);
    n++;
  }
  return n;
}
