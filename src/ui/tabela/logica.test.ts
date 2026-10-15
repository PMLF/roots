import { describe, expect, it } from "vitest";
import { colunasDoConjunto, filtrar, ordenar, paraCsv, proximaOrdem, type Coluna } from "./logica";

type L = { nome: string; idade: number; pos: string };
const linhas: L[] = [
  { nome: "Álvaro Dias", idade: 31, pos: "CB" },
  { nome: "Bruno Costa", idade: 19, pos: "CM" },
  { nome: "Zé Maria", idade: 31, pos: "GK" },
  { nome: "alberto Sá", idade: 24, pos: "ST" },
];
const colunas: Coluna<L>[] = [
  { id: "nome", titulo: "Nome", valor: (l) => l.nome },
  { id: "idade", titulo: "Idade", valor: (l) => l.idade, numerica: true },
  { id: "pos", titulo: "Posição", valor: (l) => l.pos },
];

describe("tabela: ordenar", () => {
  it("texto ignora acentos e maiúsculas", () => {
    expect(ordenar(linhas, colunas, { coluna: "nome", direcao: "asc" }).map((l) => l.nome)).toEqual(["alberto Sá", "Álvaro Dias", "Bruno Costa", "Zé Maria"]);
  });
  it("números por valor, desc, e estável nos empates", () => {
    expect(ordenar(linhas, colunas, { coluna: "idade", direcao: "desc" }).map((l) => l.nome)).toEqual(["Álvaro Dias", "Zé Maria", "alberto Sá", "Bruno Costa"]);
  });
  it("sem ordem devolve cópia na ordem original", () => {
    const r = ordenar(linhas, colunas, null);
    expect(r).toEqual(linhas);
    expect(r).not.toBe(linhas);
  });
  it("ciclo do cabeçalho", () => {
    const a = proximaOrdem(null, "idade");
    expect(a).toEqual({ coluna: "idade", direcao: "asc" });
    expect(proximaOrdem(a, "idade")).toEqual({ coluna: "idade", direcao: "desc" });
    expect(proximaOrdem(proximaOrdem(a, "idade"), "idade")).toBeNull();
    expect(proximaOrdem(a, "nome")).toEqual({ coluna: "nome", direcao: "asc" });
  });
});

describe("tabela: filtrar, exportar, conjuntos", () => {
  it("filtro com várias palavras em colunas diferentes", () => {
    expect(filtrar(linhas, colunas, "alvaro cb").map((l) => l.nome)).toEqual(["Álvaro Dias"]);
    expect(filtrar(linhas, colunas, "   ")).toHaveLength(4);
    expect(filtrar(linhas, colunas, "31")).toHaveLength(2);
  });
  it("CSV com ; BOM e aspas", () => {
    const csv = paraCsv([{ nome: 'Rui "Pé" Alves; Jr', idade: 20, pos: "CM" }], colunas);
    expect(csv).toBe('﻿Nome;Idade;Posição\r\n"Rui ""Pé"" Alves; Jr";20;CM\r\n');
  });
  it("conjunto de colunas mantém a ordem e ignora ids em falta", () => {
    expect(colunasDoConjunto(colunas, { nome: "x", colunas: ["pos", "nome", "fantasma"] }).map((c) => c.id)).toEqual(["pos", "nome"]);
    expect(colunasDoConjunto(colunas, { nome: "x", colunas: ["fantasma"] })).toHaveLength(3);
    expect(colunasDoConjunto(colunas, undefined)).toHaveLength(3);
  });
});
