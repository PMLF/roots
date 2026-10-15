import { describe, expect, it } from "vitest";
import { mostrarEstimativa, mostrarExato } from "./valor";

describe("valores conhecidos e estimados", () => {
  it("exato", () => expect(mostrarExato(14)).toEqual({ estado: "exato", texto: "14" }));
  it("estimativa com intervalo", () => {
    expect(mostrarEstimativa({ valor: 15, margem: 1.4, intervalo: [13.6, 16.4] })).toEqual({ estado: "estimado", texto: "≈ 14-16" });
  });
  it("intervalo estreito vira um só número", () => {
    expect(mostrarEstimativa({ valor: 12, margem: 0.2, intervalo: [11.8, 12.2] }).texto).toBe("≈ 12");
  });
  it("desatualizado guarda as épocas", () => {
    expect(mostrarEstimativa({ valor: 15, margem: 2, intervalo: [13, 17] }, { desatualizado: true, epocasDesde: 3 })).toEqual({ estado: "desatualizado", texto: "≈ 13-17", epocasDesde: 3 });
  });
});
