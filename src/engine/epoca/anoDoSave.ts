/**
 * O ano da época 1 de cada save (RZ-160): é o da data real em que o save é criado. As épocas mudam a 1 de julho
 * (julho de 2026 a junho de 2027 = 2026/27). Fica no save em `ano.inicial`; sem ele vale o valor por omissão dos parâmetros.
 */
import type { Params } from "../config/parametros";
import type { Repository } from "../persistencia/repositorio";

/** O ano em que começa a época que contém a data (mês 1-12). */
export const seasonYearContaining = (year: number, month: number, params: Params): number => (month >= params.calendar.seasonStartMonth ? year : year - 1);

export const saveInitialYear = (repo: Repository, params: Params): number => Number(repo.meta("ano.inicial") ?? params.calendar.initialYear);

/** Os parâmetros com o ano inicial do save. */
export const saveParameters = (repo: Repository, params: Params): Params => ({ ...params, calendar: { ...params.calendar, initialYear: saveInitialYear(repo, params) } });

export { seasonName } from "../calendario/nomeEpoca";
