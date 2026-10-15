import { describe, expect, it } from "vitest";
import { SEPARADORES, hrefFicha, lerFicha } from "./ligacoes";

describe("ligações", () => {
  it("constrói e lê a mesma ligação", () => {
    const href = hrefFicha("pessoa", "p000012");
    expect(href).toBe("/ficha/?k=pessoa&id=p000012");
    expect(lerFicha(new URL(href, "http://x").searchParams)).toEqual({ k: "pessoa", id: "p000012" });
  });
  it("codifica ids com caracteres especiais e recusa tipos desconhecidos", () => {
    expect(lerFicha(new URL(hrefFicha("clube", "a b&c"), "http://x").searchParams)).toEqual({ k: "clube", id: "a b&c" });
    expect(lerFicha(new URLSearchParams("k=banana&id=1"))).toBeNull();
    expect(lerFicha(new URLSearchParams("k=clube"))).toBeNull();
  });
  it("todas as fichas começam pelo resumo e acabam na história", () => {
    for (const s of Object.values(SEPARADORES)) {
      expect(s[0]).toBe("resumo");
      expect(s.at(-1)).toBe("historia");
    }
  });
});
