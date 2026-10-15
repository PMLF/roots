import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "../config/parametros";
import type { SerieCP } from "../dados/tipos";
import { aplicarMovimentos, SERIES, type ClassificacoesFinais, type Contexto, type Piramide } from "./movimentos";

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
// 5 distritais por série (d-A1..d-A5, ...), com 10 clubes cada; distrito do clube = prefixo antes do "-c"
const distritos = SERIES.flatMap((s) => ids(`d${s}`, 5));
const serieDe = (d: string) => d[1] as SerieCP;

function mundo(): { atual: Piramide; ctx: Contexto } {
  const distritais: Record<string, string[]> = {};
  for (const d of distritos) distritais[d] = ids(`${d}-c`, 10);
  return {
    atual: {
      primeira: ids("p", 20), segunda: ids("s", 20), terceira: ids("t", 20),
      cp: Object.fromEntries(SERIES.map((s) => [s, ids(`cp${s}-`, 10)])) as Record<SerieCP, string[]>,
      distritais,
    },
    // clubes do CP/Terceira: o distrito sai do prefixo (cpA-3 → dA1); os da Terceira distribuem-se pelas séries
    ctx: {
      distritoDe: (c) => (c.startsWith("cp") ? `d${c[2]}1` : c.startsWith("t") ? `d${SERIES[Number(c.slice(1)) % 4]}2` : c.split("-c")[0]!),
      serieDoDistrito: serieDe,
    },
  };
}

function finais(atual: Piramide, ctx: Contexto): ClassificacoesFinais {
  void ctx;
  return {
    primeira: atual.primeira, segunda: atual.segunda, terceira: atual.terceira, cp: atual.cp,
    promovidosFasePromocao: SERIES.flatMap((s) => [{ clube: `d${s}3-c1`, serie: s }, { clube: `d${s}4-c1`, serie: s }]),
  };
}

describe("movimentos entre escalões", () => {
  it("mantém os tamanhos da pirâmide e não perde nem duplica clubes", () => {
    const { atual, ctx } = mundo();
    const r = aplicarMovimentos(atual, finais(atual, ctx), PARAMETROS_PADRAO, ctx);
    expect(r.avisos).toEqual([]);
    const todos = [...r.piramide.primeira, ...r.piramide.segunda, ...r.piramide.terceira, ...SERIES.flatMap((s) => r.piramide.cp[s]), ...Object.values(r.piramide.distritais).flat()];
    const antes = [...atual.primeira, ...atual.segunda, ...atual.terceira, ...SERIES.flatMap((s) => atual.cp[s]), ...Object.values(atual.distritais).flat()];
    expect(todos.length).toBe(antes.length);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("sobem e descem os números da tabela", () => {
    const { atual, ctx } = mundo();
    const r = aplicarMovimentos(atual, finais(atual, ctx), PARAMETROS_PADRAO, ctx);
    expect(r.piramide.primeira).toEqual(expect.arrayContaining(["s1", "s2", "s3"]));
    expect(r.piramide.primeira).not.toContain("p20");
    expect(r.piramide.segunda).toEqual(expect.arrayContaining(["p18", "p19", "p20", "t1", "t2", "t3"]));
    expect(r.piramide.terceira).toEqual(expect.arrayContaining(["s18", "s19", "s20"]));
    expect(r.piramide.terceira).toEqual(expect.arrayContaining(["cpA-1", "cpB-1", "cpC-1", "cpD-1"]));
    expect(r.movimentos.filter((m) => m.motivo === "promocao")).toHaveLength(8);
  });

  it("o CP desce promovidos + descidos da Terceira − 1 por série e as distritais recebem-nos", () => {
    const { atual, ctx } = mundo();
    const r = aplicarMovimentos(atual, finais(atual, ctx), PARAMETROS_PADRAO, ctx);
    const desceCp = r.movimentos.filter((m) => m.de.startsWith("cp-") && m.para.startsWith("distrital-"));
    expect(desceCp).toHaveLength(8);
    // série A: 2 promovidos + os descidos da Terceira nessa série − 1
    const t20 = ["t17", "t18", "t19", "t20"].filter((c) => serieDe(ctx.distritoDe(c)) === "A").length;
    expect(desceCp.filter((m) => m.de === "cp-A")).toHaveLength(2 + t20 - 1);
    expect(r.piramide.distritais["dA1"]).toContain("cpA-10");
    expect(r.piramide.distritais["dA3"]).not.toContain("dA3-c1");
  });

  it("avisa quando a Fase de Promoção não tem os promovidos esperados", () => {
    const { atual, ctx } = mundo();
    const f = finais(atual, ctx);
    f.promovidosFasePromocao = f.promovidosFasePromocao.slice(0, 6);
    const r = aplicarMovimentos(atual, f, PARAMETROS_PADRAO, ctx);
    expect(r.avisos.some((a) => a.includes("Fase de Promoção"))).toBe(true);
  });
});
