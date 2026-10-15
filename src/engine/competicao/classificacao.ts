/**
 * Classificação com desempates (RZ-110; docs/DESIGN_REGRAS.md §1). Pura: recebe as linhas (que já trazem os ajustes de
 * sanções retroativas) e os jogos, e ordena segundo a lista de critérios da competição.
 *
 * Confronto direto: entre os clubes empatados, contam só os jogos entre eles (pontos, diferença e golos marcados).
 * Se isso separa o grupo em partes, o critério volta a aplicar-se a cada parte que continue empatada (ex.: de 3 empatados,
 * um fica à frente e os outros dois voltam a medir-se só entre si). Se não separa ninguém, passa-se ao critério seguinte.
 */
import { Rng } from "../aleatorio/rng";
import type { Criterio } from "../config/parametros";
import type { LinhaClassificacao } from "../persistencia/tipos";

export type JogoResultado = { casa: string; fora: string; golosCasa: number; golosFora: number };

export type LinhaOrdenada = LinhaClassificacao & {
  posicao: number;
  diferenca: number;
  /** Se esteve empatado em pontos com outro clube: o critério que por fim o separou. */
  desempatePor?: Criterio;
};

export type ContextoClassificacao = {
  pontosVitoria: number;
  pontosEmpate: number;
  seed: string;
  competicao: string;
  epoca: number;
  /** Reputação dos clubes (para `reputacaoMenor`). */
  reputacao?: ReadonlyMap<string, number>;
  /** Clubes da competição que ainda não jogaram: entram a zeros. */
  clubes?: readonly string[];
};

const linhaVazia = (clube: string): LinhaClassificacao => ({ clube, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golosMarcados: 0, golosSofridos: 0, pontosJogos: 0, ajuste: 0, pontos: 0 });

type Mini = { pontos: number; diferenca: number; golos: number };

function miniTabela(grupo: readonly string[], jogos: readonly JogoResultado[], ctx: ContextoClassificacao): Map<string, Mini> {
  const m = new Map<string, Mini>(grupo.map((c) => [c, { pontos: 0, diferenca: 0, golos: 0 }]));
  for (const j of jogos) {
    const a = m.get(j.casa);
    const b = m.get(j.fora);
    if (!a || !b) continue;
    a.golos += j.golosCasa;
    b.golos += j.golosFora;
    a.diferenca += j.golosCasa - j.golosFora;
    b.diferenca += j.golosFora - j.golosCasa;
    if (j.golosCasa > j.golosFora) a.pontos += ctx.pontosVitoria;
    else if (j.golosCasa < j.golosFora) b.pontos += ctx.pontosVitoria;
    else {
      a.pontos += ctx.pontosEmpate;
      b.pontos += ctx.pontosEmpate;
    }
  }
  return m;
}

/** Parte um grupo em subgrupos por ordem decrescente de uma chave (vetor comparado por ordem lexicográfica). */
function partir(grupo: readonly string[], chave: (c: string) => number[]): string[][] {
  const ordenado = [...grupo].sort((x, y) => {
    const a = chave(x);
    const b = chave(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (b[i] as number) - (a[i] as number);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const partes: string[][] = [];
  let anterior: number[] | undefined;
  for (const c of ordenado) {
    const k = chave(c);
    if (anterior && k.every((v, i) => v === anterior?.[i])) (partes.at(-1) as string[]).push(c);
    else partes.push([c]);
    anterior = k;
  }
  return partes;
}

export function ordenarClassificacao(linhas: readonly LinhaClassificacao[], jogos: readonly JogoResultado[], criterios: readonly Criterio[], ctx: ContextoClassificacao): LinhaOrdenada[] {
  const porClube = new Map<string, LinhaClassificacao>(linhas.map((l) => [l.clube, l]));
  for (const c of ctx.clubes ?? []) if (!porClube.has(c)) porClube.set(c, linhaVazia(c));
  const linha = (c: string) => porClube.get(c) as LinhaClassificacao;
  const dif = (c: string) => linha(c).golosMarcados - linha(c).golosSofridos;
  const desempatePor = new Map<string, Criterio>();
  const sorteio = (c: string) => new Rng(ctx.seed, `classificacao/${ctx.competicao}/${ctx.epoca}/${c}`).float();

  const resolver = (grupo: string[], idx: number): string[] => {
    if (grupo.length <= 1) return grupo;
    const criterio = criterios[idx];
    if (criterio === undefined) return [...grupo].sort(); // nunca devia chegar cá: o último critério desempata sempre
    let partes: string[][];
    if (criterio === "confrontoDireto") {
      const mini = miniTabela(grupo, jogos, ctx);
      partes = partir(grupo, (c) => {
        const m = mini.get(c) as Mini;
        return [m.pontos, m.diferenca, m.golos];
      });
      if (partes.length > 1 && idx > 0) for (const c of grupo) desempatePor.set(c, criterio);
      // um confronto direto que separa o grupo reaplica-se a cada parte que continue empatada
      return partes.flatMap((p) => (partes.length > 1 && p.length > 1 ? resolver(p, idx) : resolver(p, idx + 1)));
    }
    const chave: Record<Exclude<Criterio, "confrontoDireto">, (c: string) => number[]> = {
      pontos: (c) => [linha(c).pontos],
      diferenca: (c) => [dif(c)],
      golosMarcados: (c) => [linha(c).golosMarcados],
      vitorias: (c) => [linha(c).vitorias],
      reputacaoMenor: (c) => [-(ctx.reputacao?.get(c) ?? 0)],
      sorteio: (c) => [sorteio(c)],
    };
    partes = partir(grupo, chave[criterio]);
    if (partes.length > 1 && idx > 0) for (const c of grupo) desempatePor.set(c, criterio);
    return partes.flatMap((p) => resolver(p, idx + 1));
  };

  const ordem = resolver([...porClube.keys()], 0);
  return ordem.map((c, i) => {
    const l = linha(c);
    const por = desempatePor.get(c);
    return { ...l, posicao: i + 1, diferenca: dif(c), ...(por ? { desempatePor: por } : {}) };
  });
}
