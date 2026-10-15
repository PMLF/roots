import { describe, expect, it } from "vitest";
import type { JogoAgendado } from "../persistencia/tipos";
import { estadoCompeticao, jogosParaJogar } from "./jornadas";

const ag = (id: string, jornada: number, data: string, competicao = "PL", epoca = 1): JogoAgendado => ({ id, competicao, epoca, jornada, data, casa: `c${id}`, fora: `f${id}` });
const cal = [ag("a1", 1, "2026-09-05"), ag("a2", 1, "2026-09-06"), ag("b1", 2, "2026-09-12"), ag("b2", 2, "2026-09-12"), ag("c1", 3, "2026-09-19"), ag("x", 1, "2026-09-05", "TP"), ag("y", 1, "2027-09-05", "PL", 2)];

describe("controlo de jornadas", () => {
  it("antes de começar: jornada 1, nada em atraso, nada jogado", () => {
    const e = estadoCompeticao("PL", 1, cal, new Set(), "2026-08-30");
    expect(e).toMatchObject({ jogosTotal: 5, jogosJogados: 0, jogosPorJogar: 5, terminada: false, jornadaAtual: 1, proximaData: "2026-09-05" });
    expect(e.emAtraso).toEqual([]);
    expect(e.jornadas.map((j) => [j.jornada, j.jogos, j.completa])).toEqual([[1, 2, false], [2, 2, false], [3, 1, false]]);
  });

  it("só conta a competição e a época pedidas", () => {
    expect(estadoCompeticao("TP", 1, cal, new Set(), "2026-08-30").jogosTotal).toBe(1);
    expect(estadoCompeticao("PL", 2, cal, new Set(), "2026-08-30").jogosTotal).toBe(1);
    expect(estadoCompeticao("XX", 1, cal, new Set(), "2026-08-30")).toMatchObject({ jogosTotal: 0, terminada: false });
  });

  it("jornada atual avança; atrasos são os jogos com data passada por jogar", () => {
    const e = estadoCompeticao("PL", 1, cal, new Set(["a1", "a2", "b1"]), "2026-09-14");
    expect(e.jornadaAtual).toBe(2);
    expect(e.jogosJogados).toBe(3);
    expect(e.emAtraso.map((j) => j.id)).toEqual(["b2"]);
    expect(e.jornadas.find((j) => j.jornada === 2)).toMatchObject({ jogados: 1, completa: false, emAtraso: 1 });
    expect(e.proximaData).toBe("2026-09-12");
  });

  it("termina quando tudo foi jogado", () => {
    const e = estadoCompeticao("PL", 1, cal, new Set(["a1", "a2", "b1", "b2", "c1"]), "2027-01-01");
    expect(e).toMatchObject({ terminada: true, jogosPorJogar: 0 });
    expect(e.jornadaAtual).toBeUndefined();
    expect(e.proximaData).toBeUndefined();
  });

  it("jogos para jogar: até hoje inclusive, por data e jornada, os atrasados primeiro", () => {
    const j = jogosParaJogar(cal, new Set(["a1"]), "2026-09-12");
    expect(j.map((x) => x.id)).toEqual(["x", "a2", "b1", "b2"]);
    expect(jogosParaJogar(cal, new Set(), "2026-09-04")).toEqual([]);
  });
});
