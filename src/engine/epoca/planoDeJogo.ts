/**
 * Plano de jogo do clube do gamer (RZ-158): tática e onze escolhidos, guardados no save (`plano.<clube>`). Pode mudar-se
 * a qualquer momento. Sem onze escolhido, joga-se com o automático. Quem estiver lesionado ou suspenso no dia do jogo é
 * trocado pelo melhor disponível para a mesma posição. O avanço pára antes do jogo do clube até o gamer o confirmar.
 */
import type { Parametros } from "../config/parametros";
import { suspensosDoClube } from "../disciplina/castigos";
import { aptidaoNa, onzeAutomatico, type CandidatoOnze } from "../jogo/equipa";
import { FORMACOES, TATICA_PADRAO, ESTILOS } from "../jogo/formacoes";
import type { JogadorEmCampo, Tatica } from "../jogo/tipos";
import { EVENTO_LESAO } from "../lesoes/estado";
import type { Atributos, Posicao } from "../mundo/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";

export type Plano = { tatica: Tatica; /** Sem onze, usa-se o automático. */ onze?: { jogador: string; posicao: Posicao }[] };

const chave = (clube: string) => `plano.${clube}`;
const chaveConfirmacao = (jogo: string) => `confirmado.${jogo}`;

export function lerPlano(repo: Repositorio, clube: string): Plano {
  const bruto = repo.meta(chave(clube));
  if (!bruto) return { tatica: { ...TATICA_PADRAO } };
  try {
    const p = JSON.parse(bruto) as Plano;
    return { tatica: { ...TATICA_PADRAO, ...p.tatica }, ...(p.onze ? { onze: p.onze } : {}) };
  } catch {
    return { tatica: { ...TATICA_PADRAO } };
  }
}

const nivelValido = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;

/** Lança se a tática não fizer sentido. */
export function validarTatica(t: Tatica): void {
  if (!(t.formacao in FORMACOES)) throw new Error("Formação desconhecida");
  if (!ESTILOS.includes(t.estilo)) throw new Error("Estilo desconhecido");
  for (const k of ["intensidade", "linha", "ritmo", "fairPlay"] as const) if (!nivelValido(t[k])) throw new Error(`${k} deve ser de 1 a 5`);
}

/** Valida e guarda. Lança se a tática ou o onze não fizerem sentido. */
export function guardarPlano(repo: Repositorio, clube: string, plano: Plano): void {
  const t = plano.tatica;
  validarTatica(t);
  if (plano.onze) {
    const plantel = new Set(repo.jogadoresDoClube(clube).filter((j) => j.estado === "ativo").map((j) => j.pessoa));
    if (plano.onze.length !== 11) throw new Error("O onze tem de ter 11 jogadores");
    if (new Set(plano.onze.map((o) => o.jogador)).size !== 11) throw new Error("Jogador repetido no onze");
    if (plano.onze.some((o) => !plantel.has(o.jogador))) throw new Error("Há jogadores que não são do plantel");
    const esperado = [...FORMACOES[t.formacao]].sort().join(",");
    if (plano.onze.map((o) => o.posicao).sort().join(",") !== esperado) throw new Error("As posições do onze não correspondem à formação");
  }
  repo.definirMeta(chave(clube), JSON.stringify(plano));
}

export const confirmarJogo = (repo: Repositorio, jogo: string) => repo.definirMeta(chaveConfirmacao(jogo), "1");
export const jogoConfirmado = (repo: Repositorio, jogo: string) => repo.meta(chaveConfirmacao(jogo)) === "1";

export type Indisponivel = { jogador: string; motivo: "lesao" | "suspenso"; detalhe?: number };

/** Lesionados e suspensos de um clube para um jogo. */
export function indisponiveis(repo: Repositorio, clube: string, jogadores: readonly string[], competicao: string, epoca: number, jornada: number, hoje: Data, seed: string, params: Parametros): Map<string, Indisponivel> {
  const out = new Map<string, Indisponivel>();
  for (const e of repo.eventosDe({ k: "clube", id: clube }, { tipo: EVENTO_LESAO })) {
    const ate = (e.dados as { ate?: Data }).ate;
    const j = e.entidades.find((x) => x.k === "pessoa" && x.papel === "lesionado");
    if (j && ate && e.data <= hoje && ate > hoje) out.set(j.id, { jogador: j.id, motivo: "lesao" });
  }
  for (const s of suspensosDoClube(repo, clube, jogadores, competicao, epoca, jornada, seed, params)) out.set(s.jogador, { jogador: s.jogador, motivo: "suspenso", detalhe: s.jogosPorCumprir });
  return out;
}

/** Aplica o plano aos candidatos: o onze escolhido, com os indisponíveis trocados pelo melhor disponível na posição. */
export function onzeDoPlano(plano: Plano, candidatos: readonly CandidatoOnze[], fora: ReadonlySet<string>, params?: Parametros): JogadorEmCampo[] {
  const posicoes = FORMACOES[plano.tatica.formacao];
  const livres = candidatos.filter((c) => !fora.has(c.pessoa));
  const usar = livres.length >= 12 ? livres : [...candidatos]; // plantel desfalcado: joga quem houver
  if (!plano.onze) return onzeAutomatico(usar, posicoes, params);
  const porId = new Map(candidatos.map((c) => [c.pessoa, c] as const));
  const onze: JogadorEmCampo[] = [];
  const ocupados = new Set<string>();
  const vagas: Posicao[] = [];
  for (const o of plano.onze) {
    const c = porId.get(o.jogador);
    if (c && (!fora.has(o.jogador) || usar === candidatos)) {
      onze.push({ id: c.pessoa, posicao: o.posicao, atributos: c.atributos as Atributos, alturaCm: c.alturaCm, forma: c.forma ?? 1, ...(params ? { aptidao: aptidaoNa(c.posicoes, o.posicao, params), posicoes: c.posicoes } : {}) });
      ocupados.add(c.pessoa);
    } else vagas.push(o.posicao);
  }
  if (vagas.length > 0) {
    const restantes = usar.filter((c) => !ocupados.has(c.pessoa));
    const extra = onzeAutomatico(restantes, vagas, params);
    onze.push(...extra);
  }
  return onze;
}
