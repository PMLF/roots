/**
 * O ano da época 1 de cada save (RZ-160): é o da data real em que o save é criado. As épocas mudam a 1 de julho
 * (julho de 2026 a junho de 2027 = 2026/27). Fica no save em `ano.inicial`; sem ele vale o valor por omissão dos parâmetros.
 */
import type { Parametros } from "../config/parametros";
import type { Repositorio } from "../persistencia/repositorio";

/** O ano em que começa a época que contém a data (mês 1-12). */
export const anoDaEpocaQueContem = (ano: number, mes: number, params: Parametros): number => (mes >= params.calendario.mesInicioEpoca ? ano : ano - 1);

export const anoInicialDoSave = (repo: Repositorio, params: Parametros): number => Number(repo.meta("ano.inicial") ?? params.calendario.anoInicial);

/** Os parâmetros com o ano inicial do save. */
export const parametrosDoSave = (repo: Repositorio, params: Parametros): Parametros => ({ ...params, calendario: { ...params.calendario, anoInicial: anoInicialDoSave(repo, params) } });

export { nomeDaEpoca } from "../calendario/nomeEpoca";
