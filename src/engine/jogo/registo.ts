/** Do resultado do motor de jogo para o que a persistência guarda (RZ-104 → RZ-122). */
import type { JogoFacto, JogoNovo, Participacao } from "../persistencia/tipos";
import { eventoLesao } from "../lesoes/estado";
import type { EventoNovo } from "../persistencia/tipos";
import type { RelatorioJogo } from "./estatisticas";
import type { EquipaJogo, EventoJogo, ResumoJogo } from "./tipos";

export type MetaJogo = { id: string; competicao: string; epoca: number; jornada: number; data: string; importancia?: number; arbitro?: string; assistencia?: number; receita?: number; causa?: number };

/**
 * Converte o jogo simulado em `JogoNovo` + factos + participações, prontos para `Repositorio.registarJogo`.
 * Golos (G), assistências (A), penáltis falhados (P) e cartões (CA, CV; `extra` «2A» num vermelho por segundo amarelo) são factos; os onze jogam o jogo todo (substituições: RZ-215). Com o `relatorio` (RZ-105), as participações levam a nota.
 */
export function registoDoJogo(meta: MetaJogo, casa: EquipaJogo, fora: EquipaJogo, eventos: readonly EventoJogo[], resumo: ResumoJogo, relatorio?: RelatorioJogo): { jogo: JogoNovo; factos: JogoFacto[]; participacoes: Participacao[]; /** Eventos `LESAO` a acrescentar com `Repositorio.acrescentarEvento` (a seguir ao `registarJogo`). */ lesoes: EventoNovo[] } {
  const clube = { casa: casa.clube, fora: fora.clube };
  const factos: JogoFacto[] = [];
  for (const e of eventos) {
    if (e.tipo === "cartao") {
      factos.push({ minuto: e.minuto, tipo: e.cor === "amarelo" ? "CA" : "CV", jogador: e.jogador, clube: clube[e.lado], ...(e.segundoAmarelo ? { extra: "2A" } : {}) });
      continue;
    }
    if (e.tipo === "lesao") {
      factos.push({ minuto: e.minuto, tipo: "L", jogador: e.jogador, clube: clube[e.lado], extra: `gravidade:${e.lesao.gravidade}` });
      continue;
    }
    if (e.tipo === "substituicao") {
      factos.push({ minuto: e.minuto, tipo: "S", jogador: e.entra, clube: clube[e.lado], extra: `sai:${e.sai}` });
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
  /** Minuto em que o jogador saiu (lesão, expulsão) ou entrou (substituição). */
  const saida = (id: string) => eventos.find((e) => (e.tipo === "lesao" && e.jogador === id) || (e.tipo === "cartao" && e.cor === "vermelho" && e.jogador === id) || (e.tipo === "substituicao" && e.sai === id))?.minuto;
  const participar = (eq: EquipaJogo): Participacao[] => {
    const com = (id: string, titular: boolean, minutos: number): Participacao => {
      const n = nota(id);
      return { jogador: id, clube: eq.clube, titular, minutos, ...(n !== undefined ? { nota: n } : {}) };
    };
    const entradas = eventos.filter((e): e is Extract<EventoJogo, { tipo: "substituicao" }> => e.tipo === "substituicao" && (eq.banco ?? []).some((b) => b.id === e.entra));
    return [
      ...eq.onze.map((j) => com(j.id, true, saida(j.id) ?? resumo.duracao)),
      ...entradas.map((e) => com(e.entra, false, resumo.duracao - e.minuto)),
    ];
  };
  const participacoes: Participacao[] = [...participar(casa), ...participar(fora)];
  const lesoes: EventoNovo[] = eventos
    .filter((e): e is Extract<EventoJogo, { tipo: "lesao" }> => e.tipo === "lesao")
    .map((e) => eventoLesao({ jogador: e.jogador, clube: clube[e.lado], data: meta.data, epoca: meta.epoca, jornada: meta.jornada, lesao: e.lesao, jogo: meta.id, minuto: e.minuto }));
  return { jogo, factos, participacoes, lesoes };
}
