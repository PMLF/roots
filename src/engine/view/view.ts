/**
 * Vista (RZ-129): a única porta de leitura da interface.
 * Devolve apenas (a) factos públicos de todo o mundo, (b) factos privados/secretos em que o observador
 * participa, e (c) estimativas com margem vindas de observações. Não recebe nem importa a "verdade"
 * (atributos, potencial, personalidade, finanças): por construção, não tem como a devolver.
 */
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { EventsFilter } from "../persistence/repository";
import type { IsoDate, RefEntity, HistoryEvent, Match, StandingsLine, PlayerStatLine, Scorer, Observation, PublicPerson } from "../persistence/types";
import { dayNumber } from "../calendar/dates";
import type { Target, Knowledge, Estimate, PersonProfile, Freshness, ViewPerson, Label, ObservedValues } from "./types";

/** Só o que a Vista usa do repositório: leitura de factos públicos e de observações. */
export type PublicSource = Pick<Repository, "eventsOf" | "match" | "scorers" | "standings" | "playerStats" | "observations" | "publicPerson" | "publicSquad" | "publicRoles">;

export type ViewContext = {
  /** Quem observa (o clube do gamer). As observações são suas. */
  observer: string;
  /** Entidades "nossas" ("clube:id", "pessoa:id"): vemos os eventos privados/secretos em que participam. */
  participants: ReadonlySet<string>;
  date: IsoDate;
  season: number;
};

export const participantKey = (e: Pick<RefEntity, "k" | "id">): string => `${e.k}:${e.id}`;

export class View {
  constructor(
    private readonly source: PublicSource,
    private readonly ctx: ViewContext,
    private readonly k: Params["knowledge"],
  ) {}

  // ---------- factos públicos
  /** Eventos de uma entidade: todos os públicos + os privados/secretos em que participamos. Mais recentes primeiro. */
  events(entity: Target, filter: Omit<EventsFilter, "publicOnly" | "visibility"> = {}): HistoryEvent[] {
    const { limit, ...rest } = filter;
    const exposed = this.source.eventsOf(entity, { ...rest, visibility: ["exposed"], ...(limit !== undefined ? { limit } : {}) });
    const our = this.source
      .eventsOf(entity, { ...rest, visibility: ["private", "secret"] })
      .filter((e) => e.entities.some((x) => this.ctx.participants.has(participantKey(x))));
    const all = [...exposed, ...our].sort((a, b) => b.id - a.id);
    return limit === undefined ? all : all.slice(0, limit);
  }

  match(id: string): Match | undefined {
    return this.source.match(id);
  }
  scorers(competition: string, season: number, round: number): Scorer[] {
    return this.source.scorers(competition, season, round);
  }
  standings(competition: string, season: number): StandingsLine[] {
    return this.source.standings(competition, season);
  }
  /** Golos, jogos, cartões… são factos de jogo e portanto públicos (não são atributos). */
  playerStats(player: string): PlayerStatLine[] {
    return this.source.playerStats(player);
  }

  // ---------- pessoas
  private withAge(p: PublicPerson): ViewPerson {
    return { ...p, age: Math.floor((dayNumber(this.ctx.date) - dayNumber(p.birth)) / 365.25) };
  }
  /** Factos públicos de uma pessoa (nome, idade, clube, posição, corpo). */
  person(id: string): ViewPerson | undefined {
    const p = this.source.publicPerson(id);
    return p ? this.withAge(p) : undefined;
  }
  squad(club: string): ViewPerson[] {
    return this.source.publicSquad(club).map((p) => this.withAge(p));
  }
  roles(filter: { club?: string; city?: string }): ViewPerson[] {
    return this.source.publicRoles(filter).map((p) => this.withAge(p));
  }
  /** Ficha completa para a interface: factos públicos + o que se sabe (com margem) dos grupos observados. */
  profile(id: string): PersonProfile | undefined {
    const exposed = this.person(id);
    if (!exposed) return undefined;
    const target: Target = { k: "person", id };
    const attributes = this.knowledge(target, "attributes");
    const potential = this.knowledge(target, "potential");
    const personality = this.knowledge(target, "personality");
    return { exposed, ...(attributes ? { attributes } : {}), ...(potential ? { potential } : {}), ...(personality ? { personality } : {}) };
  }

  // ---------- conhecimento
  /**
   * O que o observador sabe sobre `alvo` num grupo (atributos | personalidade | potencial | financas | contrato).
   * `undefined` se nunca o observou. Várias observações combinam-se por média ponderada pelo inverso da
   * variância, com a incerteza a crescer com a idade da observação.
   */
  knowledge(target: Target, group: string): Knowledge | undefined {
    const obs = this.source.observations(this.ctx.observer, target, group);
    if (obs.length === 0) return undefined;
    const k = this.k;
    const age = (o: Observation) => Math.max(0, this.ctx.season - o.season);
    const freshness = (o: Observation): Freshness => ({
      seenIn: o.date,
      sinceSeasons: age(o),
      outdated: age(o) >= k.seasonsAfterOutdated,
    });

    type Cumulative = { sumWeight: number; estWeightSum: number; scale?: [number, number]; recent: Observation };
    const cumulative = new Map<string, Cumulative>();
    let labels: Label[] = [];
    let seenAlreadyLabels = false;
    for (const o of obs) {
      // `obs` vem das mais recentes para as mais antigas
      const v = o.values as ObservedValues;
      if (!seenAlreadyLabels && v.labels) {
        labels = v.labels;
        seenAlreadyLabels = true;
      }
      for (const [pitch, { est, sigma }] of Object.entries(v.fields ?? {})) {
        const effectiveSigma = Math.max(sigma, 1e-6) * (1 + k.uncertaintyGrowthPerSeason * age(o));
        const weight = 1 / (effectiveSigma * effectiveSigma);
        const a = cumulative.get(pitch);
        if (a) {
          a.sumWeight += weight;
          a.estWeightSum += weight * est;
        } else cumulative.set(pitch, { sumWeight: weight, estWeightSum: weight * est, ...(v.scale ? { scale: v.scale } : {}), recent: o });
      }
    }

    const fields: Knowledge["fields"] = {};
    for (const [pitch, a] of cumulative) {
      const mean = a.estWeightSum / a.sumWeight;
      const margin = k.z * Math.sqrt(1 / a.sumWeight);
      const [min, max] = a.scale ?? [-Infinity, Infinity];
      const est: Estimate = {
        value: round(Math.min(max, Math.max(min, mean))),
        margin: round(margin),
        halfTime: [round(Math.max(min, mean - margin)), round(Math.min(max, mean + margin))],
      };
      fields[pitch] = { ...est, ...freshness(a.recent) };
    }
    const moreRecent = obs[0] as Observation;
    return { ...freshness(moreRecent), observations: obs.length, fields, labels };
  }

  /** Atalho: estimativa de um campo (p. ex. "finalizacao") dentro de um grupo. */
  estimate(target: Target, group: string, pitch: string): (Estimate & Freshness) | undefined {
    return this.knowledge(target, group)?.fields[pitch];
  }
}

const round = (x: number) => Math.round(x * 10) / 10;
