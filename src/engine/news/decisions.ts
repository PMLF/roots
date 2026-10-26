/**
 * Estado das mensagens que pedem decisão (RZ-164): pendente (com prazo), respondida (e como) ou expirada. A caixa de entrada mostra o
 * estado ao lado da mensagem e, enquanto pendente, os botões para responder. A chave é o id do evento da mensagem.
 */
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { patronOffers } from "../company/patrons";
import { electionOf } from "../council/elections";
import { offers as transferOffers } from "../market/offers";
import { gamerOffers, isUnemployed } from "../season/coachMarket";

export type DecisionKind = "patron" | "transfer" | "campaign" | "clubOffer";
export type DecisionAnswer = "accepted" | "declined";
export type Decision = {
  kind: DecisionKind;
  state: "pending" | "answered" | "expired";
  /** Último dia para responder (quando há prazo). */
  until?: IsoDate;
  answer?: DecisionAnswer;
  /** Identificador da proposta para responder (id da proposta, do clube ou da cidade). */
  ref: string;
};

const TYPES = ["PATRON_OFFER", "TRANSFER_OFFER", "ELECTION_CAMPAIGN", "CLUB_OFFER"] as const;

export function decisionStates(repo: Repository, limit = 200): Record<number, Decision> {
  const out: Record<number, Decision> = {};
  const patrons = patronOffers(repo);
  const transfers = transferOffers(repo);
  const election = electionOf(repo);
  const unemployed = isUnemployed(repo);
  const pendingClubs = new Map(gamerOffers(repo).map((o) => [`${o.club}|${o.since}`, o]));
  const club = repo.meta("gamer.club");
  const today = (repo.meta("date.today") ?? "") as IsoDate;
  for (const e of repo.recentEvents({ types: TYPES, limit })) {
    const d = e.data as Record<string, unknown>;
    if (e.type === "PATRON_OFFER") {
      const o = patrons.find((x) => x.id === Number(d.offer));
      if (!o) continue;
      out[e.id] = o.status === "pending" ? { kind: "patron", state: "pending", until: o.expires, ref: String(o.id) }
        : o.status === "expired" ? { kind: "patron", state: "expired", ref: String(o.id) }
        : { kind: "patron", state: "answered", answer: o.status === "accepted" ? "accepted" : "declined", ref: String(o.id) };
    } else if (e.type === "TRANSFER_OFFER") {
      const person = e.entities.find((x) => x.k === "person")?.id;
      const o = transfers.find((x) => x.person === person && x.created === e.date);
      if (!o) continue;
      out[e.id] = o.status === "pending" ? { kind: "transfer", state: "pending", until: o.expires, ref: String(person) }
        : o.status === "done" ? { kind: "transfer", state: "answered", answer: "accepted", ref: String(person) }
        : o.status === "rejected" ? { kind: "transfer", state: "answered", answer: "declined", ref: String(person) }
        : { kind: "transfer", state: "expired", ref: String(person) };
    } else if (e.type === "ELECTION_CAMPAIGN") {
      const city = e.entities.find((x) => x.k === "city")?.id ?? "";
      const same = election && election.date === d.date;
      if (same && election.stage === "campaign" && election.choice === undefined && today <= election.date) out[e.id] = { kind: "campaign", state: "pending", until: election.date, ref: city };
      else if (same && election.choice !== undefined) out[e.id] = { kind: "campaign", state: "answered", answer: election.choice === "neutral" ? "declined" : "accepted", ref: city };
      else out[e.id] = { kind: "campaign", state: "expired", ref: city };
    } else if (e.type === "CLUB_OFFER") {
      const offering = e.entities.find((x) => x.k === "club" && x.roleKind === "offer")?.id ?? "";
      if (unemployed && pendingClubs.has(`${offering}|${e.date}`)) out[e.id] = { kind: "clubOffer", state: "pending", ref: offering };
      else if (club === offering) out[e.id] = { kind: "clubOffer", state: "answered", answer: "accepted", ref: offering };
      else out[e.id] = { kind: "clubOffer", state: "expired", ref: offering };
    }
  }
  return out;
}
