import type { JogoVivo } from "@/engine/epoca/jogoAoVivo";
import type { EstatLado, Lado } from "@/engine/jogo/tipos";

/** Marcador de um jogo à passagem de um minuto. */
export function marcadorAo(golos: { minuto: number; lado: Lado }[], minuto: number): [number, number] {
  const v = golos.filter((g) => g.minuto <= minuto);
  return [v.filter((g) => g.lado === "casa").length, v.filter((g) => g.lado === "fora").length];
}

export type LinhaTabela = { clube: string; nome: string; jogos: number; pontos: number; dg: number; gm: number; pos: number; antes: number; aJogar: boolean };

/** A tabela da competição com os resultados que estão a decorrer somados (provisória). */
export function tabelaAoVivo(jogo: JogoVivo, minuto: number): LinhaTabela[] {
  const golosDoJogo = jogo.linhas.filter((l) => l.tipo === "golo").map((l) => ({ minuto: l.minuto, lado: l.lado as Lado }));
  const emCurso = [
    { casa: jogo.casa.id, fora: jogo.fora.id, golos: golosDoJogo },
    ...jogo.outros.map((o) => ({ casa: o.casa.id, fora: o.fora.id, golos: o.golos })),
  ];
  const ordenar = <L extends { pontos: number; dg: number; gm: number; nome: string }>(l: L[]): L[] => l.sort((a, b) => b.pontos - a.pontos || b.dg - a.dg || b.gm - a.gm || a.nome.localeCompare(b.nome));
  const base = jogo.tabela.map((l) => ({ clube: l.clube, nome: l.nome, jogos: l.jogos, pontos: l.pontos, dg: l.golosMarcados - l.golosSofridos, gm: l.golosMarcados, aJogar: false }));
  const antes = new Map(ordenar([...base]).map((l, i) => [l.clube, i + 1] as const));
  const linhas = new Map<string, (typeof base)[number]>(base.map((l) => [l.clube, { ...l }]));
  for (const e of emCurso) {
    const [gc, gf] = marcadorAo(e.golos, minuto);
    for (const [clube, gm, gs] of [[e.casa, gc, gf], [e.fora, gf, gc]] as const) {
      const l = linhas.get(clube);
      if (!l) continue;
      l.jogos += 1; l.gm += gm; l.dg += gm - gs; l.aJogar = true;
      l.pontos += gm > gs ? jogo.pontosVitoria : gm === gs ? jogo.pontosEmpate : 0;
    }
  }
  return ordenar([...linhas.values()]).map((l, i) => ({ ...l, pos: i + 1, antes: antes.get(l.clube) ?? i + 1 }));
}

export type ChaveEstatistica = "xg" | "posse" | "oportunidades" | "remates" | "aBaliza" | "fora" | "bloqueados" | "precisao" | "defesas" | "cantos" | "faltas" | "amarelos" | "vermelhos" | "lesoes";
export type LinhaEstatistica = { chave: ChaveEstatistica; casa: number; fora: number; /** Como mostrar os valores. */ formato: "inteiro" | "decimal" | "percentagem" };

/** As estatísticas do jogo, lado a lado (14 linhas), a partir do resumo do motor. A ordem é a de leitura: o que mais interessa primeiro. */
export function estatisticasDoJogo(resumo: { casa: EstatLado; fora: EstatLado; posseCasa: number }): LinhaEstatistica[] {
  const { casa, fora } = resumo;
  const ao = (e: EstatLado) => e.remates - e.aBaliza - e.bloqueados;
  const precisao = (e: EstatLado) => (e.remates > 0 ? e.aBaliza / e.remates : 0);
  // defesas do guarda-redes de um lado: remates enquadrados do adversário que não foram golo
  const defesas = (deles: EstatLado) => Math.max(0, deles.aBaliza - deles.golos);
  return [
    { chave: "xg", casa: casa.xg, fora: fora.xg, formato: "decimal" },
    { chave: "posse", casa: resumo.posseCasa, fora: 1 - resumo.posseCasa, formato: "percentagem" },
    { chave: "oportunidades", casa: casa.oportunidades, fora: fora.oportunidades, formato: "inteiro" },
    { chave: "remates", casa: casa.remates, fora: fora.remates, formato: "inteiro" },
    { chave: "aBaliza", casa: casa.aBaliza, fora: fora.aBaliza, formato: "inteiro" },
    { chave: "fora", casa: ao(casa), fora: ao(fora), formato: "inteiro" },
    { chave: "bloqueados", casa: casa.bloqueados, fora: fora.bloqueados, formato: "inteiro" },
    { chave: "precisao", casa: precisao(casa), fora: precisao(fora), formato: "percentagem" },
    { chave: "defesas", casa: defesas(fora), fora: defesas(casa), formato: "inteiro" },
    { chave: "cantos", casa: casa.cantos, fora: fora.cantos, formato: "inteiro" },
    { chave: "faltas", casa: casa.faltas, fora: fora.faltas, formato: "inteiro" },
    { chave: "amarelos", casa: casa.amarelos, fora: fora.amarelos, formato: "inteiro" },
    { chave: "vermelhos", casa: casa.vermelhos, fora: fora.vermelhos, formato: "inteiro" },
    { chave: "lesoes", casa: casa.lesoes, fora: fora.lesoes, formato: "inteiro" },
  ];
}
