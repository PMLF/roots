import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { equipaSintetica } from "./teste-util";
import { registoDoJogo } from "./registo";
import { SimuladorJogo, simularJogo } from "./simulador";
import type { EntradaJogo, EventoJogo } from "./tipos";

const entrada = (id = "j1", seed = "s", a = 10, b = 10): EntradaJogo => ({ seed, id, casa: equipaSintetica("A", a), fora: equipaSintetica("B", b) });

describe("motor de jogo", () => {
  it("é determinístico: mesma seed e mesmo jogo, mesmo resultado; outro id, outro jogo", () => {
    const a = simularJogo(entrada(), P);
    const b = simularJogo(entrada(), P);
    expect(b).toEqual(a);
    const c = simularJogo(entrada("j2"), P);
    expect(c.eventos).not.toEqual(a.eventos);
    expect(simularJogo(entrada("j1", "outra"), P).eventos).not.toEqual(a.eventos);
  });

  it("é retomável: simular por partes dá o mesmo jogo que simular de uma vez", () => {
    const inteiro = simularJogo(entrada("r1"), P);
    const s = new SimuladorJogo(entrada("r1"), P);
    const partes: EventoJogo[] = [];
    for (const m of [10, 10, 45, 46, 70, 200]) partes.push(...s.simularAte(m));
    expect(s.terminado).toBe(true);
    expect(partes).toEqual(inteiro.eventos);
    expect(s.resumo()).toEqual(inteiro.resumo);
    // depois do fim não há mais nada
    expect(s.simularAte(300)).toEqual([]);
  });

  it("os eventos são coerentes com o resumo", () => {
    for (let i = 0; i < 60; i++) {
      const { eventos, resumo } = simularJogo(entrada(`c${i}`), P);
      const golos = { casa: 0, fora: 0 };
      let remates = 0;
      let cantos = 0;
      let faltas = 0;
      let ultimo = 0;
      for (const e of eventos) {
        expect(e.minuto).toBeGreaterThanOrEqual(ultimo);
        expect(e.minuto).toBeGreaterThanOrEqual(1);
        expect(e.minuto).toBeLessThanOrEqual(resumo.duracao);
        ultimo = e.minuto;
        if (e.tipo === "remate") {
          remates++;
          if (e.resultado === "golo") golos[e.lado]++;
          expect(e.xg).toBeGreaterThan(0);
          expect(e.xg).toBeLessThan(1);
          if (e.assistente) expect(e.assistente).not.toBe(e.jogador);
          expect(e.jogador.startsWith(e.lado === "casa" ? "A-" : "B-")).toBe(true);
          expect(e.jogador).not.toBe(`${e.lado === "casa" ? "A" : "B"}-0`); // o guarda-redes não remata
        } else if (e.tipo === "canto") cantos++;
        else if (e.tipo === "falta") faltas++;
      }
      expect(golos).toEqual({ casa: resumo.casa.golos, fora: resumo.fora.golos });
      expect(remates).toBe(resumo.casa.remates + resumo.fora.remates);
      expect(cantos).toBe(resumo.casa.cantos + resumo.fora.cantos);
      expect(faltas).toBe(resumo.casa.faltas + resumo.fora.faltas);
      expect(resumo.casa.aBaliza).toBeGreaterThanOrEqual(resumo.casa.golos);
      expect(resumo.duracao).toBeGreaterThanOrEqual(P.jogo.duracao + P.jogo.acrescimos.min);
      expect(resumo.duracao).toBeLessThanOrEqual(P.jogo.duracao + P.jogo.acrescimos.max);
      expect(resumo.posseCasa).toBeGreaterThan(0);
      expect(resumo.posseCasa).toBeLessThan(1);
    }
  });

  it("alterar a equipa a meio só afeta o que vem depois", () => {
    const s1 = new SimuladorJogo(entrada("a1", "s", 10, 10), P);
    const antes1 = s1.simularAte(45);
    s1.alterarEquipa("fora", equipaSintetica("B", 4));
    const depois1 = s1.simularAte(200);
    const s2 = new SimuladorJogo(entrada("a1", "s", 10, 10), P);
    expect(s2.simularAte(45)).toEqual(antes1);
    const depois2 = s2.simularAte(200);
    expect(depois2).not.toEqual(depois1);
  });

  it("um guarda-redes péssimo sofre mais: o atributo conta", () => {
    let golosBom = 0;
    let golosMau = 0;
    for (let i = 0; i < 400; i++) {
      const bom = { seed: "g", id: `gr${i}`, casa: equipaSintetica("A", 10), fora: equipaSintetica("B", 10, { reflexos: 18, manuseamento: 18, posicionamentoGR: 18, saidas: 18 }) };
      const mau = { seed: "g", id: `gr${i}`, casa: equipaSintetica("A", 10), fora: equipaSintetica("B", 10, { reflexos: 3, manuseamento: 3, posicionamentoGR: 3, saidas: 3 }) };
      golosBom += simularJogo(bom, P).resumo.casa.golos;
      golosMau += simularJogo(mau, P).resumo.casa.golos;
    }
    expect(golosMau).toBeGreaterThan(golosBom * 1.2);
  });

  it("o registo do jogo é aceite pelo repositório e os factos batem com o resultado", () => {
    const e = entrada("reg1");
    const { eventos, resumo } = simularJogo(e, P);
    const { jogo, factos, participacoes } = registoDoJogo({ id: "reg1", competicao: "SL", epoca: 1, jornada: 1, data: "2026-08-22" }, e.casa, e.fora, eventos, resumo);
    expect(participacoes).toHaveLength(22);
    expect(factos.filter((f) => f.tipo === "G")).toHaveLength(resumo.casa.golos + resumo.fora.golos);
    const r = new RepositorioMemoria();
    r.registarJogo(jogo, factos, participacoes);
    expect(r.jogo("reg1")).toMatchObject({ golosCasa: resumo.casa.golos, golosFora: resumo.fora.golos });
    expect(r.classificacao("SL", 1)).toHaveLength(2);
  });
});
