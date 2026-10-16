import { describe, expect, it } from "vitest";
import { TABS, profileHref, readProfile } from "./ligacoes";

describe("ligações", () => {
  it("constrói e lê a mesma ligação", () => {
    const href = profileHref("person", "p000012");
    expect(href).toBe("/profile/?type=person&id=p000012");
    expect(readProfile(new URL(href, "http://x").searchParams)).toEqual({ k: "person", id: "p000012" });
  });
  it("codifica ids com caracteres especiais e recusa tipos desconhecidos", () => {
    expect(readProfile(new URL(profileHref("club", "a b&c"), "http://x").searchParams)).toEqual({ k: "club", id: "a b&c" });
    expect(readProfile(new URLSearchParams("type=banana&id=1"))).toBeNull();
    expect(readProfile(new URLSearchParams("type=club"))).toBeNull();
  });
  it("todas as fichas começam pelo resumo e acabam na história", () => {
    for (const s of Object.values(TABS)) {
      expect(s[0]).toBe("summary");
      expect(s.at(-1)).toBe("story");
    }
  });
});
