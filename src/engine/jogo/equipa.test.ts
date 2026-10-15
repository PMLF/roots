import { describe, expect, it } from "vitest";
import { ATRIBUTOS, type Atributos } from "../mundo/tipos";
import { forcaEquipa, onzeAutomatico, type CandidatoOnze } from "./equipa";
import { equipaSintetica } from "./teste-util";

const atr = (n: number, extra: Partial<Atributos> = {}): Atributos => {
  const a = {} as Atributos;
  for (const k of ATRIBUTOS) a[k] = n;
  return Object.assign(a, extra);
};
const cand = (pessoa: string, pos: string, nivel: number, extra: Partial<Atributos> = {}): CandidatoOnze => ({ pessoa, posicoes: [{ pos, aptidao: 20 }], atributos: atr(nivel, extra), alturaCm: 180 });

describe("equipa", () => {
  it("a força sobe com a qualidade, linha a linha", () => {
    const fraca = forcaEquipa(equipaSintetica("A", 6).onze);
    const forte = forcaEquipa(equipaSintetica("B", 14).onze);
    for (const k of ["ataque", "controlo", "defesa", "guardaRedes"] as const) expect(forte[k]).toBeGreaterThan(fraca[k]);
    const soAtaque = forcaEquipa(equipaSintetica("C", 10, { finalizacao: 20, drible: 20, desmarcacao: 20, velocidade: 20, tecnica: 20 }).onze);
    expect(soAtaque.ataque).toBeGreaterThan(15);
    expect(soAtaque.defesa).toBeCloseTo(10, 5);
  });

  it("o onze automático põe cada um onde rende mais e usa 11 jogadores diferentes", () => {
    const plantel: CandidatoOnze[] = [
      cand("gr1", "GK", 8), cand("gr2", "GK", 14),
      ...["rb", "cb1", "cb2", "cb3", "lb", "dm", "cm1", "cm2", "am", "rw", "lw", "st1", "st2"].map((id, i) => cand(id, id.replace(/\d/g, "").toUpperCase(), 9 + (i % 4))),
    ];
    const onze = onzeAutomatico(plantel);
    expect(onze).toHaveLength(11);
    expect(new Set(onze.map((j) => j.id)).size).toBe(11);
    expect(onze.find((j) => j.posicao === "GK")?.id).toBe("gr2");
    expect(onzeAutomatico(plantel)).toEqual(onze);
  });

  it("sem guarda-redes à vista, ainda assim monta onze (pior)", () => {
    const sem = Array.from({ length: 14 }, (_, i) => cand(`p${i}`, "CM", 10));
    expect(onzeAutomatico(sem)).toHaveLength(11);
  });
});
