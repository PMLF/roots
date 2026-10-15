/** «2026/27» para a época `epoca` de um save cuja época 1 começa em `anoInicial`. */
export const nomeDaEpoca = (epoca: number, anoInicial: number): string => `${anoInicial + epoca - 1}/${String((anoInicial + epoca) % 100).padStart(2, "0")}`;
