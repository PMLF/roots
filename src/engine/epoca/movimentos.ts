/**
 * Movimentos entre escalões no fim da época (RZ-111; docs/DESIGN_REGRAS.md §1 e §2, passos 4 e 5). Puro: recebe as
 * classificações finais (do melhor para o pior) e devolve a nova composição de cada competição, sem tocar no repositório.
 *
 * Prémio do Estado (passo 2), Fase de Promoção (passo 3, RZ-125) e reajuste das distritais (passo 6, RZ-113) ficam
 * fora: os promovidos da Fase de Promoção entram como dado, e as distritais só perdem os promovidos e recebem os
 * despromovidos do CP.
 */
import { derivados, type Parametros } from "../config/parametros";
import type { ClubeId, DistritoId, SerieCP } from "../dados/tipos";

export const SERIES: readonly SerieCP[] = ["A", "B", "C", "D"];

export type Piramide = {
  primeira: ClubeId[];
  segunda: ClubeId[];
  terceira: ClubeId[];
  cp: Record<SerieCP, ClubeId[]>;
  distritais: Record<DistritoId, ClubeId[]>;
};

/** Classificações finais, do 1.º ao último. As séries do CP e as distritais só têm de listar os clubes da competição. */
export type ClassificacoesFinais = {
  primeira: ClubeId[];
  segunda: ClubeId[];
  terceira: ClubeId[];
  cp: Record<SerieCP, ClubeId[]>;
  /** Os promovidos da Fase de Promoção (2 por grupo), cada um com a série do CP para onde sobe. */
  promovidosFasePromocao: { clube: ClubeId; serie: SerieCP }[];
};

export type Local = "primeira" | "segunda" | "terceira" | `cp-${SerieCP}` | `distrital-${DistritoId}`;

export type Movimento = { clube: ClubeId; de: Local; para: Local; motivo: "subida" | "descida" | "promocao" };

export type ResultadoMovimentos = { piramide: Piramide; movimentos: Movimento[]; avisos: string[] };

/** Onde cada clube joga: serve para saber a série do CP e o distrito de um clube que desce. */
export type Contexto = { distritoDe: (c: ClubeId) => DistritoId; serieDoDistrito: (d: DistritoId) => SerieCP };

export function aplicarMovimentos(atual: Piramide, finais: ClassificacoesFinais, params: Parametros, ctx: Contexto): ResultadoMovimentos {
  const { primeiraLiga, segundaLiga, terceiraLiga, cp } = params.piramide;
  const avisos: string[] = [];
  const movimentos: Movimento[] = [];
  const mover = (clube: ClubeId, de: Local, para: Local, motivo: Movimento["motivo"]) => movimentos.push({ clube, de, para, motivo });
  const ultimos = (lista: readonly ClubeId[], n: number) => (n > 0 ? lista.slice(-n) : []);
  const primeiros = (lista: readonly ClubeId[], n: number) => lista.slice(0, n);

  const verifica = (nome: string, esperados: readonly ClubeId[], finalLista: readonly ClubeId[]) => {
    const a = [...esperados].sort().join("|");
    const b = [...finalLista].sort().join("|");
    if (a !== b) avisos.push(`classificação final de ${nome} não coincide com os clubes da competição`);
  };
  verifica("primeira", atual.primeira, finais.primeira);
  verifica("segunda", atual.segunda, finais.segunda);
  verifica("terceira", atual.terceira, finais.terceira);
  for (const s of SERIES) verifica(`cp-${s}`, atual.cp[s], finais.cp[s]);

  // 1. Primeira ⇄ Segunda ⇄ Terceira
  const desceP = ultimos(finais.primeira, primeiraLiga.descem);
  const sobeS = primeiros(finais.segunda, segundaLiga.sobem);
  const desceS = ultimos(finais.segunda.filter((c) => !sobeS.includes(c)), segundaLiga.descem);
  const sobeT = primeiros(finais.terceira, terceiraLiga.sobem);
  const desceT = ultimos(finais.terceira.filter((c) => !sobeT.includes(c)), terceiraLiga.descem);
  for (const c of desceP) mover(c, "primeira", "segunda", "descida");
  for (const c of sobeS) mover(c, "segunda", "primeira", "subida");
  for (const c of desceS) mover(c, "segunda", "terceira", "descida");
  for (const c of sobeT) mover(c, "terceira", "segunda", "subida");

  // 2. CP: o campeão de cada série sobe; descem `promovidos_da_série + descidos_da_Terceira_na_série − subida`
  const serieDe = (c: ClubeId) => ctx.serieDoDistrito(ctx.distritoDe(c));
  const campeoes: { clube: ClubeId; serie: SerieCP }[] = [];
  const desceCp: { clube: ClubeId; serie: SerieCP }[] = [];
  for (const s of SERIES) {
    const tabela = finais.cp[s];
    const sobem = primeiros(tabela, cp.sobemPorSerie);
    for (const c of sobem) campeoes.push({ clube: c, serie: s });
    const entradasPromo = finais.promovidosFasePromocao.filter((p) => p.serie === s).length;
    const entradasTerceira = desceT.filter((c) => serieDe(c) === s).length;
    const descem = Math.max(0, entradasPromo + entradasTerceira - sobem.length);
    for (const c of ultimos(tabela.filter((x) => !sobem.includes(x)), descem)) desceCp.push({ clube: c, serie: s });
  }
  for (const c of campeoes) mover(c.clube, `cp-${c.serie}`, "terceira", "subida");
  for (const c of desceT) mover(c, "terceira", `cp-${serieDe(c)}`, "descida");
  for (const c of desceCp) mover(c.clube, `cp-${c.serie}`, `distrital-${ctx.distritoDe(c.clube)}`, "descida");
  for (const p of finais.promovidosFasePromocao) mover(p.clube, `distrital-${ctx.distritoDe(p.clube)}`, `cp-${p.serie}`, "promocao");

  const esperadosPromo = derivados(params).promovidosAoCp;
  if (finais.promovidosFasePromocao.length !== esperadosPromo) avisos.push(`a Fase de Promoção devia ter ${esperadosPromo} promovidos e tem ${finais.promovidosFasePromocao.length}`);

  // 3. Nova composição
  const saem = new Map<Local, Set<ClubeId>>();
  const entram = new Map<Local, ClubeId[]>();
  for (const m of movimentos) {
    (saem.get(m.de) ?? saem.set(m.de, new Set()).get(m.de)!).add(m.clube);
    (entram.get(m.para) ?? entram.set(m.para, []).get(m.para)!).push(m.clube);
  }
  const compor = (local: Local, base: readonly ClubeId[]) => [...base.filter((c) => !saem.get(local)?.has(c)), ...(entram.get(local) ?? [])];
  const nova: Piramide = {
    primeira: compor("primeira", atual.primeira),
    segunda: compor("segunda", atual.segunda),
    terceira: compor("terceira", atual.terceira),
    cp: Object.fromEntries(SERIES.map((s) => [s, compor(`cp-${s}`, atual.cp[s])])) as Record<SerieCP, ClubeId[]>,
    distritais: Object.fromEntries(Object.entries(atual.distritais).map(([d, l]) => [d, compor(`distrital-${d}`, l)])),
  };

  const tamanhos: [string, number, number][] = [
    ["primeira", nova.primeira.length, primeiraLiga.clubes],
    ["segunda", nova.segunda.length, segundaLiga.clubes],
    ["terceira", nova.terceira.length, terceiraLiga.clubes],
    ...SERIES.map((s): [string, number, number] => [`cp-${s}`, nova.cp[s].length, cp.clubesPorSerie]),
  ];
  for (const [nome, n, esperado] of tamanhos) if (n !== esperado) avisos.push(`${nome} fica com ${n} clubes (esperado ${esperado})`);
  return { piramide: nova, movimentos, avisos };
}
