import { describe, expect, it } from "vitest";
import { presetColumns, filter, sort, nextOrder, type Column } from "./logic";

type L = { name: string; age: number; pos: string };
const lines: L[] = [
  { name: "Álvaro Dias", age: 31, pos: "CB" },
  { name: "Bruno Costa", age: 19, pos: "CM" },
  { name: "Zé Maria", age: 31, pos: "GK" },
  { name: "alberto Sá", age: 24, pos: "ST" },
];
const columns: Column<L>[] = [
  { id: "name", title: "Nome", value: (l) => l.name },
  { id: "age", title: "Idade", value: (l) => l.age, numeric: true },
  { id: "pos", title: "Posição", value: (l) => l.pos },
];

describe("tabela: ordenar", () => {
  it("texto ignora acentos e maiúsculas", () => {
    expect(sort(lines, columns, { column: "name", direction: "asc" }).map((l) => l.name)).toEqual(["alberto Sá", "Álvaro Dias", "Bruno Costa", "Zé Maria"]);
  });
  it("números por valor, desc, e estável nos empates", () => {
    expect(sort(lines, columns, { column: "age", direction: "desc" }).map((l) => l.name)).toEqual(["Álvaro Dias", "Zé Maria", "alberto Sá", "Bruno Costa"]);
  });
  it("sortValue manda na ordenação (posições do guarda-redes ao ponta de lança)", () => {
    const rank = ["GK", "CB", "CM", "ST"];
    const cols: Column<L>[] = [{ id: "pos", title: "Posição", value: (l) => l.pos, sortValue: (l) => rank.indexOf(l.pos) }];
    expect(sort(lines, cols, { column: "pos", direction: "asc" }).map((l) => l.pos)).toEqual(["GK", "CB", "CM", "ST"]);
  });
  it("sem ordem devolve cópia na ordem original", () => {
    const r = sort(lines, columns, null);
    expect(r).toEqual(lines);
    expect(r).not.toBe(lines);
  });
  it("ciclo do cabeçalho", () => {
    const a = nextOrder(null, "age");
    expect(a).toEqual({ column: "age", direction: "asc" });
    expect(nextOrder(a, "age")).toEqual({ column: "age", direction: "desc" });
    expect(nextOrder(nextOrder(a, "age"), "age")).toBeNull();
    expect(nextOrder(a, "name")).toEqual({ column: "name", direction: "asc" });
  });
});

describe("tabela: filtrar, exportar, conjuntos", () => {
  it("filtro com várias palavras em colunas diferentes", () => {
    expect(filter(lines, columns, "alvaro cb").map((l) => l.name)).toEqual(["Álvaro Dias"]);
    expect(filter(lines, columns, "   ")).toHaveLength(4);
    expect(filter(lines, columns, "31")).toHaveLength(2);
  });
  it("conjunto de colunas mantém a ordem e ignora ids em falta", () => {
    expect(presetColumns(columns, { name: "x", columns: ["pos", "name", "fantasma"] }).map((c) => c.id)).toEqual(["pos", "name"]);
    expect(presetColumns(columns, { name: "x", columns: ["fantasma"] })).toHaveLength(3);
    expect(presetColumns(columns, undefined)).toHaveLength(3);
  });
});
