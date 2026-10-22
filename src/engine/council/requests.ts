/**
 * Pedidos do gamer ao autarca (RZ-236, docs/CITY.md §12.6): escolinhas, transporte e segurança em dias de jogo e subsídio anual.
 * Um por área, resposta em 1 a 3 semanas, decidida pela personalidade do autarca, pela relação, pela prioridade da área e pela verba que lhe resta.
 * A resposta guarda o resultado, o motivo e o tom do autarca; o texto (um pequeno discurso) vem da interface.
 */
import { addDays } from "../calendar/dates";
import { clubBalance, post } from "../club/finances";
import { COUNCIL_REQUESTS, type CouncilArea, type CouncilRequestKind, type Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { Rng } from "../random/rng";
import { cityStateNow } from "../city/cities";
import { agendaOf, mayorOf, type MayorInfo } from "./agenda";
import { adjustRelation, relationOf } from "./relation";

export type ReplyReason = "priority" | "relation" | "visibility" | "generic" | "noBudget" | "notPriority" | "poorRelation" | "expensive";
export type MayorTone = "vain" | "ambitious" | "humble" | "plain";
export type CouncilRequest = {
  id: number; city: string; mayor: string; club: string; kind: CouncilRequestKind; area: CouncilArea;
  created: IsoDate; due: IsoDate; season: number;
  /** Fração do custo que o clube paga. */
  cofund: number;
  /** Custo para a Câmara (€) ou, no subsídio, o valor dado. */
  cost: number;
  status: "pending" | "approved" | "refused";
  decided?: IsoDate;
  outcome?: { reason: ReplyReason; tone: MayorTone; amount: number };
};

const KEY = "council.requests";
export const requestsOf = (repo: Repository): CouncilRequest[] => JSON.parse(repo.meta(KEY) ?? "[]") as CouncilRequest[];
const save = (repo: Repository, list: CouncilRequest[]) => repo.setMeta(KEY, JSON.stringify(list));

export const toneOf = (m: MayorInfo): MayorTone => (m.traits.vanity >= 14 ? "vain" : m.traits.ambition >= 14 ? "ambitious" : m.traits.patience >= 13 || m.traits.vanity <= 7 ? "humble" : "plain");

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Verba que o autarca gere a seu gosto numa área, numa época (€). */
export function envelopeOf(data: BaseData, params: Params, city: string, share: number): number {
  const c = data.cities.find((x) => x.id === city);
  return c ? c.municipalBudget * share * params.city.council.discretionary : 0;
}

const spentIn = (list: readonly CouncilRequest[], city: string, area: CouncilArea, season: number) =>
  list.filter((r) => r.city === city && r.area === area && r.season === season && r.status === "approved").reduce((s, r) => s + (r.kind === "subsidy" ? r.cost : r.cost), 0);

/** Quanto custa o pedido à Câmara (€). */
export function costOf(data: BaseData, params: Params, club: BaseClub, kind: CouncilRequestKind): number {
  const c = data.cities.find((x) => x.id === club.city);
  const rq = params.city.council.requests;
  if (!c) return 0;
  return Math.round(kind === "subsidy" ? (c.municipalBudget * rq.subsidyRate * rq.subsidyTier[club.tier]) / 100 : (c.municipalBudget * rq.cost[kind]) / 100) * 100;
}

export type KindStatus = "available" | "open" | "cooldown";
export function kindStatus(repo: Repository, params: Params, club: BaseClub, kind: CouncilRequestKind, today: IsoDate): { status: KindStatus; until?: IsoDate } {
  const area = params.city.council.requests.areas[kind];
  const mine = requestsOf(repo).filter((r) => r.club === club.id && r.area === area);
  const pending = mine.filter((r) => r.status === "pending").sort((a, b) => a.due.localeCompare(b.due))[0];
  if (pending) return { status: "open", until: pending.due };
  const refused = mine.filter((r) => r.status === "refused" && r.decided).sort((a, b) => (b.decided as string).localeCompare(a.decided as string))[0];
  if (refused?.decided) {
    const until = addDays(refused.decided, params.city.council.requests.cooldownDays);
    if (until > today) return { status: "cooldown", until };
  }
  return { status: "available" };
}

export type MakeResult = { ok: true; request: CouncilRequest } | { ok: false; reason: "noMayor" | "open" | "cooldown" | "cash" | "invalid" };
export function makeRequest(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, kind: CouncilRequestKind, cofundIndex: number): MakeResult {
  const cfg = params.city.council.requests;
  if (!COUNCIL_REQUESTS.includes(kind)) return { ok: false, reason: "invalid" };
  const mayor = mayorOf(repo, data, club.city);
  if (!mayor) return { ok: false, reason: "noMayor" };
  const st = kindStatus(repo, params, club, kind, today);
  if (st.status !== "available") return { ok: false, reason: st.status };
  const cofund = kind === "subsidy" ? 0 : (cfg.cofunds[cofundIndex] ?? 0);
  const cost = costOf(data, params, club, kind);
  if (cofund > 0 && cofund * cost > clubBalance(repo, club)) return { ok: false, reason: "cash" };
  const list = requestsOf(repo);
  const rng = new Rng(repo.meta("seed") ?? "?", `council/due/${list.length}/${today}`);
  const request: CouncilRequest = {
    id: Math.max(0, ...list.map((r) => r.id)) + 1, city: club.city, mayor: mayor.person, club: club.id, kind, area: cfg.areas[kind],
    created: today, due: addDays(today, rng.integer(cfg.replyDays[0], cfg.replyDays[1])), season, cofund, cost, status: "pending",
  };
  save(repo, [...list, request]);
  return { ok: true, request };
}

/** Decide um pedido: z = bias + relação + prioridade + desporto + visibilidade − custo/verba + cofinanciamento. */
function decide(repo: Repository, data: BaseData, params: Params, club: BaseClub, mayor: MayorInfo, r: CouncilRequest, list: readonly CouncilRequest[]): { approved: boolean; reason: ReplyReason } {
  const cfg = params.city.council.requests.decision;
  const state = cityStateNow(repo, data, params, r.city);
  const agenda = agendaOf(repo.meta("seed") ?? "?", mayor, state, params);
  const rel = relationOf(repo, params, mayor.person).value;
  const envelope = envelopeOf(data, params, r.city, agenda.share[r.area]);
  const left = envelope - spentIn(list, r.city, r.area, r.season);
  const ratio = agenda.ratio[r.area];
  const costShare = r.cost > 0 ? r.cost / Math.max(1, envelope) : 0;
  if (r.cost > left) return { approved: false, reason: "noBudget" };
  const terms = {
    relation: cfg.relation * (rel - 50) / 50,
    priority: cfg.priority * (ratio - 1),
    sport: r.area === "sport" ? cfg.sport * (mayor.sportSupport - 5.5) / 4.5 : 0,
    visibility: cfg.vanity * (mayor.traits.vanity - 10) / 10,
    cost: -cfg.cost * costShare,
    cofund: cfg.cofund * r.cofund,
  };
  const z = cfg.bias + Object.values(terms).reduce((s, x) => s + x, 0);
  const approved = new Rng(repo.meta("seed") ?? "?", `council/decide/${r.id}`).float() < sigmoid(z);
  if (approved) {
    const best = (Object.entries(terms) as [keyof typeof terms, number][]).filter(([k]) => k !== "cost" && k !== "cofund").sort((a, b) => b[1] - a[1])[0]![0];
    return { approved, reason: best === "relation" ? "relation" : best === "visibility" ? "visibility" : best === "priority" || best === "sport" ? "priority" : "generic" };
  }
  const worst = (Object.entries(terms) as [keyof typeof terms, number][]).sort((a, b) => a[1] - b[1])[0]![0];
  return { approved, reason: worst === "relation" ? "poorRelation" : worst === "cost" ? "expensive" : "notPriority" };
}

/** Efeitos de um pedido aprovado: subsídio na caixa; o resto fica registado para o jogo ler (`councilYouthBonus`, `councilMatchdayBoost`). */
function apply(repo: Repository, params: Params, club: BaseClub, r: CouncilRequest, season: number): void {
  if (r.kind === "subsidy") post(repo, club, "subsidies", r.cost);
  else {
    if (r.cofund > 0) post(repo, club, "fixed", -Math.round(r.cost * r.cofund));
    repo.setMeta(`council.effect.${r.kind}.${club.id}`, String(season));
  }
}

/** Ativo até ao fim da época em que foi aprovado (assistência) ou até ser aproveitado no fim da época (formação). */
export function councilYouthBonus(repo: Repository, params: Pick<Params, "city">, club: string): number {
  return repo.meta(`council.effect.youth.${club}`) ? params.city.council.requests.youthBonus : 0;
}
export function consumeCouncilYouth(repo: Repository, club: string): void {
  if (repo.meta(`council.effect.youth.${club}`)) repo.setMeta(`council.effect.youth.${club}`, "");
}
export function councilMatchdayBoost(repo: Repository, params: Pick<Params, "city">, club: string, season: number): number {
  return repo.meta(`council.effect.matchday.${club}`) === String(season) ? params.city.council.requests.matchdayBoost : 0;
}

/** Todos os dias: decide os pedidos vencidos e deixa a resposta no histórico (e, por isso, na caixa de entrada). */
export function dailyCouncil(repo: Repository, data: BaseData, params: Params, gamer: BaseClub, today: IsoDate, season: number): void {
  let list = requestsOf(repo);
  for (const r of list.filter((x) => x.status === "pending" && x.due <= today)) {
    const mayor = mayorOf(repo, data, r.city);
    // o autarca já não é o mesmo (eleições): o pedido caduca sem relação alterada
    if (!mayor || mayor.person !== r.mayor) { list = list.map((x) => (x.id === r.id ? { ...x, status: "refused" as const, decided: today, outcome: { reason: "notPriority" as const, tone: "plain" as const, amount: r.cost } } : x)); continue; }
    const { approved, reason } = decide(repo, data, params, gamer, mayor, r, list);
    const tone = toneOf(mayor);
    const done: CouncilRequest = { ...r, status: approved ? "approved" : "refused", decided: today, outcome: { reason, tone, amount: r.cost } };
    list = list.map((x) => (x.id === r.id ? done : x));
    if (approved) apply(repo, params, gamer, done, season);
    adjustRelation(repo, params, mayor.person, approved ? params.city.council.relation.approved : params.city.council.relation.refused, approved ? "approved" : "refused");
    repo.appendEvent({
      type: "COUNCIL_REPLY", date: today, season, visibility: "exposed", origin: "generated",
      entities: [{ k: "city", id: r.city }, { k: "person", id: mayor.person, roleKind: "mayor" }, { k: "club", id: gamer.id }],
      data: { request: r.id, kind: r.kind, approved: approved ? 1 : 0, reason, tone, amount: r.cost },
    });
  }
  save(repo, list);
}
