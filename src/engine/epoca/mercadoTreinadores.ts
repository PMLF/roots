/**
 * Mercado de treinadores (RZ-157; decidido a 15-10-2026): o gamer escolhe um clube para começar e só muda se se demitir
 * (o despedimento chega com o sistema de presidente, RZ-210). Sem clube, o tempo continua e todas as segundas-feiras
 * chegam ofertas de clubes de reputação igual ou inferior à do clube que deixou, mais uma surpresa acima.
 * Estado no save (meta; texto vazio = sem valor): `clube.gamer`, `gamer.anterior`, `gamer.ofertas`.
 */
import { Rng } from "../aleatorio/rng";
import type { Params } from "../config/parametros";
import type { BaseData } from "../dados/tipos";
import type { Repository } from "../persistencia/repositorio";
import type { IsoDate } from "../persistencia/tipos";
import { isInSecondDistrict } from "./distritais";
import { currentSeason } from "./piramideEpoca";
import { prepareSeason } from "./preparar";

export type Offer = { club: string; since: IsoDate };

export const gamerOffers = (repo: Repository): Offer[] => {
  const raw = repo.meta("gamer.ofertas");
  return raw ? (JSON.parse(raw) as Offer[]) : [];
};

export const isUnemployed = (repo: Repository): boolean => !repo.meta("clube.gamer") && !!repo.meta("gamer.anterior");

/** Renova as ofertas (determinístico por save e data). `dados` já traz as ligas atuais. */
export function updateOffers(repo: Repository, data: BaseData, params: Params, today: IsoDate): Offer[] {
  const previous = repo.meta("gamer.anterior");
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
  repo.setMeta("gamer.ofertas", JSON.stringify(offers));
  return offers;
}

/** O gamer demite-se do clube atual: fica sem clube e recebe as primeiras ofertas. */
export function resign(repo: Repository, data: BaseData, params: Params): { club: string } {
  const club = repo.meta("clube.gamer");
  if (!club) throw new Error("Não tens clube de que te demitir");
  const { today } = prepareSeason(repo, data, params);
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_DEMISSAO", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "deixado" }], data: {} });
    repo.setMeta("gamer.anterior", club);
    repo.setMeta("clube.gamer", "");
    updateOffers(repo, data, params, today);
  });
  return { club };
}

/** Aceita uma das ofertas em vigor. */
export function acceptOffer(repo: Repository, club: string): void {
  if (!isUnemployed(repo)) throw new Error("Já tens clube");
  if (!gamerOffers(repo).some((o) => o.club === club)) throw new Error("Esse clube não te fez nenhuma oferta");
  const today = (repo.meta("data.hoje") ?? "") as IsoDate;
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_CONTRATADO", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "contratou" }], data: { previous: repo.meta("gamer.anterior") ?? "" } });
    repo.setMeta("clube.gamer", club);
    repo.setMeta("gamer.anterior", "");
    repo.setMeta("gamer.ofertas", "");
  });
}

/** O clube do gamer desceu à segunda distrital: despede-o automaticamente e deixa de ser jogável até voltar à pirâmide. */
export function sackByRelegation(repo: Repository, data: BaseData, params: Params, club: string, date: IsoDate, season: number): void {
  if (repo.meta("clube.gamer") !== club) return;
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_DEMISSAO", date, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "deixado" }], data: { reason: "segundaDistrital" } });
    repo.setMeta("gamer.anterior", club);
    repo.setMeta("clube.gamer", "");
    updateOffers(repo, data, params, date);
  });
}
