import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../config/parameters";
import { readCsv } from "./csv";
import { importData, slug } from "./importData";
import type { BaseData, SourcesCsv } from "./types";

const read = (f: string) => readFileSync(new URL(`../../../data/${f}.csv`, import.meta.url), "utf-8");
const REAL: SourcesCsv = { clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts") };

function importOk(sources: SourcesCsv = REAL): BaseData {
  const r = importData(sources);
  if (!r.ok) throw new Error(r.errors.slice(0, 10).join("\n"));
  return r.data;
}
function errors(sources: SourcesCsv): string[] {
  const r = importData(sources);
  if (r.ok) throw new Error("devia falhar");
  return r.errors;
}

describe("readCsv", () => {
  it("trata BOM, aspas, vírgulas e aspas escapadas", () => {
    expect(readCsv('﻿a,b\n"x, y","diz ""olá"""\r\n')).toEqual([["a", "b"], ["x, y", 'diz "olá"']]);
  });
  it("aceita quebras de linha dentro de aspas e ausência de newline final", () => {
    expect(readCsv('a,b\n"1\n2",3')).toEqual([["a", "b"], ["1\n2", "3"]]);
  });
});

describe("slug", () => {
  it("remove acentos e símbolos", () => {
    expect(slug("Vila Nova de Gaia")).toBe("vila-nova-de-gaia");
    expect(slug("Grémio Ferroviário do Entroncamento")).toBe("gremio-ferroviario-do-entroncamento");
  });
});

describe("importarDados com os CSV reais", () => {
  const d = importOk();

  it("tem os totais esperados", () => {
    expect(d.clubs).toHaveLength(300);
    expect(d.cities).toHaveLength(276);
    expect(d.districts).toHaveLength(20);
    expect(d.rivalries).toHaveLength(211);
  });

  it("respeita a pirâmide: 20/20/20 + 4×10 CP + 20×10 distritais", () => {
    const n = (e: string) => d.clubs.filter((c) => c.tier === e).length;
    expect([n("firstLeague"), n("secondLeague"), n("thirdLeague"), n("cp"), n("district")]).toEqual([20, 20, 20, 40, 200]);
    for (const s of ["A", "B", "C", "D"]) expect(d.clubs.filter((c) => c.league === `CP Série ${s}`)).toHaveLength(10);
  });

  it("liga cada clube ao seu concelho e vice-versa", () => {
    const cities = new Map(d.cities.map((c) => [c.id, c]));
    for (const c of d.clubs) expect(cities.get(c.city)?.clubs).toContain(c.id);
    expect(d.cities.reduce((s, c) => s + c.clubs.length, 0)).toBe(300);
  });

  it("converte os traços do autarca de 1-10 para 1-20 e guarda apoioDesporto à parte", () => {
    const c = d.cities.find((x) => x.name === "Albergaria-a-Velha")!;
    expect(c.mayor.traits).toEqual({ ambition: 18, vanity: 4, patience: 14, integrity: 18 });
    expect(c.mayor.sportSupport).toBe(10);
    expect(c.island).toBe(false);
  });

  it("lê campos com vírgulas entre aspas e as estatísticas do estádio", () => {
    const g = d.clubs.find((c) => c.id === "gremio-ferroviario-do-entroncamento")!;
    expect(g.colours).toBe("Azul, branco e preto");
    const e = d.clubs.find((c) => c.id === "sc-cascais")!.stadium;
    expect(e).toMatchObject({ ownership: "municipal", capacity: 55000 });
    expect(e.location).toMatchObject({ zone: "near", centreDistanceKm: 1, parkingPlaces: 4340 });
  });

  it("resolve o rival para um id existente e distinto", () => {
    const ids = new Set(d.clubs.map((c) => c.id));
    for (const c of d.clubs) {
      expect(ids.has(c.rival)).toBe(true);
      expect(c.rival).not.toBe(c.id);
    }
  });

  it("é determinístico", () => {
    expect(importOk()).toEqual(d);
  });
});

describe("importarDados rejeita dados maus (acumula todos os erros)", () => {
  const swap = (pitch: keyof SourcesCsv, de: string, para: string): SourcesCsv => {
    expect(REAL[pitch]).toContain(de);
    return { ...REAL, [pitch]: REAL[pitch].replace(de, para) };
  };
  const lines = (pitch: keyof SourcesCsv) => REAL[pitch].split(/\r?\n/);

  it("colunas em falta", () => {
    const f = { ...REAL, districts: REAL.districts.replace("cp_series", "series") };
    expect(errors(f).join("\n")).toMatch(/districts\.csv: colunas em falta: cp_series/);
  });

  it("rival inexistente", () => {
    const [h = "", p = "", ...rest] = lines("clubs");
    const col = h.replace("﻿", "").split(",").indexOf("rival");
    const fields = p.split(",");
    fields[col] = "Clube Que Nao Existe";
    expect(errors({ ...REAL, clubs: [h, fields.join(","), ...rest].join("\n") }).join("\n")).toMatch(/rival inexistente/);
  });

  it("nome de clube duplicado", () => {
    const [h = "", a = "", , ...rest] = lines("clubs");
    expect(errors({ ...REAL, clubs: [h, a, a, ...rest].join("\n") }).join("\n")).toMatch(/duplicado/);
  });

  it("série do CP com número errado de clubes", () => {
    const f = swap("clubs", ",Campeonato de Portugal,CP Série A,", ",Campeonato de Portugal,CP Série B,");
    const e = errors(f).join("\n");
    expect(e).toMatch(/CP Série [AB] tem/);
  });

  it("valores fora de intervalo", () => {
    const [h = "", p = "", ...rest] = lines("clubs");
    const col = h.replace("﻿", "").split(",").indexOf("stadium_transport");
    const fields = p.split(",");
    fields[col] = "150";
    expect(errors({ ...REAL, clubs: [h, fields.join(","), ...rest].join("\n") }).join("\n")).toMatch(/stadium_transport/);
  });

  it("rivalidade incoerente com os clubes", () => {
    const [h = "", p = "", ...rest] = lines("rivalries");
    const fields = p.split(",");
    fields[3] = fields[3] === "yes" ? "no" : "yes"; // same_municipality
    expect(errors({ ...REAL, rivalries: [h, fields.join(","), ...rest].join("\n") }).join("\n")).toMatch(/sameMunicipality/);
  });

  it("clube que não consta na lista do seu concelho", () => {
    const [h = "", p = "", ...rest] = lines("cities");
    const fields = p.split(",");
    fields[fields.length - 1] = "";
    expect(errors({ ...REAL, cities: [h, fields.join(","), ...rest].join("\n") }).join("\n")).toMatch(/não consta na lista de clubes/);
  });

  it("os totais seguem os parâmetros (não estão fixos no código)", () => {
    const r = importData(REAL, { ...DEFAULT_PARAMETERS, districtLeagues: { target: 12, min: 8, max: 14, hardMin: 8 } });
    expect(r.ok).toBe(false);
  });
});

describe("localidades (RZ-136)", () => {
  it("cada clube tem a sua localidade, dentro do mesmo concelho", () => {
    const d = importOk();
    expect(d.localities.length).toBe(298);
    const porId = new Map(d.localities.map((l) => [l.id, l]));
    for (const c of d.clubs) {
      const l = porId.get(c.localityId)!;
      expect(l.city).toBe(c.city);
      expect(l.clubs).toContain(c.id);
    }
    const matela = porId.get("matela@vimioso")!;
    expect(matela).toMatchObject({ name: "Matela", status: "village", host: false, district: "Bragança" });
    expect(porId.get("moita-dos-ferreiros@lourinha")).toMatchObject({ status: "village" });
  });
  it("recusa um estatuto incoerente com a população", () => {
    const lines = REAL.localities.split("\n");
    const i = lines.findIndex((l) => l.includes("matela@vimioso"));
    lines[i] = lines[i]!.replace(",150,village,", ",50000,village,");
    expect(errors({ ...REAL, localities: lines.join("\n") }).join("\n")).toMatch(/não é coerente com o estatuto/);
  });
  it("recusa um clube cuja localidade não existe", () => {
    const without = REAL.localities.split("\n").filter((l) => !l.includes("matela@vimioso")).join("\n");
    expect(errors({ ...REAL, localities: without }).join("\n")).toMatch(/não existe em localities\.csv/);
  });
  it("recusa uma localidade maior do que o concelho", () => {
    const lines = REAL.localities.split("\n");
    const i = lines.findIndex((l) => l.includes("matela@vimioso"));
    lines[i] = lines[i]!.replace(",150,village,", ",900000,city,");
    expect(errors({ ...REAL, localities: lines.join("\n") }).join("\n")).toMatch(/maior do que o concelho/);
  });
});
