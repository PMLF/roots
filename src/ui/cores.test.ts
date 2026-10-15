import { describe, expect, it } from "vitest";
import { corCss, fundoCores, lerCores } from "./cores";

describe("cores do clube", () => {
  it("uma cor é lisa", () => {
    expect(lerCores("Verde")).toMatchObject({ padrao: "lisa", segmentos: [{ cor: corCss("verde") }] });
  });
  it("duas cores dividem ao meio; três em terços", () => {
    expect(lerCores("Amarelo e preto").segmentos.map((s) => s.peso)).toEqual([50, 50]);
    expect(lerCores("Azul, branco e preto").segmentos.map((s) => Math.round(s.peso))).toEqual([33, 33, 33]);
  });
  it("riscas verticais e horizontais", () => {
    expect(lerCores("Azul e branco riscas").padrao).toBe("riscas-verticais");
    expect(lerCores("Vermelho e branco horizontal")).toMatchObject({ padrao: "riscas-horizontais", segmentos: [{}, {}] });
  });
  it("maioria por percentagem", () => {
    const c = lerCores("Azul 80% e branco");
    expect(c.segmentos.map((s) => s.peso)).toEqual([80, 20]);
    expect(fundoCores(c)).toContain("80%");
  });
  it("nomes compostos e desconhecidos", () => {
    expect(corCss("Azul-marinho")).not.toBe(corCss("Azul"));
    expect(corCss("Grená")).toBe("#7a1230");
    expect(corCss("xyz")).toBe("#9aa0a6");
  });
});
