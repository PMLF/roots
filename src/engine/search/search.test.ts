import { describe, expect, it } from "vitest";
import { buildIndex, normaliseSearch, find } from "./search";

const index = buildIndex([
  { k: "club", id: "ua-almada", title: "UA Almada", subtitle: "Primeira Liga" },
  { k: "city", id: "almada", title: "Almada", subtitle: "Setúbal" },
  { k: "person", id: "p1", title: "João Silva", subtitle: "MC · UA Almada", extra: "João Pedro Silva Santos" },
  { k: "person", id: "p2", title: "Joaquim Álvaro", subtitle: "PL" },
  { k: "club", id: "sc-cascais", title: "SC Cascais", subtitle: "Primeira Liga" },
]);

describe("pesquisa global", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(normaliseSearch("  JOÃO  Álvaro ")).toBe("joao alvaro");
    expect(find("alvaro", index).map((r) => r.id)).toEqual(["p2"]);
  });
  it("exige 2 letras no mínimo", () => {
    expect(find("a", index)).toEqual([]);
  });
  it("título exato primeiro, depois prefixo; clube antes de cidade antes de pessoa em empate", () => {
    expect(find("almada", index).map((r) => r.id)).toEqual(["almada", "ua-almada"]);
    expect(find("jo", index).map((r) => r.id)).toEqual(["p1", "p2"]);
  });
  it("encontra pelo nome completo (extra) quando o título não chega", () => {
    expect(find("pedro santos", index).map((r) => r.id)).toEqual(["p1"]);
  });
  it("respeita o limite", () => {
    expect(find("ca", index, 1)).toHaveLength(1);
  });
});
