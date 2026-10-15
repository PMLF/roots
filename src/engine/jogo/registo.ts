/** Do resultado do motor de jogo para o que a persistência guarda (RZ-104 → RZ-122). */
import type { JogoFacto, JogoNovo, Participacao } from "../persistencia/tipos";
import type { RelatorioJogo } from "./estatisticas";
import type { EquipaJogo, EventoJogo, ResumoJogo } from "./tipos";

export type MetaJogo = { id: string; competicao: string; epoca: number; jornada: number; data: string; importancia?: number; arbitro?: string; assistencia?: number; receita?: number; causa?: number };

/**
 * Converte o jogo simulado em `JogoNovo` + factos + participações, prontos para `Repositorio.registarJogo`.
 * Golos (G), assistências (A), penáltis falhados (P) e cartões (CA, CV; `extra` «2A» num vermelho por segundo amarelo) são factos; os onze jogam o jogo todo (substituições: RZ-215). Com o `relatorio` (RZ-105), as participações levam a nota.
 */
export function registoDoJogo(meta: MetaJogo, casa: EquipaJogo, fora: EquipaJogo, eventos: readonly EventoJogo[], resumo: ResumoJogo, relatorio?: RelatorioJogo): { jogo: JogoNovo; factos: JogoFacto[]; participacoes: Participacao[] } {
  const clube = { casa: casa.clube, fora: fora.clube };
  const factos: JogoFacto[] = [];
  for (const e of eventos) {
    if (e.tipo === "cartao") {
      factos.push({ minuto: e.minuto, tipo: e.cor === "amarelo" ? "CA" : "CV", jogador: e.jogador, clube: clube[e.lado], ...(e.segundoAmarelo ? { extra: "2A" } : {}) });
      continue;
    }
    if (e.tipo !== "remate") continue;
    if (e.resultado === "golo") {
      factos.push({ minuto: e.minuto, tipo: "G", jogador: e.jogador, clube: clube[e.lado], ...(e.origem !== "jogada" ? { extra: e.origem } : {}) });
      if (e.assistente) factos.push({ minuto: e.minuto, tipo: "A", jogador: e.assistente, clube: clube[e.lado] });
    } else if (e.origem === "penalti") factos.push({ minuto: e.minuto, tipo: "P", jogador: e.jogador, clube: clube[e.lado] });
  }
  const arredondar = (x: number) => Math.round(x * 100) / 100;
  const jogo: JogoNovo = {
    id: meta.id, competicao: meta.competicao, epoca: meta.epoca, jornada: meta.jornada, data: meta.data,
    casa: casa.clube, fora: fora.clube, golosCasa: resumo.casa.golos, golosFora: resumo.fora.golos,
    xgCasa: arredondar(resumo.casa.xg), xgFora: arredondar(resumo.fora.xg), posseCasa: arredondar(resumo.posseCasa),
    ...(meta.assistencia !== undefined ? { assistencia: meta.assistencia } : {}),
    ...(meta.receita !== undefined ? { receita: meta.receita } : {}),
    ...(meta.importancia !== undefined ? { importancia: meta.importancia } : {}),
    ...(meta.arbitro !== undefined ? { arbitro: meta.arbitro } : {}),
    ...(meta.causa !== undefined ? { causa: meta.causa } : {}),
  };
  const nota = (id: string) => relatorio?.jogadores.find((x) => x.id === id)?.nota;
  const participar = (eq: EquipaJogo): Participacao[] =>
    eq.onze.map((j) => {
      const n = nota(j.id);
      const expulso = eventos.find((e) => e.tipo === "cartao" && e.cor === "vermelho" && e.jogador === j.id);
      return { jogador: j.id, clube: eq.clube, titular: true, minutos: expulso ? expulso.minuto : resumo.duracao, ...(n !== undefined ? { nota: n } : {}) };
    });
  const participacoes: Participacao[] = [...participar(casa), ...participar(fora)];
  return { jogo, factos, participacoes };
}
