import type { Params } from "../config/parameters";

/** Uma transferência é notícia para o mundo a partir de `market.news.minFee`. */
export const isImportantFee = (params: Params, fee: number): boolean => fee >= params.market.news.minFee;
