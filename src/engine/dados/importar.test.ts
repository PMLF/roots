import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "../config/parametros";
import { lerCsv } from "./csv";
import { importarDados, slug } from "./importar";
import type { DadosBase, FontesCsv } from "./tipos";

const ler = (f: string) => readFileSync(new URL(`../../../data/${f}.csv`, import.meta.url), "utf-8");
const REAIS: FontesCsv = { clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos") };

function importarOk(fontes: FontesCsv = REAIS): DadosBase {
  const r = importarDados(fontes);
  if (!r.ok) throw new Error(r.erros.slice(0, 10).join("\n"));
  return r.dados;
}
function erros(fontes: FontesCsv): string[] {
  const r = importarDados(fontes);
  if (r.ok) throw new Error("devia falhar");
  return r.erros;
}

describe("lerCsv", () => {
  it("trata BOM, aspas, vírgulas e aspas escapadas", () => {
    expect(lerCsv('﻿a,b\n"x, y","diz ""olá"""\r\n')).toEqual([["a", "b"], ["x, y", 'diz "olá"']]);
  });
  it("aceita quebras de linha dentro de aspas e ausência de newline final", () => {
    expect(lerCsv('a,b\n"1\n2",3')).toEqual([["a", "b"], ["1\n2", "3"]]);
  });
});

describe("slug", () => {
  it("remove acentos e símbolos", () => {
    expect(slug("Vila Nova de Gaia")).toBe("vila-nova-de-gaia");
    expect(slug("Grémio Ferroviário do Entroncamento")).toBe("gremio-ferroviario-do-entroncamento");
  });
});

describe("importarDados com os CSV reais", () => {
  const d = importarOk();

  it("tem os totais esperados", () => {
    expect(d.clubes).toHaveLength(298);
    expect(d.cidades).toHaveLength(275);
    expect(d.distritos).toHaveLength(20);
    expect(d.rivalidades).toHaveLength(208);
  });

  it("respeita a pirâmide: 20/18/20 + 4×10 CP + 20×10 distritais", () => {
    const n = (e: string) => d.clubes.filter((c) => c.escalao === e).length;
    expect([n("primeiraLiga"), n("segundaLiga"), n("terceiraLiga"), n("cp"), n("distrital")]).toEqual([20, 18, 20, 40, 200]);
    for (const s of ["A", "B", "C", "D"]) expect(d.clubes.filter((c) => c.liga === `CP Série ${s}`)).toHaveLength(10);
  });

  it("liga cada clube ao seu concelho e vice-versa", () => {
    const cidades = new Map(d.cidades.map((c) => [c.id, c]));
    for (const c of d.clubes) expect(cidades.get(c.cidade)?.clubes).toContain(c.id);
    expect(d.cidades.reduce((s, c) => s + c.clubes.length, 0)).toBe(298);
  });

  it("converte os traços do autarca de 1-10 para 1-20 e guarda apoioDesporto à parte", () => {
    const c = d.cidades.find((x) => x.nome === "Albergaria-a-Velha")!;
    expect(c.autarca.tracos).toEqual({ ambicao: 18, vaidade: 4, paciencia: 14, integridade: 18 });
    expect(c.autarca.apoioDesporto).toBe(10);
    expect(c.ilha).toBe(false);
  });

  it("lê campos com vírgulas entre aspas e as estatísticas do estádio", () => {
    const g = d.clubes.find((c) => c.id === "gremio-ferroviario-do-entroncamento")!;
    expect(g.cores).toBe("Azul, branco e preto");
    const e = d.clubes.find((c) => c.id === "sc-cascais")!.estadio;
    expect(e).toMatchObject({ propriedade: "municipal", capacidade: 55000 });
    expect(e.localizacao).toMatchObject({ zona: "perto", distanciaCentroKm: 1, lugaresEstacionamento: 4340 });
  });

  it("resolve o rival para um id existente e distinto", () => {
    const ids = new Set(d.clubes.map((c) => c.id));
    for (const c of d.clubes) {
      expect(ids.has(c.rival)).toBe(true);
      expect(c.rival).not.toBe(c.id);
    }
  });

  it("é determinístico", () => {
    expect(importarOk()).toEqual(d);
  });
});

describe("importarDados rejeita dados maus (acumula todos os erros)", () => {
  const trocar = (campo: keyof FontesCsv, de: string, para: string): FontesCsv => {
    expect(REAIS[campo]).toContain(de);
    return { ...REAIS, [campo]: REAIS[campo].replace(de, para) };
  };
  const linhas = (campo: keyof FontesCsv) => REAIS[campo].split(/\r?\n/);

  it("colunas em falta", () => {
    const f = { ...REAIS, distritos: REAIS.distritos.replace("serie_cp", "serie") };
    expect(erros(f).join("\n")).toMatch(/distritos\.csv: colunas em falta: serie_cp/);
  });

  it("rival inexistente", () => {
    const [h = "", p = "", ...resto] = linhas("clubes");
    const col = h.replace("﻿", "").split(",").indexOf("rival");
    const campos = p.split(",");
    campos[col] = "Clube Que Nao Existe";
    expect(erros({ ...REAIS, clubes: [h, campos.join(","), ...resto].join("\n") }).join("\n")).toMatch(/rival inexistente/);
  });

  it("nome de clube duplicado", () => {
    const [h = "", a = "", , ...resto] = linhas("clubes");
    expect(erros({ ...REAIS, clubes: [h, a, a, ...resto].join("\n") }).join("\n")).toMatch(/duplicado/);
  });

  it("série do CP com número errado de clubes", () => {
    const f = trocar("clubes", ",Campeonato de Portugal,CP Série A,", ",Campeonato de Portugal,CP Série B,");
    const e = erros(f).join("\n");
    expect(e).toMatch(/CP Série [AB] tem/);
  });

  it("valores fora de intervalo", () => {
    const [h = "", p = "", ...resto] = linhas("clubes");
    const col = h.replace("﻿", "").split(",").indexOf("est_transportes");
    const campos = p.split(",");
    campos[col] = "150";
    expect(erros({ ...REAIS, clubes: [h, campos.join(","), ...resto].join("\n") }).join("\n")).toMatch(/est_transportes/);
  });

  it("rivalidade incoerente com os clubes", () => {
    const [h = "", p = "", ...resto] = linhas("rivalidades");
    const campos = p.split(",");
    campos[3] = campos[3] === "sim" ? "não" : "sim"; // mesmo_concelho
    expect(erros({ ...REAIS, rivalidades: [h, campos.join(","), ...resto].join("\n") }).join("\n")).toMatch(/mesmoConcelho/);
  });

  it("clube que não consta na lista do seu concelho", () => {
    const [h = "", p = "", ...resto] = linhas("cidades");
    const campos = p.split(",");
    campos[campos.length - 1] = "";
    expect(erros({ ...REAIS, cidades: [h, campos.join(","), ...resto].join("\n") }).join("\n")).toMatch(/não consta na lista de clubes/);
  });

  it("os totais seguem os parâmetros (não estão fixos no código)", () => {
    const r = importarDados(REAIS, { ...PARAMETROS_PADRAO, distritais: { alvo: 12, min: 8, max: 14, minimoDuro: 8 } });
    expect(r.ok).toBe(false);
  });
});

describe("localidades (RZ-136)", () => {
  it("cada clube tem a sua localidade, dentro do mesmo concelho", () => {
    const d = importarOk();
    expect(d.localidades.length).toBe(297);
    const porId = new Map(d.localidades.map((l) => [l.id, l]));
    for (const c of d.clubes) {
      const l = porId.get(c.localidadeId)!;
      expect(l.cidade).toBe(c.cidade);
      expect(l.clubes).toContain(c.id);
    }
    const matela = porId.get("matela@vimioso")!;
    expect(matela).toMatchObject({ nome: "Matela", estatuto: "aldeia", sede: false, distrito: "Bragança" });
    expect(porId.get("moita-dos-ferreiros@lourinha")).toMatchObject({ estatuto: "aldeia" });
  });
  it("recusa um estatuto incoerente com a população", () => {
    const linhas = REAIS.localidades.split("\n");
    const i = linhas.findIndex((l) => l.includes("matela@vimioso"));
    linhas[i] = linhas[i]!.replace(",150,aldeia,", ",50000,aldeia,");
    expect(erros({ ...REAIS, localidades: linhas.join("\n") }).join("\n")).toMatch(/não é coerente com o estatuto/);
  });
  it("recusa um clube cuja localidade não existe", () => {
    const sem = REAIS.localidades.split("\n").filter((l) => !l.includes("matela@vimioso")).join("\n");
    expect(erros({ ...REAIS, localidades: sem }).join("\n")).toMatch(/não existe em localidades\.csv/);
  });
  it("recusa uma localidade maior do que o concelho", () => {
    const linhas = REAIS.localidades.split("\n");
    const i = linhas.findIndex((l) => l.includes("matela@vimioso"));
    linhas[i] = linhas[i]!.replace(",150,aldeia,", ",900000,cidade,");
    expect(erros({ ...REAIS, localidades: linhas.join("\n") }).join("\n")).toMatch(/maior do que o concelho/);
  });
});
