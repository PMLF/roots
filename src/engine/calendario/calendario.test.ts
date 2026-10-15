import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { PARAMETROS_PADRAO as PARAMETROS } from "../config/parametros";
import { diaDaSemana } from "./datas";
import { gerarCalendarioLiga, validarCalendario } from "./calendario";
import { maiorSequenciaCasaFora, todosContraTodos } from "./todosContraTodos";

const clubes = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`);
const C = PARAMETROS.calendario;

describe("todos contra todos", () => {
  it.each([4, 6, 8, 10, 12, 16, 18, 20])("n=%i: sem sequências de 3 casa/fora", (n) => {
    const r = todosContraTodos(clubes(n), 2, new Rng("7"));
    expect(r.length).toBe(2 * (n - 1));
    for (const m of maiorSequenciaCasaFora(r).values()) expect(m).toBeLessThanOrEqual(2);
  });
  it("n ímpar tem folga por ronda", () => {
    const r = todosContraTodos(clubes(7), 2, new Rng("1"));
    expect(r.length).toBe(14);
    expect(r.every((x) => x.folga !== undefined)).toBe(true);
  });
  it("é determinístico", () => {
    expect(todosContraTodos(clubes(10), 2, new Rng("3"))).toEqual(todosContraTodos(clubes(10), 2, new Rng("3")));
  });
});

describe("calendário de liga", () => {
  it.each([
    ["primeiraLiga", 18],
    ["segundaLiga", 16],
    ["terceiraLiga", 20],
    ["distrital", 14],
    ["distrital", 11],
  ] as const)("%s com %i clubes é válido e respeita as janelas", (escalao, n) => {
    const cal = gerarCalendarioLiga({ competicao: `${escalao}-${n}`, escalao, clubes: clubes(n) }, 1, C, new Rng("42"));
    expect(validarCalendario(cal)).toEqual([]);
    const primeira = cal.jornadas[0]!.data;
    const ultima = cal.jornadas[cal.jornadas.length - 1]!.data;
    expect(primeira >= "2026-08-15").toBe(true);
    expect(ultima <= "2027-05-18").toBe(true);
    for (const j of cal.jornadas)
      for (const g of j.jogos) expect(C.diasDeJogo[escalao].includes(diaDaSemana(g.data)) || diaDaSemana(g.data) === 3).toBe(true);
  });
  it("não joga nas pausas", () => {
    const cal = gerarCalendarioLiga({ competicao: "pl", escalao: "primeiraLiga", clubes: clubes(18) }, 1, C, new Rng("5"));
    for (const j of cal.jornadas) {
      expect(j.data >= "2026-12-22" && j.data <= "2027-01-02").toBe(false);
      expect(j.data >= "2026-10-09" && j.data <= "2026-10-15").toBe(false);
    }
  });
  it("determinístico por seed", () => {
    const d = { competicao: "x", escalao: "segundaLiga" as const, clubes: clubes(16) };
    expect(gerarCalendarioLiga(d, 2, C, new Rng("9"))).toEqual(gerarCalendarioLiga(d, 2, C, new Rng("9")));
  });
});

describe("calendário no repositório", () => {
  it("guarda um calendário gerado e devolve-o igual", async () => {
    const { RepositorioMemoria } = await import("../persistencia/repositorioMemoria");
    const { paraRepositorio } = await import("./calendario");
    const cal = gerarCalendarioLiga({ competicao: "SL", escalao: "segundaLiga", clubes: clubes(15) }, 1, C, new Rng("1"));
    const r = new RepositorioMemoria();
    const { jogos, folgas } = paraRepositorio(cal);
    r.guardarCalendario(jogos, folgas);
    expect(r.calendario("SL", 1).jogos).toHaveLength(15 * 14);
    expect(r.calendario("SL", 1).folgas).toHaveLength(30);
    expect(r.calendarioDoClube("c1", 1)).toHaveLength(28);
  });
});
