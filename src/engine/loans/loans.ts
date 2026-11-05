/**
 * Empréstimos (RZ-268). Como na vida real: o clube dono mantém o contrato e o jogador joga noutro clube até ao fim da época
 * (30 de junho); o clube que recebe paga uma parte do ordenado (`wageShare`) e, às vezes, uma pequena taxa; o clube dono pode chamar
 * o jogador de volta na janela de janeiro e, no fim da época, todos regressam. Quem está emprestado conta no plantel do clube onde
 * joga (`player.club`), mas o contrato fica com o dono (`contract.club`).
 * Estado: uma só chave `loans` (mapa jogador → empréstimo) mais os eventos LOAN_STARTED e LOAN_ENDED (histórico).
 */
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

export type Loan = { person: string; from: string; to: string; start: IsoDate; end: IsoDate; season: number; /** Parte do ordenado paga pelo clube que recebe (0-1). */ wageShare: number; fee: number };
type LoanMap = Record<string, Loan>;

const KEY = "loans";
const read = (repo: Repository): LoanMap => {
  const v = repo.meta(KEY);
  return v ? (JSON.parse(v) as LoanMap) : {};
};
const write = (repo: Repository, m: LoanMap) => repo.setMeta(KEY, JSON.stringify(m));

export const activeLoans = (repo: Repository): Loan[] => Object.values(read(repo));
export const loanOf = (repo: Repository, person: string): Loan | undefined => read(repo)[person];

/** 30 de junho em que acaba um empréstimo feito na data. */
export function loanEnd(date: IsoDate): IsoDate {
  const year = Number(date.slice(0, 4));
  return `${date.slice(5) > "06-30" ? year + 1 : year}-06-30` as IsoDate;
}

/** Ordenado mensal que cada clube paga por um jogador emprestado: o que recebe paga a sua parte e o dono o resto. */
export function wageSplit(loan: Loan, monthlyWage: number): { borrower: number; owner: number } {
  const borrower = Math.round(monthlyWage * loan.wageShare);
  return { borrower, owner: monthlyWage - borrower };
}

/** Começa um empréstimo: o jogador passa a jogar no clube que recebe; o contrato fica no dono. */
export function startLoan(repo: Repository, loan: Loan, date: IsoDate): void {
  const m = read(repo);
  m[loan.person] = loan;
  write(repo, m);
  repo.updatePlayer(loan.person, { club: loan.to, state: "active" });
  repo.appendEvent({
    type: "LOAN_STARTED", date, season: loan.season, visibility: "exposed", origin: "generated",
    entities: [{ k: "person", id: loan.person, roleKind: "player" }, { k: "club", id: loan.from, roleKind: "lender" }, { k: "club", id: loan.to, roleKind: "borrower" }],
    data: { until: loan.end, wageShare: loan.wageShare, ...(loan.fee > 0 ? { fee: loan.fee } : {}) },
  });
}

/** Acaba um empréstimo (fim da época ou chamado de volta): o jogador regressa ao clube dono. */
export function endLoan(repo: Repository, person: string, date: IsoDate, season: number, reason: "ended" | "recalled"): Loan | undefined {
  const m = read(repo);
  const loan = m[person];
  if (!loan) return undefined;
  delete m[person];
  write(repo, m);
  if (repo.player(person)?.state === "active") repo.updatePlayer(person, { club: loan.from });
  repo.appendEvent({
    type: "LOAN_ENDED", date, season, visibility: "exposed", origin: "generated",
    entities: [{ k: "person", id: person, roleKind: "player" }, { k: "club", id: loan.from, roleKind: "lender" }, { k: "club", id: loan.to, roleKind: "borrower" }],
    data: { reason },
  });
  return loan;
}

/** Acaba todos os empréstimos cujo fim já passou (ou, com `all`, todos: passagem de época). Devolve os acabados. */
export function endDueLoans(repo: Repository, date: IsoDate, season: number, all = false): Loan[] {
  const due = activeLoans(repo).filter((l) => all || l.end < date);
  for (const l of due) endLoan(repo, l.person, date, season, "ended");
  return due;
}
