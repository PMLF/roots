/**
 * Mercado de treinadores (RZ-157; decidido a 15-10-2026): o gamer escolhe um clube para começar e só muda se se demitir
 * (o despedimento chega com o sistema de presidente, RZ-210). Sem clube, o tempo continua e todas as segundas-feiras
 * chegam ofertas de clubes de reputação igual ou inferior à do clube que deixou, mais uma surpresa acima.
 * Estado no save (meta; texto vazio = sem valor): `gamer.club`, `gamer.previous`, `gamer.offers`.
 */
import { Rng } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { isInSecondDistrict } from "./districts";
import { currentSeason } from "./seasonPyramid";
import { prepareSeason } from "./prepare";

export type Offer = { club: string; since: IsoDate };

export const gamerOffers = (repo: Repository): Offer[] => {
  const raw = repo.meta("gamer.offers");
  return raw ? (JSON.parse(raw) as Offer[]) : [];
};

export const isUnemployed = (repo: Repository): boolean => !repo.meta("gamer.club") && !!repo.meta("gamer.previous");

/** Renova as ofertas (determinístico por save e data). `dados` já traz as ligas atuais. */
export function updateOffers(repo: Repository, data: BaseData, params: Params, today: IsoDate): Offer[] {
  const previous = repo.meta("gamer.previous");
  const ref = data.clubs.find((c) => c.id === previous)?.reputation ?? 0;
  const rng = new Rng(repo.meta("seed") ?? "?", `ofertas/${today}`);
  const take = (pool: typeof data.clubs, n: number) => {
    const p = [...pool];
    const out: typeof data.clubs = [];
    while (out.length < n && p.length > 0) out.push(p.splice(rng.integer(0, p.length - 1), 1)[0]!);
    return out;
  };
  const others = data.clubs.filter((c) => c.id !== previous && !isInSecondDistrict(c.league));
  const normal = take(others.filter((c) => c.reputation <= ref), params.coach.offers);
  const ids = new Set(normal.map((c) => c.id));
  const surprises = take(others.filter((c) => !ids.has(c.id) && c.reputation > ref && c.reputation <= ref + params.coach.surpriseMargin), params.coach.surprises);
  const offers = [...normal, ...surprises].map((c): Offer => ({ club: c.id, since: today }));
  repo.setMeta("gamer.offers", JSON.stringify(offers));
  // cada oferta é uma mensagem na caixa de entrada com estado e botões (RZ-164)
  const surpriseIds = new Set(surprises.map((c) => c.id));
  for (const o of offers) repo.appendEvent({ type: "CLUB_OFFER", date: today, season: currentSeason(repo), visibility: "exposed", origin: "generated", entities: [{ k: "club", id: o.club, roleKind: "offer" }, ...(previous ? [{ k: "club" as const, id: previous, roleKind: "previous" }] : [])], data: { surprise: surpriseIds.has(o.club) } });
  return offers;
}

/** O gamer demite-se do clube atual: fica sem clube e recebe as primeiras ofertas. */
export function resign(repo: Repository, data: BaseData, params: Params): { club: string } {
  const club = repo.meta("gamer.club");
  if (!club) throw new Error("Não tens clube de que te demitir");
  const { today } = prepareSeason(repo, data, params);
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_RESIGNATION", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "deixado" }], data: {} });
    repo.setMeta("gamer.previous", club);
    repo.setMeta("gamer.club", "");
    updateOffers(repo, data, params, today);
  });
  return { club };
}

/** Aceita uma das ofertas em vigor. */
export function acceptOffer(repo: Repository, club: string): void {
  if (!isUnemployed(repo)) throw new Error("Já tens clube");
  if (!gamerOffers(repo).some((o) => o.club === club)) throw new Error("Esse clube não te fez nenhuma oferta");
  const today = (repo.meta("date.today") ?? "") as IsoDate;
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_HIRED", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "contratou" }], data: { previous: repo.meta("gamer.previous") ?? "" } });
    repo.setMeta("gamer.club", club);
    repo.setMeta("gamer.previous", "");
    repo.setMeta("gamer.offers", "");
  });
}

/** O clube do gamer desceu à segunda distrital: despede-o automaticamente e deixa de ser jogável até voltar à pirâmide. */
export function sackByRelegation(repo: Repository, data: BaseData, params: Params, club: string, date: IsoDate, season: number): void {
  if (repo.meta("gamer.club") !== club) return;
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_RESIGNATION", date, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "deixado" }], data: { reason: "secondDistrict" } });
    repo.setMeta("gamer.previous", club);
    repo.setMeta("gamer.club", "");
    updateOffers(repo, data, params, date);
  });
}
