/**
 * Leitor mínimo de CSV (RFC 4180): vírgulas, aspas duplas, aspas escapadas ("")
 * e quebras de linha dentro de campos entre aspas. Ignora o BOM inicial.
 * Funções puras; o motor não lê ficheiros (quem chama entrega o texto).
 */

export function lerCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => !(l.length === 1 && l[0] === ""));
}

export type LinhaCsv = { numero: number; valores: Record<string, string> };

/** Primeira linha = cabeçalho. `numero` é o número da linha no ficheiro (1 = cabeçalho). */
export function lerTabela(texto: string): { colunas: string[]; linhas: LinhaCsv[]; erros: string[] } {
  const bruto = lerCsv(texto);
  const erros: string[] = [];
  if (bruto.length === 0) return { colunas: [], linhas: [], erros: ["ficheiro vazio"] };
  const colunas = (bruto[0] ?? []).map((c) => c.trim());
  const linhas: LinhaCsv[] = [];
  bruto.slice(1).forEach((l, i) => {
    const numero = i + 2;
    if (l.length !== colunas.length) {
      erros.push(`linha ${numero}: ${l.length} campos (esperado ${colunas.length})`);
      return;
    }
    const valores: Record<string, string> = {};
    colunas.forEach((c, j) => (valores[c] = (l[j] ?? "").trim()));
    linhas.push({ numero, valores });
  });
  return { colunas, linhas, erros };
}
