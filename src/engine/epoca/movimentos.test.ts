import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../config/parametros";
import type { CpSeries } from "../dados/tipos";
import { applyMovements, SERIES, type FinalStandings, type Context, type Pyramid } from "./movimentos";

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
// 5 distritais por série (d-A1..d-A5, ...), com 10 clubes cada; distrito do clube = prefixo antes do "-c"
const districts = SERIES.flatMap((s) => ids(`d${s}`, 5));
const seriesOf = (d: string) => d[1] as CpSeries;

function world(): { current: Pyramid; ctx: Context } {
  const districtLeagues: Record<string, string[]> = {};
  for (const d of districts) districtLeagues[d] = ids(`${d}-c`, 10);
  return {
    current: {
      first: ids("p", 20), second: ids("s", 20), third: ids("t", 20),
      cp: Object.fromEntries(SERIES.map((s) => [s, ids(`cp${s}-`, 10)])) as Record<CpSeries, string[]>,
      districtLeagues,
    },
    // clubes do CP/Terceira: o distrito sai do prefixo (cpA-3 → dA1); os da Terceira distribuem-se pelas séries
    ctx: {
      districtOf: (c) => (c.startsWith("cp") ? `d${c[2]}1` : c.startsWith("t") ? `d${SERIES[Number(c.slice(1)) % 4]}2` : c.split("-c")[0]!),
      districtSeries: seriesOf,
    },
  };
}

function final(current: Pyramid, ctx: Context): FinalStandings {
  void ctx;
  return {
    first: current.first, second: current.second, third: current.third, cp: current.cp,
    promotionPhasePromoted: SERIES.flatMap((s) => [{ club: `d${s}3-c1`, series: s }, { club: `d${s}4-c1`, series: s }]),
  };
}

describe("movimentos entre escalões", () => {
  it("mantém os tamanhos da pirâmide e não perde nem duplica clubes", () => {
    const { current, ctx } = world();
    const r = applyMovements(current, final(current, ctx), DEFAULT_PARAMETERS, ctx);
    expect(r.warnings).toEqual([]);
    const all = [...r.pyramid.first, ...r.pyramid.second, ...r.pyramid.third, ...SERIES.flatMap((s) => r.pyramid.cp[s]), ...Object.values(r.pyramid.districtLeagues).flat()];
    const before = [...current.first, ...current.second, ...current.third, ...SERIES.flatMap((s) => current.cp[s]), ...Object.values(current.districtLeagues).flat()];
    expect(all.length).toBe(before.length);
    expect(new Set(all).size).toBe(all.length);
  });

  it("sobem e descem os números da tabela", () => {
    const { current, ctx } = world();
    const r = applyMovements(current, final(current, ctx), DEFAULT_PARAMETERS, ctx);
    expect(r.pyramid.first).toEqual(expect.arrayContaining(["s1", "s2", "s3"]));
    expect(r.pyramid.first).not.toContain("p20");
    expect(r.pyramid.second).toEqual(expect.arrayContaining(["p18", "p19", "p20", "t1", "t2", "t3"]));
    expect(r.pyramid.third).toEqual(expect.arrayContaining(["s18", "s19", "s20"]));
    expect(r.pyramid.third).toEqual(expect.arrayContaining(["cpA-1", "cpB-1", "cpC-1", "cpD-1"]));
    expect(r.movements.filter((m) => m.reason === "promotion")).toHaveLength(8);
  });

  it("o CP desce promovidos + descidos da Terceira − 1 por série e as distritais recebem-nos", () => {
    const { current, ctx } = world();
    const r = applyMovements(current, final(current, ctx), DEFAULT_PARAMETERS, ctx);
    const cpDrops = r.movements.filter((m) => m.de.startsWith("cp-") && m.para.startsWith("distrital-"));
    expect(cpDrops).toHaveLength(8);
    // série A: 2 promovidos + os descidos da Terceira nessa série − 1
    const t20 = ["t17", "t18", "t19", "t20"].filter((c) => seriesOf(ctx.districtOf(c)) === "A").length;
    expect(cpDrops.filter((m) => m.de === "cp-A")).toHaveLength(2 + t20 - 1);
    expect(r.pyramid.districtLeagues["dA1"]).toContain("cpA-10");
    expect(r.pyramid.districtLeagues["dA3"]).not.toContain("dA3-c1");
  });

  it("avisa quando a Fase de Promoção não tem os promovidos esperados", () => {
    const { current, ctx } = world();
    const f = final(current, ctx);
    f.promotionPhasePromoted = f.promotionPhasePromoted.slice(0, 6);
    const r = applyMovements(current, f, DEFAULT_PARAMETERS, ctx);
    expect(r.warnings.some((a) => a.includes("Fase de Promoção"))).toBe(true);
  });
});
