import { describe, expect, it } from "vitest";
import { indexar, normalizarBusca, pesquisar } from "./pesquisar";

const indice = indexar([
  { k: "clube", id: "ua-almada", titulo: "UA Almada", subtitulo: "Primeira Liga" },
  { k: "cidade", id: "almada", titulo: "Almada", subtitulo: "Setúbal" },
  { k: "pessoa", id: "p1", titulo: "João Silva", subtitulo: "MC · UA Almada", extra: "João Pedro Silva Santos" },
  { k: "pessoa", id: "p2", titulo: "Joaquim Álvaro", subtitulo: "PL" },
  { k: "clube", id: "sc-cascais", titulo: "SC Cascais", subtitulo: "Primeira Liga" },
]);

describe("pesquisa global", () => {
  it("ignora acentos e maiúsculas", () => {
    expect(normalizarBusca("  JOÃO  Álvaro ")).toBe("joao alvaro");
    expect(pesquisar("alvaro", indice).map((r) => r.id)).toEqual(["p2"]);
  });
  it("exige 2 letras no mínimo", () => {
    expect(pesquisar("a", indice)).toEqual([]);
  });
  it("título exato primeiro, depois prefixo; clube antes de cidade antes de pessoa em empate", () => {
    expect(pesquisar("almada", indice).map((r) => r.id)).toEqual(["almada", "ua-almada"]);
    expect(pesquisar("jo", indice).map((r) => r.id)).toEqual(["p1", "p2"]);
  });
  it("encontra pelo nome completo (extra) quando o título não chega", () => {
    expect(pesquisar("pedro santos", indice).map((r) => r.id)).toEqual(["p1"]);
  });
  it("respeita o limite", () => {
    expect(pesquisar("ca", indice, 1)).toHaveLength(1);
  });
});
