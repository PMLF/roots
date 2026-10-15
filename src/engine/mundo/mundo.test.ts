import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { PARAMETROS_PADRAO as P, criarParametros } from "../config/parametros";
import { estaBloqueado } from "./bloqueio";
import { familiasDeNomes, gerarNome } from "./nomes";
import { importarPaises, pesoNascimento, pesoParaPortugal, probCauda } from "./paises";
import { amostrarQualidade, densidadeEm, tabelaDensidade } from "./talento";
import { LISTAS } from "./listas";

const csv = readFileSync("data/paises.csv", "utf8");
const r = importarPaises(csv);
if (!r.ok) throw new Error(r.erros.join("\n"));
const paises = r.paises;
const pais = (id: string) => paises.find((p) => p.id === id)!;

describe("países", () => {
  it("o CSV é válido e todas as famílias de nomes existem", () => {
    expect(paises.length).toBeGreaterThanOrEqual(35);
    for (const p of paises) expect(Object.keys(LISTAS), p.id).toContain(p.familiaNomes);
    expect(familiasDeNomes().sort()).toEqual([...new Set(paises.map((p) => p.familiaNomes))].sort());
  });
  it("rejeita CSV inválido", () => {
    const mau = importarPaises("id,nome,populacao_milhoes,tradicao,infraestrutura,afinidade_pt,familia_nomes,lusofono\nxx,Teste,-1,200,5,2,portugal,0\n");
    expect(mau.ok).toBe(false);
  });
  it("países grandes e de tradição pesam mais; lusófonos mais que o resto", () => {
    expect(pesoNascimento(pais("br"))).toBeGreaterThan(pesoNascimento(pais("uz")));
    expect(pesoParaPortugal(pais("br"), "primeiraLiga")).toBeGreaterThan(pesoParaPortugal(pais("ir"), "primeiraLiga"));
  });
});

describe("talento com cauda rara", () => {
  const t = P.mundo.talento;
  it("a cauda nunca é zero", () => {
    for (const p of paises) expect(probCauda(p, t)).toBeGreaterThan(0);
  });
  it("países fracos geram craques, mas muito menos do que os fortes", () => {
    const rng = new Rng("talento");
    const conta = (p: ReturnType<typeof pais>) => {
      let n = 0;
      for (let i = 0; i < 60000; i++) if (amostrarQualidade(rng, p, t) >= 16) n++;
      return n;
    };
    const fraco = conta(pais("uz"));
    const forte = conta(pais("br"));
    expect(fraco).toBeGreaterThan(0);
    expect(forte).toBeGreaterThan(fraco * 3);
  });
  it("a densidade para q alto é positiva em todos os países e maior nos de índice alto", () => {
    for (const p of paises) expect(densidadeEm(tabelaDensidade(p, t), 18)).toBeGreaterThan(0);
    expect(densidadeEm(tabelaDensidade(pais("fr"), t), 17)).toBeGreaterThan(densidadeEm(tabelaDensidade(pais("ga"), t), 17));
  });
  it("valida parâmetros incoerentes", () => {
    expect(() => criarParametros({ mundo: { talento: { epsIndice0: 0 } } })).toThrow(/cauda/);
  });
});

describe("nomes", () => {
  it("geram nomes de todas as famílias, determinísticos", () => {
    for (const f of familiasDeNomes()) {
      const a = gerarNome(new Rng("n"), f);
      expect(a).toEqual(gerarNome(new Rng("n"), f));
      expect(a.completo.length).toBeGreaterThan(3);
      expect(a.desportivo.split(" ").length).toBeGreaterThanOrEqual(2);
    }
  });
  it("nomes portugueses têm 1-2 próprios e 1-2 apelidos; espanhóis 2 apelidos", () => {
    const rng = new Rng("pt");
    for (let i = 0; i < 200; i++) {
      const n = gerarNome(rng, "portugal");
      expect(n.proprios.length).toBeGreaterThanOrEqual(1);
      expect(n.apelidos.length).toBeLessThanOrEqual(2);
      expect(gerarNome(rng, "espanha").apelidos).toHaveLength(2);
    }
  });
  it("nunca gera nomes da lista de bloqueio (mesmo quando a combinação é provável)", () => {
    const rng = new Rng("bloq");
    for (let i = 0; i < 20000; i++) {
      const n = gerarNome(rng, i % 2 ? "portugal" : "espanha");
      expect(estaBloqueado(n.desportivo)).toBe(false);
      expect(estaBloqueado(n.completo)).toBe(false);
    }
    expect(estaBloqueado("Rúben Dias")).toBe(true);
    expect(estaBloqueado("sergio  RAMOS")).toBe(true);
  });
  it("sem bloqueio, as combinações famosas aparecem (prova de que o filtro trabalha)", () => {
    const rng = new Rng("bloq");
    let achou = false;
    for (let i = 0; i < 40000 && !achou; i++) achou = estaBloqueado(gerarNome(rng, "portugal", new Set()).desportivo);
    expect(achou).toBe(true);
  });
});
