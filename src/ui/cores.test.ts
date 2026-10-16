import { describe, expect, it } from "vitest";
import { cssColour, backgroundColours, readColours } from "./cores";

describe("cores do clube", () => {
  it("uma cor é lisa", () => {
    expect(readColours("Verde")).toMatchObject({ fallback: "lisa", segments: [{ colour: cssColour("green") }] });
  });
  it("duas cores dividem ao meio; três em terços", () => {
    expect(readColours("Amarelo e preto").segments.map((s) => s.weight)).toEqual([50, 50]);
    expect(readColours("Azul, branco e preto").segments.map((s) => Math.round(s.weight))).toEqual([33, 33, 33]);
  });
  it("riscas verticais e horizontais", () => {
    expect(readColours("Azul e branco riscas").fallback).toBe("riscas-verticais");
    expect(readColours("Vermelho e branco horizontal")).toMatchObject({ fallback: "riscas-horizontais", segments: [{}, {}] });
  });
  it("maioria por percentagem", () => {
    const c = readColours("Azul 80% e branco");
    expect(c.segments.map((s) => s.weight)).toEqual([80, 20]);
    expect(backgroundColours(c)).toContain("80%");
  });
  it("nomes compostos e desconhecidos", () => {
    expect(cssColour("Azul-marinho")).not.toBe(cssColour("Azul"));
    expect(cssColour("Grená")).toBe("#7a1230");
    expect(cssColour("xyz")).toBe("#9aa0a6");
  });
});
