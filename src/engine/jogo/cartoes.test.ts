import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { relatorioDoJogo } from "./estatisticas";
import { registoDoJogo } from "./registo";
import { SimuladorJogo, simularJogo } from "./simulador";
import { equipaSintetica } from "./teste-util";
import type { EntradaJogo, EquipaJogo, EventoJogo, Tatica } from "./tipos";
import { TATICA_PADRAO } from "./formacoes";

const entrada = (id: string, fairPlay: Tatica["fairPlay"] = 3): EntradaJogo => ({ seed: "c", id, casa: { ...equipaSintetica("A", 10), tatica: { ...TATICA_PADRAO, fairPlay } }, fora: equipaSintetica("B", 10) });
type Cartao = Extract<EventoJogo, { tipo: "cartao" }>;
const cartoes = (e: readonly EventoJogo[]) => e.filter((x): x is Cartao => x.tipo === "cartao");

describe("cartões", () => {
  it("calibração: ≈4 amarelos e ≈0,15 vermelhos por jogo", () => {
    let am = 0, ver = 0, segundos = 0, jogosComVermelho = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const { eventos, resumo } = simularJogo(entrada(`k${i}`), P);
      const c = cartoes(eventos);
      am += c.filter((x) => x.cor === "amarelo").length;
      const v = c.filter((x) => x.cor === "vermelho");
      ver += v.length;
      segundos += v.filter((x) => x.segundoAmarelo).length;
      if (v.length) jogosComVermelho++;
      expect(resumo.casa.amarelos + resumo.fora.amarelos).toBe(c.filter((x) => x.cor === "amarelo").length);
      expect(resumo.casa.vermelhos + resumo.fora.vermelhos).toBe(v.length);
    }
    console.log("cartões", { amJogo: am / N, verJogo: ver / N, segundos: segundos / N, jogosComVermelho: jogosComVermelho / N });
    expect(am / N).toBeGreaterThan(3.2);
    expect(am / N).toBeLessThan(5);
    expect(ver / N).toBeGreaterThan(0.06);
    expect(ver / N).toBeLessThan(0.3);
    expect(segundos).toBeGreaterThan(0);
  });

  it("os cartões são coerentes: um expulso desaparece, o segundo amarelo vem a seguir ao primeiro", () => {
    for (let i = 0; i < 600; i++) {
      const { eventos } = simularJogo(entrada(`e${i}`), P);
      const amarelos = new Set<string>();
      const expulsos = new Map<string, number>();
      for (const e of eventos) {
        if (e.tipo === "cartao") {
          expect(expulsos.has(e.jogador), "cartão a um expulso").toBe(false);
          if (e.cor === "amarelo") amarelos.add(e.jogador);
          else {
            if (e.segundoAmarelo) expect(amarelos.has(e.jogador)).toBe(true);
            expulsos.set(e.jogador, e.minuto);
          }
        } else if ("jogador" in e && expulsos.has(e.jogador)) {
          // um expulso não faz mais nada em campo depois do minuto da expulsão
          expect(e.minuto <= (expulsos.get(e.jogador) as number), `${e.tipo} de expulso depois do vermelho`).toBe(true);
        }
      }
    }
  });

  it("um segundo amarelo é sempre amarelo + vermelho no mesmo minuto", () => {
    let vistos = 0;
    for (let i = 0; i < 3000 && vistos < 5; i++) {
      const c = cartoes(simularJogo(entrada(`s${i}`), P).eventos);
      c.forEach((x, k) => {
        if (x.cor === "vermelho" && x.segundoAmarelo) {
          vistos++;
          const antes = c[k - 1] as Cartao;
          expect(antes).toMatchObject({ cor: "amarelo", jogador: x.jogador, minuto: x.minuto });
        }
      });
    }
    expect(vistos).toBeGreaterThan(0);
  });

  it("fair play duro leva mais cartões; cavalheiro leva menos", () => {
    const media = (fp: Tatica["fairPlay"]) => {
      let t = 0;
      for (let i = 0; i < 1500; i++) t += simularJogo(entrada(`fp${fp}-${i}`, fp), P).resumo.casa.amarelos;
      return t / 1500;
    };
    const [duro, normal, limpo] = [media(5), media(3), media(1)];
    expect(duro).toBeGreaterThan(normal * 1.4);
    expect(limpo).toBeLessThan(normal * 0.65);
  });

  it("ficar com dez pesa: depois do vermelho a equipa marca menos e sofre mais", () => {
    let dez = 0, onze = 0, reds = 0;
    for (let i = 0; i < 30000; i++) {
      const { eventos } = simularJogo(entrada(`d${i}`), P);
      const v = cartoes(eventos).find((x) => x.cor === "vermelho" && x.minuto <= 60);
      if (!v) continue;
      reds++;
      for (const e of eventos) {
        if (e.tipo !== "remate" || e.resultado !== "golo" || e.minuto <= v.minuto) continue;
        if (e.lado === v.lado) dez++;
        else onze++;
      }
    }
    expect(reds).toBeGreaterThan(800);
    expect(dez / onze).toBeLessThan(0.85);
  }, 60000);

  it("um expulso não volta nem com alterarEquipa; a equipa fica com menos um", () => {
    for (let i = 0; i < 3000; i++) {
      const e = entrada(`a${i}`);
      const s = new SimuladorJogo(e, P);
      const ev = s.simularAte(94);
      const v = cartoes(ev).find((x) => x.cor === "vermelho");
      if (!v) continue;
      const s2 = new SimuladorJogo(e, P);
      s2.simularAte(v.minuto);
      const antes = s2.resumo();
      expect(antes[v.lado].vermelhos).toBeGreaterThan(0);
      // repor a equipa original (com o expulso): continua sem ele
      s2.alterarEquipa(v.lado, e[v.lado === "casa" ? "casa" : "fora"] as EquipaJogo);
      const depois = s2.simularAte(94);
      expect(depois.some((x) => "jogador" in x && x.jogador === v.jogador)).toBe(false);
      return;
    }
    throw new Error("nenhum jogo com vermelho");
  });

  it("as estatísticas e o registo contam os cartões", () => {
    for (let i = 0; i < 3000; i++) {
      const e = entrada(`r${i}`);
      const { eventos, resumo } = simularJogo(e, P);
      if (!cartoes(eventos).some((x) => x.cor === "vermelho")) continue;
      const rel = relatorioDoJogo(e, { casa: e.casa, fora: e.fora }, eventos, resumo, P);
      expect(rel.cartoes).toHaveLength(cartoes(eventos).length);
      expect(rel.jogadores.reduce((s, j) => s + j.amarelos, 0)).toBe(resumo.casa.amarelos + resumo.fora.amarelos);
      const expulso = rel.jogadores.find((j) => j.vermelhos > 0)!;
      expect(expulso.minutos).toBeLessThan(resumo.duracao);
      expect(expulso.nota).toBeLessThan(6);
      expect(rel.momentos.some((m) => m.tipo === "expulsao")).toBe(true);
      const { factos, participacoes } = registoDoJogo({ id: "x", competicao: "c", epoca: 1, jornada: 1, data: "2026-09-01" as never }, e.casa, e.fora, eventos, resumo, rel);
      expect(factos.filter((f) => f.tipo === "CA")).toHaveLength(resumo.casa.amarelos + resumo.fora.amarelos);
      expect(factos.filter((f) => f.tipo === "CV")).toHaveLength(resumo.casa.vermelhos + resumo.fora.vermelhos);
      expect(participacoes.find((p) => p.jogador === expulso.id)?.minutos).toBe(expulso.minutos);
      return;
    }
    throw new Error("nenhum jogo com vermelho");
  });
});
