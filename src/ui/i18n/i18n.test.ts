import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { LOCALES, catalogo, traduzir } from "./index";

describe("i18n", () => {
  it("pt-PT e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(catalogo("en")).sort()).toEqual(Object.keys(catalogo("pt-PT")).sort());
  });
  it("todas as mensagens são ICU válidas", () => {
    for (const l of LOCALES) for (const [k, v] of Object.entries(catalogo(l))) {
      expect(() => new IntlMessageFormat(v, l), `${l}:${k}`).not.toThrow();
    }
  });
  it("formata plurais e números por idioma", () => {
    expect(traduzir("pt-PT", "inicio.autosave", { dias: 1 })).toBe("Autosave todos os dias");
    expect(traduzir("pt-PT", "inicio.autosave", { dias: 7 })).toBe("Autosave a cada 7 dias");
    expect(traduzir("en", "inicio.autosave", { dias: 7 })).toBe("Autosave every 7 days");
    expect(traduzir("en", "inicio.motorLigado", { versao: "0.1.0", esquema: 1, ms: 12 })).toContain("12 ms");
  });
});
