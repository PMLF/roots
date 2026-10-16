import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parametros";
import { evaluateStatus, statusBand, coherentStatus, initialStatus } from "./estatuto";

describe("estatuto das localidades", () => {
  it("arranca pelos limiares", () => {
    expect(initialStatus(150, P)).toBe("aldeia");
    expect(initialStatus(1499, P)).toBe("aldeia");
    expect(initialStatus(1500, P)).toBe("vila");
    expect(initialStatus(7999, P)).toBe("vila");
    expect(initialStatus(8000, P)).toBe("city");
  });
  it("só sobe depois de passar a margem e só desce depois de cair abaixo dela", () => {
    expect(evaluateStatus(1600, "aldeia", P)).toBe("aldeia"); // 1500 < 1600 < 1650
    expect(evaluateStatus(1650, "aldeia", P)).toBe("vila");
    expect(evaluateStatus(1400, "vila", P)).toBe("vila"); // 1350 < 1400
    expect(evaluateStatus(1349, "vila", P)).toBe("aldeia");
    expect(evaluateStatus(8700, "vila", P)).toBe("vila");
    expect(evaluateStatus(8800, "vila", P)).toBe("city");
    expect(evaluateStatus(7300, "city", P)).toBe("city");
    expect(evaluateStatus(7199, "city", P)).toBe("vila");
  });
  it("não oscila: a mesma população dá o mesmo estatuto vindo de cima ou de baixo só na zona de margem", () => {
    expect(evaluateStatus(8000, "vila", P)).toBe("vila");
    expect(evaluateStatus(8000, "city", P)).toBe("city");
  });
  it("salta vários degraus se a população o justificar", () => {
    expect(evaluateStatus(50_000, "aldeia", P)).toBe("city");
    expect(evaluateStatus(100, "city", P)).toBe("aldeia");
  });
  it("a banda de cada estatuto contém o estatuto de arranque de qualquer população", () => {
    for (const pop of [1, 150, 1499, 1500, 3000, 7999, 8000, 20_000, 400_000])
      expect(coherentStatus(pop, initialStatus(pop, P), P)).toBe(true);
    expect(statusBand("vila", P)).toEqual({ min: 1350, max: 8800 });
    expect(coherentStatus(20_000, "aldeia", P)).toBe(false);
  });
});
