/**
 * Leitor mínimo de CSV (RFC 4180): vírgulas, aspas duplas, aspas escapadas ("")
 * e quebras de linha dentro de campos entre aspas. Ignora o BOM inicial.
 * Funções puras; o motor não lê ficheiros (quem chama entrega o texto).
 */

export function readCsv(text: string): string[][] {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines: string[][] = [];
  let pitch = "";
  let line: string[] = [];
  let quotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          pitch += '"';
          i++;
        } else quotes = false;
      } else pitch += c;
    } else if (c === '"') quotes = true;
    else if (c === ",") {
      line.push(pitch);
      pitch = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      line.push(pitch);
      pitch = "";
      lines.push(line);
      line = [];
    } else pitch += c;
  }
  if (pitch !== "" || line.length > 0) {
    line.push(pitch);
    lines.push(line);
  }
  return lines.filter((l) => !(l.length === 1 && l[0] === ""));
}

export type LineCsv = { number: number; values: Record<string, string> };

/** Primeira linha = cabeçalho. `numero` é o número da linha no ficheiro (1 = cabeçalho). */
export function readTable(text: string): { columns: string[]; lines: LineCsv[]; errors: string[] } {
  const raw = readCsv(text);
  const errors: string[] = [];
  if (raw.length === 0) return { columns: [], lines: [], errors: ["ficheiro vazio"] };
  const columns = (raw[0] ?? []).map((c) => c.trim());
  const lines: LineCsv[] = [];
  raw.slice(1).forEach((l, i) => {
    const number = i + 2;
    if (l.length !== columns.length) {
      errors.push(`linha ${number}: ${l.length} campos (esperado ${columns.length})`);
      return;
    }
    const values: Record<string, string> = {};
    columns.forEach((c, j) => (values[c] = (l[j] ?? "").trim()));
    lines.push({ number, values });
  });
  return { columns, lines, errors };
}
