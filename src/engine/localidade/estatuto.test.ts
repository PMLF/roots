import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { avaliarEstatuto, bandaDoEstatuto, estatutoCoerente, estatutoInicial } from "./estatuto";

describe("estatuto das localidades", () => {
  it("arranca pelos limiares", () => {
    expect(estatutoInicial(150, P)).toBe("aldeia");
    expect(estatutoInicial(1499, P)).toBe("aldeia");
    expect(estatutoInicial(1500, P)).toBe("vila");
    expect(estatutoInicial(7999, P)).toBe("vila");
    expect(estatutoInicial(8000, P)).toBe("cidade");
  });
  it("só sobe depois de passar a margem e só desce depois de cair abaixo dela", () => {
    expect(avaliarEstatuto(1600, "aldeia", P)).toBe("aldeia"); // 1500 < 1600 < 1650
    expect(avaliarEstatuto(1650, "aldeia", P)).toBe("vila");
    expect(avaliarEstatuto(1400, "vila", P)).toBe("vila"); // 1350 < 1400
    expect(avaliarEstatuto(1349, "vila", P)).toBe("aldeia");
    expect(avaliarEstatuto(8700, "vila", P)).toBe("vila");
    expect(avaliarEstatuto(8800, "vila", P)).toBe("cidade");
    expect(avaliarEstatuto(7300, "cidade", P)).toBe("cidade");
    expect(avaliarEstatuto(7199, "cidade", P)).toBe("vila");
  });
  it("não oscila: a mesma população dá o mesmo estatuto vindo de cima ou de baixo só na zona de margem", () => {
    expect(avaliarEstatuto(8000, "vila", P)).toBe("vila");
    expect(avaliarEstatuto(8000, "cidade", P)).toBe("cidade");
  });
  it("salta vários degraus se a população o justificar", () => {
    expect(avaliarEstatuto(50_000, "aldeia", P)).toBe("cidade");
    expect(avaliarEstatuto(100, "cidade", P)).toBe("aldeia");
  });
  it("a banda de cada estatuto contém o estatuto de arranque de qualquer população", () => {
    for (const pop of [1, 150, 1499, 1500, 3000, 7999, 8000, 20_000, 400_000])
      expect(estatutoCoerente(pop, estatutoInicial(pop, P), P)).toBe(true);
    expect(bandaDoEstatuto("vila", P)).toEqual({ min: 1350, max: 8800 });
    expect(estatutoCoerente(20_000, "aldeia", P)).toBe(false);
  });
});
