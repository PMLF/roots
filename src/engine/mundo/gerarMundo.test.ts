import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { importarDados } from "../dados/importar";
import type { DadosBase } from "../dados/tipos";
import { distribuirPosicoes, gerarMundo } from "./gerarMundo";
import { importarPaises, type Pais } from "./paises";
import { qualidadeAtual } from "./jogador";
import { validarMundo } from "./validar";

const ler = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importarDados({ clubes: ler("clubes.csv"), cidades: ler("cidades.csv"), localidades: ler("localidades.csv"), rivalidades: ler("rivalidades.csv"), distritos: ler("distritos.csv") });
if (!d.ok) throw new Error(d.erros.join("\n"));
const dados: DadosBase = d.dados;
const pr = importarPaises(ler("paises.csv"));
if (!pr.ok) throw new Error(pr.erros.join("\n"));
const paises: Pais[] = pr.paises;

const mundo = (seed: string, p = P) => gerarMundo({ seed, dados, paises, params: p });

describe("distribuir posições", () => {
  it.each([20, 23, 25, 26, 28])("plantel de %i: soma certa, 2+ GR, todas as posições", (n) => {
    const xs = distribuirPosicoes(n, P.mundo.lugaresPorPosicao);
    expect(xs).toHaveLength(n);
    expect(xs.filter((x) => x === "GK").length).toBeGreaterThanOrEqual(2);
    expect(new Set(xs).size).toBe(10);
  });
});

describe("gerarMundo (300 clubes)", () => {
  const t0 = Date.now();
  const lote = mundo("teste-1");
  const ms = Date.now() - t0;
  const v = validarMundo(lote, dados, paises, P);

  it("é válido e tem a escala prevista", () => {
    expect(v.erros).toEqual([]);
    expect(v.resumo.pessoas).toBeGreaterThan(12000);
    expect(v.resumo.pessoas).toBeLessThan(25000);
    expect(ms).toBeLessThan(15000);
  });
  it("qualidade desce com o escalão e o mix de estrangeiros bate certo", () => {
    const e = v.resumo.porEscalao;
    const q = (k: string) => e[k]!.qualidadeMedia;
    expect(q("primeiraLiga")).toBeGreaterThan(q("segundaLiga"));
    expect(q("segundaLiga")).toBeGreaterThan(q("terceiraLiga"));
    expect(q("terceiraLiga")).toBeGreaterThan(q("cp"));
    expect(q("cp")).toBeGreaterThan(q("distrital"));
    for (const [esc, alvo] of Object.entries(P.estrangeiros)) expect(Math.abs(e[esc]!.estrangeiros - alvo)).toBeLessThan(0.06);
    expect(v.avisos).toEqual([]);
  });
  it("a qualidade medida nos atributos-chave segue a qualidade-alvo", () => {
    const js = lote.jogadores.filter((j) => j.clube);
    const media = js.reduce((s, j) => s + qualidadeAtual(j.atributos, j.posicoes[0]!.pos), 0) / js.length;
    expect(media).toBeGreaterThan(7);
    expect(media).toBeLessThan(12);
  });
  it("o potencial nunca fica abaixo da qualidade atual, e os jovens têm margem", () => {
    const novos = lote.jogadores.filter((j) => j.clube).slice(0, 4000);
    let comMargem = 0;
    for (const j of novos) {
      const q = qualidadeAtual(j.atributos, j.posicoes[0]!.pos);
      expect(j.potencial).toBeGreaterThanOrEqual(Math.round(q * 10) / 10 - 0.05);
      if (j.potencial > q + 1) comMargem++;
    }
    expect(comMargem).toBeGreaterThan(100);
  });
  it("os autarcas trazem os traços do CSV (×2)", () => {
    const cd = dados.cidades[0]!;
    const cargo = lote.cargos.find((c) => c.funcao === "autarca" && c.cidade === cd.id)!;
    const pessoa = lote.pessoas.find((p) => p.id === cargo.pessoa)!;
    expect(pessoa.personalidade.ambicao).toBe(cd.autarca.tracos.ambicao);
    expect(pessoa.personalidade.integridade).toBe(cd.autarca.tracos.integridade);
  });
  it("todos os clubes têm presidente e treinador", () => {
    for (const cl of dados.clubes.slice(0, 40)) {
      const fs = lote.cargos.filter((c) => c.clube === cl.id).map((c) => c.funcao);
      expect(fs).toContain("presidente");
      expect(fs).toContain("treinador");
    }
  });
  it("jogadores naturais da cidade do clube são mais leais (+3)", () => {
    const naturalDe = new Map(lote.pessoas.map((p) => [p.id, p] as const));
    const cidadeDe = new Map(dados.clubes.map((c) => [c.id, c.cidade] as const));
    const a: number[] = [];
    const b: number[] = [];
    for (const j of lote.jogadores) {
      if (!j.clube) continue;
      const p = naturalDe.get(j.pessoa)!;
      (p.naturalDe === cidadeDe.get(j.clube) ? a : b).push(p.personalidade.lealdade);
    }
    const m = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(m(a)).toBeGreaterThan(m(b) + 1.5);
  });
});

describe("determinismo e independência", () => {
  it("mesma seed → mesmo mundo; seed diferente → pessoas diferentes", () => {
    const a = mundo("s1");
    expect(a).toEqual(mundo("s1"));
    const b = mundo("s2");
    expect(b.pessoas.map((p) => p.nome)).not.toEqual(a.pessoas.map((p) => p.nome));
    expect(b.pessoas.length).toBe(a.pessoas.length);
  });
  it("acrescentar um clube não muda os plantéis dos clubes de outros escalões", () => {
    const base = mundo("s3");
    const retirado = dados.clubes.find((c) => c.escalao === "distrital")!;
    const menos = gerarMundo({ seed: "s3", dados: { ...dados, clubes: dados.clubes.filter((c) => c.id !== retirado.id) }, paises, params: P });
    const alvo = dados.clubes.find((c) => c.escalao === "segundaLiga")!.id;
    const nomes = (l: typeof base) => l.jogadores.filter((j) => j.clube === alvo).map((j) => l.pessoas.find((p) => p.id === j.pessoa)!.nome);
    expect(nomes(menos)).toEqual(nomes(base));
  });

});
