/** «2026/27» para a época `epoca` de um save cuja época 1 começa em `anoInicial`. */
export const seasonName = (season: number, initialYear: number): string => `${initialYear + season - 1}/${String((initialYear + season) % 100).padStart(2, "0")}`;
