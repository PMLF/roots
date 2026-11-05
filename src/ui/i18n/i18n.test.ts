import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { LOCALES, catalogue, translate } from "./index";

describe("i18n", () => {
  it("pt-PT e en têm exatamente as mesmas chaves", () => {
    expect(Object.keys(catalogue("en")).sort()).toEqual(Object.keys(catalogue("pt-PT")).sort());
  });
  it("todas as mensagens são ICU válidas", () => {
    for (const l of LOCALES) for (const [k, v] of Object.entries(catalogue(l))) {
      expect(() => new IntlMessageFormat(v, l), `${l}:${k}`).not.toThrow();
    }
  });
  it("formata plurais e números por idioma", () => {
    expect(translate("pt-PT", "start.autosave", { days: 1 })).toBe("Autosave todos os dias");
    expect(translate("pt-PT", "start.autosave", { days: 7 })).toBe("Autosave a cada 7 dias");
    expect(translate("en", "start.autosave", { days: 7 })).toBe("Autosave every 7 days");
    expect(translate("en", "start.engineConnected", { version: "0.1.0", schema: 1, ms: 12 })).toContain("12 ms");
  });
});
