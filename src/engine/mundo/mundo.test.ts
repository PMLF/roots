import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { DEFAULT_PARAMETERS as P, createParams } from "../config/parametros";
import { isBlocked } from "./bloqueio";
import { namesFamilies, generateName } from "./nomes";
import { importCountries, birthWeight, weightForPortugal, tailProb } from "./paises";
import { sampleQuality, densityIn, densityTable } from "./talento";
import { LISTS } from "./listas";

const csv = readFileSync("data/paises.csv", "utf8");
const r = importCountries(csv);
if (!r.ok) throw new Error(r.errors.join("\n"));
const countries = r.countries;
const country = (id: string) => countries.find((p) => p.id === id)!;

describe("países", () => {
  it("o CSV é válido e todas as famílias de nomes existem", () => {
    expect(countries.length).toBeGreaterThanOrEqual(35);
    for (const p of countries) expect(Object.keys(LISTS), p.id).toContain(p.familyNames);
    expect(namesFamilies().sort()).toEqual([...new Set(countries.map((p) => p.familyNames))].sort());
  });
  it("rejeita CSV inválido", () => {
    const bad = importCountries("id,nome,populacao_milhoes,tradicao,infraestrutura,afinidade_pt,familia_nomes,lusofono\nxx,Teste,-1,200,5,2,portugal,0\n");
    expect(bad.ok).toBe(false);
  });
  it("países grandes e de tradição pesam mais; lusófonos mais que o resto", () => {
    expect(birthWeight(country("br"))).toBeGreaterThan(birthWeight(country("uz")));
    expect(weightForPortugal(country("br"), "firstLeague")).toBeGreaterThan(weightForPortugal(country("go"), "firstLeague"));
  });
});

describe("talento com cauda rara", () => {
  const t = P.world.talent;
  it("a cauda nunca é zero", () => {
    for (const p of countries) expect(tailProb(p, t)).toBeGreaterThan(0);
  });
  it("países fracos geram craques, mas muito menos do que os fortes", () => {
    const rng = new Rng("talent");
    const count = (p: ReturnType<typeof country>) => {
      let n = 0;
      for (let i = 0; i < 60000; i++) if (sampleQuality(rng, p, t) >= 16) n++;
      return n;
    };
    const weak = count(country("uz"));
    const strong = count(country("br"));
    expect(weak).toBeGreaterThan(0);
    expect(strong).toBeGreaterThan(weak * 3);
  });
  it("a densidade para q alto é positiva em todos os países e maior nos de índice alto", () => {
    for (const p of countries) expect(densityIn(densityTable(p, t), 18)).toBeGreaterThan(0);
    expect(densityIn(densityTable(country("fr"), t), 17)).toBeGreaterThan(densityIn(densityTable(country("ga"), t), 17));
  });
  it("valida parâmetros incoerentes", () => {
    expect(() => createParams({ world: { talent: { seasonsIndex0: 0 } } })).toThrow(/cauda/);
  });
});

describe("names", () => {
  it("geram nomes de todas as famílias, determinísticos", () => {
    for (const f of namesFamilies()) {
      const a = generateName(new Rng("n"), f);
      expect(a).toEqual(generateName(new Rng("n"), f));
      expect(a.full.length).toBeGreaterThan(3);
      expect(a.sporting.split(" ").length).toBeGreaterThanOrEqual(2);
    }
  });
  it("nomes portugueses têm 1-2 próprios e 1-2 apelidos; espanhóis 2 apelidos", () => {
    const rng = new Rng("pt");
    for (let i = 0; i < 200; i++) {
      const n = generateName(rng, "portugal");
      expect(n.own.length).toBeGreaterThanOrEqual(1);
      expect(n.surnames.length).toBeLessThanOrEqual(2);
      expect(generateName(rng, "espanha").surnames).toHaveLength(2);
    }
  });
  it("nunca gera nomes da lista de bloqueio (mesmo quando a combinação é provável)", () => {
    const rng = new Rng("bloq");
    for (let i = 0; i < 20000; i++) {
      const n = generateName(rng, i % 2 ? "portugal" : "espanha");
      expect(isBlocked(n.sporting)).toBe(false);
      expect(isBlocked(n.full)).toBe(false);
    }
    expect(isBlocked("Rúben Dias")).toBe(true);
    expect(isBlocked("sergio  RAMOS")).toBe(true);
  });
  it("sem bloqueio, as combinações famosas aparecem (prova de que o filtro trabalha)", () => {
    const rng = new Rng("bloq");
    let found = false;
    for (let i = 0; i < 40000 && !found; i++) found = isBlocked(generateName(rng, "portugal", new Set()).sporting);
    expect(found).toBe(true);
  });
});
