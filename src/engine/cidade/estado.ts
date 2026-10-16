/**
 * Estado de uma cidade (concelho): as variáveis de docs/CIDADE.md §2 que o MVP acompanha (RZ-133).
 * Tudo aqui é puro. O estado "verdadeiro" são números 0-100; a interface só vê níveis em palavras e tendências.
 */
import type { Rng } from "../aleatorio/rng";
import { limitar } from "../aleatorio/rng";
import type { EfeitosCidade, Parametros } from "../config/parametros";
import type { CidadeBase, ClubeBase } from "../dados/tipos";

export type EstadoCidade = {
  populacao: number;
  emprego: number;
  economia: number;
  turismo: number;
  orgulho: number;
  notoriedade: number;
  culturaFutebol: number;
};

export type Indicador = Exclude<keyof EstadoCidade, "populacao">;
export const INDICADORES: readonly Indicador[] = ["economia", "emprego", "turismo", "orgulho", "notoriedade", "culturaFutebol"];

/** Níveis em palavras: 1 muito baixo … 5 muito alto. */
export type NivelCidade = 1 | 2 | 3 | 4 | 5;
export type Tendencia = "sobe" | "estavel" | "desce";

export type AlvosCidade = Pick<EstadoCidade, "emprego" | "economia" | "turismo" | "orgulho" | "notoriedade">;

const DECADA_BASE = Math.log10(15000);

export function nivelDe(valor: number, params: Pick<Parametros, "cidade">): NivelCidade {
  const cortes = params.cidade.niveis;
  return (1 + cortes.filter((c) => valor >= c).length) as NivelCidade;
}

export function tendenciaDe(antes: number | undefined, agora: number, params: Pick<Parametros, "cidade">): Tendencia {
  if (antes === undefined) return "estavel";
  const d = agora - antes;
  return d >= params.cidade.limiarTendencia ? "sobe" : d <= -params.cidade.limiarTendencia ? "desce" : "estavel";
}

/** Efeito do setor num campo: o principal a 100 %, o secundário a 50 %, mais o das ilhas. */
export function efeitoDoSetor(c: Pick<CidadeBase, "setor" | "tag2" | "ilha">, campo: keyof EfeitosCidade, params: Pick<Parametros, "cidade">): number {
  const s = params.cidade.setores;
  return (s[c.setor]?.[campo] ?? 0) + 0.5 * (s[c.tag2]?.[campo] ?? 0) + (c.ilha ? (s.ILH?.[campo] ?? 0) : 0);
}

const lim = (x: number) => limitar(x, 0, 100);

/** Valores para onde a cidade tende, sem ruído: o setor, o tamanho e o melhor clube da terra. */
export function alvosDaCidade(c: CidadeBase, clubes: readonly ClubeBase[], params: Pick<Parametros, "cidade">): AlvosCidade {
  const k = params.cidade.inicial;
  const decadas = Math.log10(Math.max(c.populacao, 1)) - DECADA_BASE;
  const rep = Math.max(0, ...clubes.filter((x) => x.cidade === c.id).map((x) => x.reputacao)) / k.reputacaoMax;
  return {
    emprego: lim(k.base + efeitoDoSetor(c, "emprego", params) + k.porDecadaEmprego * decadas),
    economia: lim(k.base + efeitoDoSetor(c, "economia", params) + k.porDecadaEconomia * decadas),
    turismo: lim(k.base + efeitoDoSetor(c, "turismo", params)),
    orgulho: lim(k.orgulho.base + k.orgulho.porReputacao * rep),
    notoriedade: lim(k.notoriedade.base + k.notoriedade.porReputacao * rep + k.notoriedade.porDecada * decadas),
  };
}

/** Estado de arranque: os alvos mais um desvio sorteado (mesma seed → mesma cidade). */
export function estadoInicial(c: CidadeBase, clubes: readonly ClubeBase[], rng: Rng, params: Pick<Parametros, "cidade">): EstadoCidade {
  const k = params.cidade.inicial;
  const a = alvosDaCidade(c, clubes, params);
  return {
    populacao: c.populacao,
    emprego: lim(a.emprego + rng.gauss(0, k.ruido)),
    economia: lim(a.economia + rng.gauss(0, k.ruido)),
    turismo: lim(a.turismo + rng.gauss(0, k.ruido)),
    orgulho: lim(a.orgulho + rng.gauss(0, k.orgulho.ruido)),
    notoriedade: lim(a.notoriedade + rng.gauss(0, k.notoriedade.ruido)),
    culturaFutebol: c.culturaFutebol,
  };
}
