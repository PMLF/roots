/**
 * Controlo de jornadas (RZ-110): em que jornada está uma competição, o que falta jogar e o que está em atraso.
 * Puro: recebe o calendário e os ids dos jogos já jogados (um jogo jogado tem o mesmo id do jogo agendado).
 */
import { comparar } from "../calendario/datas";
import type { Data, JogoAgendado } from "../persistencia/tipos";

export type EstadoJornada = {
  jornada: number;
  /** Data prevista (a do primeiro jogo). */
  data: Data;
  jogos: number;
  jogados: number;
  completa: boolean;
  /** Jogos desta jornada com data já passada e ainda por jogar. */
  emAtraso: number;
};

export type EstadoCompeticao = {
  competicao: string;
  epoca: number;
  jornadas: EstadoJornada[];
  /** A primeira jornada ainda incompleta; `undefined` se a competição terminou. */
  jornadaAtual?: number;
  jogosTotal: number;
  jogosJogados: number;
  jogosPorJogar: number;
  terminada: boolean;
  /** Data do próximo jogo por jogar (pode ser anterior a `hoje` se há atrasos). */
  proximaData?: Data;
  emAtraso: JogoAgendado[];
};

export function estadoCompeticao(competicao: string, epoca: number, calendario: readonly JogoAgendado[], jogados: ReadonlySet<string>, hoje: Data): EstadoCompeticao {
  const jogos = calendario.filter((j) => j.competicao === competicao && j.epoca === epoca);
  const porJornada = new Map<number, JogoAgendado[]>();
  for (const j of jogos) (porJornada.get(j.jornada) ?? porJornada.set(j.jornada, []).get(j.jornada)!).push(j);
  const jornadas: EstadoJornada[] = [...porJornada.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([jornada, js]) => {
      const feitos = js.filter((j) => jogados.has(j.id)).length;
      const atraso = js.filter((j) => !jogados.has(j.id) && comparar(j.data, hoje) < 0).length;
      const data = js.reduce((m, j) => (comparar(j.data, m) < 0 ? j.data : m), (js[0] as JogoAgendado).data);
      return { jornada, data, jogos: js.length, jogados: feitos, completa: feitos === js.length, emAtraso: atraso };
    });
  const porJogar = jogos.filter((j) => !jogados.has(j.id));
  const atual = jornadas.find((j) => !j.completa);
  const proxima = porJogar.reduce<Data | undefined>((m, j) => (m === undefined || comparar(j.data, m) < 0 ? j.data : m), undefined);
  return {
    competicao,
    epoca,
    jornadas,
    ...(atual ? { jornadaAtual: atual.jornada } : {}),
    jogosTotal: jogos.length,
    jogosJogados: jogos.length - porJogar.length,
    jogosPorJogar: porJogar.length,
    terminada: jogos.length > 0 && porJogar.length === 0,
    ...(proxima ? { proximaData: proxima } : {}),
    emAtraso: porJogar.filter((j) => comparar(j.data, hoje) < 0).sort((a, b) => comparar(a.data, b.data) || a.jornada - b.jornada || (a.id < b.id ? -1 : 1)),
  };
}

/** Os jogos por jogar com data até `hoje` (inclusive), os atrasados primeiro: o que o loop de dias tem de jogar. */
export function jogosParaJogar(calendario: readonly JogoAgendado[], jogados: ReadonlySet<string>, hoje: Data): JogoAgendado[] {
  return calendario
    .filter((j) => !jogados.has(j.id) && comparar(j.data, hoje) <= 0)
    .sort((a, b) => comparar(a.data, b.data) || a.competicao.localeCompare(b.competicao) || a.jornada - b.jornada || (a.id < b.id ? -1 : 1));
}
