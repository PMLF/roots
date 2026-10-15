import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { simularJogo } from "./simulador";
import { equipaSintetica } from "./teste-util";
import type { ResumoJogo } from "./tipos";

function campanha(nCasa: number, nFora: number, n: number) {
  const casa = equipaSintetica("C", nCasa);
  const fora = equipaSintetica("F", nFora);
  let v = 0, e = 0, d = 0;
  const soma = { golos: 0, golosFora: 0, remates: 0, aBaliza: 0, xg: 0, xgFora: 0, cantos: 0, faltas: 0, posse: 0, penaltis: 0, oport: 0 };
  for (let i = 0; i < n; i++) {
    const { eventos, resumo: r } = simularJogo({ seed: "cal", id: `j${i}`, casa, fora }, P) as { eventos: { tipo: string; origem?: string }[]; resumo: ResumoJogo };
    if (r.casa.golos > r.fora.golos) v++; else if (r.casa.golos === r.fora.golos) e++; else d++;
    soma.golos += r.casa.golos; soma.golosFora += r.fora.golos;
    soma.remates += r.casa.remates + r.fora.remates;
    soma.aBaliza += r.casa.aBaliza + r.fora.aBaliza;
    soma.xg += r.casa.xg; soma.xgFora += r.fora.xg;
    soma.cantos += r.casa.cantos + r.fora.cantos;
    soma.faltas += r.casa.faltas + r.fora.faltas;
    soma.oport += r.casa.oportunidades + r.fora.oportunidades;
    soma.posse += r.posseCasa;
    soma.penaltis += eventos.filter((x) => x.tipo === "remate" && x.origem === "penalti").length;
  }
  return {
    vitoriaCasa: v / n, empate: e / n, vitoriaFora: d / n,
    golosJogo: (soma.golos + soma.golosFora) / n, golosCasa: soma.golos / n, golosFora: soma.golosFora / n,
    rematesEquipa: soma.remates / n / 2, aBalizaEquipa: soma.aBaliza / n / 2, oportunidadesEquipa: soma.oport / n / 2,
    xgJogo: (soma.xg + soma.xgFora) / n, cantosJogo: soma.cantos / n, faltasJogo: soma.faltas / n, posseCasa: soma.posse / n, penaltisJogo: soma.penaltis / n,
  };
}

describe("calibração do motor de jogo (RZ-104; o harness completo é RZ-123)", () => {
  it("equipas iguais: números de um jogo normal de futebol", () => {
    const c = campanha(10, 10, 4000);
    console.log("iguais", JSON.stringify(c, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
    expect(c.golosJogo).toBeGreaterThan(2.3);
    expect(c.golosJogo).toBeLessThan(3.0);
    expect(c.oportunidadesEquipa).toBeGreaterThan(21);
    expect(c.oportunidadesEquipa).toBeLessThan(27);
    expect(c.rematesEquipa).toBeGreaterThan(10);
    expect(c.rematesEquipa).toBeLessThan(15);
    expect(c.aBalizaEquipa).toBeGreaterThan(3.5);
    expect(c.aBalizaEquipa).toBeLessThan(6);
    expect(c.cantosJogo).toBeGreaterThan(8);
    expect(c.cantosJogo).toBeLessThan(13);
    expect(c.faltasJogo).toBeGreaterThan(21);
    expect(c.faltasJogo).toBeLessThan(27);
    expect(c.penaltisJogo).toBeGreaterThan(0.15);
    expect(c.penaltisJogo).toBeLessThan(0.45);
    expect(c.vitoriaCasa).toBeGreaterThan(0.4);
    expect(c.vitoriaCasa).toBeLessThan(0.5);
    expect(c.empate).toBeGreaterThan(0.22);
    expect(c.empate).toBeLessThan(0.32);
    expect(c.posseCasa).toBeGreaterThan(0.5);
    expect(c.posseCasa).toBeLessThan(0.58);
    // xG: os golos esperados batem com os marcados (com equipas médias, o xG é o modelo certo)
    expect(Math.abs(c.xgJogo - c.golosJogo) / c.golosJogo).toBeLessThan(0.08);
  });

  it("a força conta: mais qualidade, mais pontos, mas o azar existe", () => {
    const dois = campanha(12, 10, 3000);
    console.log("12-10", JSON.stringify(dois, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
    const forte = campanha(12, 9, 3000);
    console.log("forte-casa", JSON.stringify(forte, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
    expect(forte.vitoriaCasa).toBeGreaterThan(0.62);
    expect(forte.vitoriaCasa).toBeLessThan(0.85);
    expect(forte.vitoriaFora).toBeGreaterThan(0.04);
    expect(forte.posseCasa).toBeGreaterThan(0.6);
    const forteFora = campanha(9, 12, 3000);
    expect(forteFora.vitoriaFora).toBeGreaterThan(0.5);
    expect(forteFora.vitoriaCasa).toBeGreaterThan(0.1);
    const muito = campanha(14, 8, 2000);
    expect(muito.vitoriaCasa).toBeGreaterThan(0.85);
    expect(muito.vitoriaFora).toBeGreaterThan(0.005);
  });
});
