/**
 * Rivais do clube do gamer (RZ-174): só os resultados contra rivais vão para a caixa de entrada.
 * Rival geográfico: o rival principal do clube ou uma rivalidade mútua / do mesmo concelho nos dados.
 * Rival direto: clube perto na tabela, em pontos ou em lugares, quando já se jogou o suficiente.
 */
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data, EventoNovo } from "../persistencia/tipos";

export type MotivoRival = "geografico" | "tabela";

export function rivalGeografico(dados: DadosBase, a: string, b: string): boolean {
  const ca = dados.clubes.find((c) => c.id === a);
  const cb = dados.clubes.find((c) => c.id === b);
  if (ca?.rival === b || cb?.rival === a) return true;
  return dados.rivalidades.some((r) => ((r.a === a && r.b === b) || (r.a === b && r.b === a)) && (r.mutua || r.mesmoConcelho));
}

/** Motivo pelo qual `outro` é rival de `meu` neste momento (antes do jogo), ou `undefined`. */
export function motivoDeRival(repo: Repositorio, dados: DadosBase, params: Parametros, competicao: string, epoca: number, meu: string, outro: string): MotivoRival | undefined {
  if (rivalGeografico(dados, meu, outro)) return "geografico";
  const tabela = [...repo.classificacao(competicao, epoca)].sort((x, y) => y.pontos - x.pontos || (y.golosMarcados - y.golosSofridos) - (x.golosMarcados - x.golosSofridos) || y.golosMarcados - x.golosMarcados);
  const i = tabela.findIndex((l) => l.clube === meu);
  const j = tabela.findIndex((l) => l.clube === outro);
  if (i < 0 || j < 0) return undefined;
  const { rivalPontos, rivalLugares, rivalMinJogos } = params.caixa;
  const a = tabela[i]!;
  const b = tabela[j]!;
  if (a.jogos < rivalMinJogos || b.jogos < rivalMinJogos) return undefined;
  return Math.abs(a.pontos - b.pontos) <= rivalPontos || Math.abs(i - j) <= rivalLugares ? "tabela" : undefined;
}

/** Marca um jogo do gamer como contra um rival (a caixa de entrada só mostra estes resultados). */
export function eventoRival(jogo: string, casa: string, fora: string, data: Data, epoca: number, jornada: number, causa: number, motivo: MotivoRival): EventoNovo {
  return { tipo: "JOGO_RIVAL", data, epoca, jornada, vis: "privado", causa, entidades: [{ k: "clube", id: casa, papel: "casa" }, { k: "clube", id: fora, papel: "fora" }, { k: "jogo", id: jogo }], dados: { motivo } };
}
