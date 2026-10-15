import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import type { RegistoCartao } from "../persistencia/tipos";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { jogoSintetico } from "../persistencia/repositorio.contrato";
import { estadoDisciplinar, jogosVermelhoDireto, semSuspensos, suspensosDoClube } from "./castigos";

const ca = (jornada: number, jogador = "p"): RegistoCartao => ({ jogador, jogo: `j${jornada}`, jornada, minuto: 30, tipo: "CA", extra: "" });
const cv = (jornada: number, extra = "", jogador = "p"): RegistoCartao => ({ jogador, jogo: `j${jornada}`, jornada, minuto: 60, tipo: "CV", extra });
const jornadas = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const estado = (cartoes: RegistoCartao[], jogadas: number, proxima = jogadas + 1, pendente = 0) => estadoDisciplinar("p", cartoes, jornadas(jogadas), proxima, "s", P, pendente);

describe("castigos disciplinares", () => {
  it("sem cartões, ninguém está suspenso", () => {
    expect(estado([], 10)).toMatchObject({ amarelos: 0, suspenso: false, jogosPorCumprir: 0, paraSuspensao: 5 });
  });

  it("de 5 em 5 amarelos, um jogo de suspensão que se cumpre no jogo seguinte", () => {
    const am = [1, 2, 4, 6, 7].map((j) => ca(j));
    expect(estado(am.slice(0, 4), 7)).toMatchObject({ amarelos: 4, suspenso: false, paraSuspensao: 1 });
    // o 5.º amarelo na jornada 7: suspenso na 8
    expect(estado(am, 7)).toMatchObject({ amarelos: 5, suspenso: true, jogosPorCumprir: 1, motivo: "acumulacao", paraSuspensao: 5 });
    // cumprido na 8: já pode jogar na 9
    expect(estado(am, 8)).toMatchObject({ suspenso: false, jogosPorCumprir: 0 });
    // o 10.º amarelo dá outro
    const dez = [...am, ...[9, 10, 11, 12, 13].map((j) => ca(j))];
    expect(estado(dez, 13)).toMatchObject({ amarelos: 10, suspenso: true, jogosPorCumprir: 1 });
  });

  it("vermelho por segundo amarelo: um jogo; o primeiro amarelo conta para a acumulação", () => {
    const cs = [ca(3), cv(3, "2A")];
    expect(estado(cs, 3)).toMatchObject({ suspenso: true, jogosPorCumprir: 1, motivo: "segundo-amarelo", amarelos: 1 });
    expect(estado(cs, 4)).toMatchObject({ suspenso: false });
  });

  it("vermelho direto: pelo menos um jogo, o mesmo sempre, e nunca mais que o máximo", () => {
    const vistos = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const n = jogosVermelhoDireto("s", `j${i}`, "p", P.disciplina);
      expect(jogosVermelhoDireto("s", `j${i}`, "p", P.disciplina)).toBe(n);
      expect(n).toBeGreaterThanOrEqual(P.disciplina.vermelhoDireto.jogos);
      expect(n).toBeLessThanOrEqual(P.disciplina.vermelhoDireto.max);
      vistos.add(n);
    }
    expect(vistos.size).toBeGreaterThan(1);
    // cumpre-se jogo a jogo
    const n = jogosVermelhoDireto("s", "j5", "p", P.disciplina);
    expect(estado([cv(5)], 5)).toMatchObject({ suspenso: true, jogosPorCumprir: n, motivo: "vermelho" });
    expect(estado([cv(5)], 5 + n - 1)).toMatchObject({ suspenso: true, jogosPorCumprir: 1 });
    expect(estado([cv(5)], 5 + n)).toMatchObject({ suspenso: false });
  });

  it("quem está suspenso não joga: castigos seguidos acumulam e o clube sem jogos não cumpre", () => {
    // vermelho na 5 e 5.º amarelo na 4 → o castigo do amarelo cumpre-se antes?
    const cs = [ca(1), ca(2), ca(3), ca(4), ca(5)]; // 5.º amarelo na jornada 5 → fora na 6
    expect(estado(cs, 5)).toMatchObject({ suspenso: true, jogosPorCumprir: 1 });
    // o clube folga na jornada 6 (não jogou): continua suspenso na 7
    const semSeis = [1, 2, 3, 4, 5, 7];
    expect(estadoDisciplinar("p", cs, semSeis, 7, "s", P)).toMatchObject({ suspenso: true });
    expect(estadoDisciplinar("p", cs, [1, 2, 3, 4, 5, 6], 7, "s", P)).toMatchObject({ suspenso: false });
    // cartões de outro jogador não contam
    expect(estadoDisciplinar("outro", cs, jornadas(5), 6, "s", P).amarelos).toBe(0);
  });

  it("o castigo pendente da época anterior cumpre-se na seguinte", () => {
    expect(estado([], 0, 1, 2)).toMatchObject({ suspenso: true, jogosPorCumprir: 2 });
    expect(estado([], 1, 2, 2)).toMatchObject({ suspenso: true, jogosPorCumprir: 1 });
    expect(estado([], 2, 3, 2)).toMatchObject({ suspenso: false });
  });

  it("lê do repositório, por competição e época, e tira os suspensos do onze", () => {
    const r = new RepositorioMemoria();
    // A-4 vê amarelo em casa em cada jogo; o 5.º dá suspensão
    for (let j = 1; j <= 5; j++) {
      const x = jogoSintetico(`g${j}`, { casa: "A", fora: "B", golosCasa: 0, golosFora: 0, jornada: j, data: `2026-09-${10 + j}` }, { cartoes: true });
      r.registarJogo(x.jogo, x.factos, x.part);
    }
    const jogadores = ["A-4", "A-5", "B-5"];
    const sus = suspensosDoClube(r, "A", jogadores, "PL", 1, 6, "s", P);
    expect(sus.map((s) => s.jogador)).toEqual(["A-4"]);
    expect(sus[0]).toMatchObject({ amarelos: 5, jogosPorCumprir: 1, motivo: "acumulacao" });
    expect(suspensosDoClube(r, "A", jogadores, "TP", 1, 6, "s", P)).toEqual([]);
    expect(suspensosDoClube(r, "A", jogadores, "PL", 2, 6, "s", P)).toEqual([]);
    const candidatos = [{ pessoa: "A-4" }, { pessoa: "A-9" }];
    expect(semSuspensos(candidatos, sus)).toEqual([{ pessoa: "A-9" }]);
    // pendente da época anterior
    expect(suspensosDoClube(r, "A", ["A-9"], "PL", 1, 1, "s", P, new Map([["A-9", 1]]))).toHaveLength(1);
  });
});
