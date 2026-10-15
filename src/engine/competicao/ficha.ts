/**
 * Ficha de uma liga ou série (RZ-145): clubes, classificação e calendário. Lê o repositório; se a época ainda não tem
 * calendário gravado (antes do ciclo de dias, RZ-119) mostra uma **prévia** gerada com a semente do mundo, sem gravar nada.
 */
import { Rng } from "../aleatorio/rng";
import { gerarCalendarioLiga, paraRepositorio } from "../calendario/calendario";
import { nivelDeReputacao } from "../clube/reputacao";
import type { Escalao, NivelReputacao, Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { JogoAgendado } from "../persistencia/tipos";
import { tabelaDaCompeticao } from "./tabela";

export type LinhaCompeticao = {
  posicao: number;
  clube: string;
  nome: string;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golosMarcados: number;
  golosSofridos: number;
  diferenca: number;
  pontos: number;
  desempatePor?: string;
};

export type JornadaCompeticao = { numero: number; data: string; jogos: { id: string; casa: string; fora: string; casaNome: string; foraNome: string; golosCasa?: number; golosFora?: number }[]; folga?: string };

export type FichaCompeticaoDados = {
  liga: string;
  escalao: Escalao;
  distrito?: string;
  epoca: number;
  /** Calendário gerado só para mostrar (ainda não está gravado no save). */
  previa: boolean;
  clubes: { id: string; nome: string; localidade: string; reputacao: number; nivelReputacao: NivelReputacao; capacidade: number }[];
  tabela: LinhaCompeticao[];
  jornadas: JornadaCompeticao[];
  jogosJogados: number;
  jogosTotais: number;
};

export function fichaCompeticao(repo: Repositorio, dados: DadosBase, params: Parametros, liga: string, epoca = 1): FichaCompeticaoDados | undefined {
  const clubes = dados.clubes.filter((c) => c.liga === liga);
  if (clubes.length < 2) return undefined;
  const escalao = (clubes[0] as { escalao: Escalao }).escalao;
  const nome = new Map(clubes.map((c) => [c.id, c.nome] as const));
  const rep = new Map(clubes.map((c) => [c.id, c.reputacao] as const));
  const seed = repo.meta("seed") ?? "?";

  let { jogos, folgas } = repo.calendario(liga, epoca);
  let previa = false;
  const datas = new Map<number, string>();
  if (jogos.length === 0) {
    previa = true;
    const cal = gerarCalendarioLiga({ competicao: liga, escalao, clubes: clubes.map((c) => c.id) }, epoca, params.calendario, new Rng(`${seed}|cal|${liga}`));
    ({ jogos, folgas } = paraRepositorio(cal));
  }
  for (const j of jogos) datas.set(j.jornada, j.data);
  const resultados = new Map(repo.jogosDaCompeticao(liga, epoca).map((j) => [j.id, j] as const));
  const porJornada = new Map<number, JogoAgendado[]>();
  for (const j of jogos) (porJornada.get(j.jornada) ?? porJornada.set(j.jornada, []).get(j.jornada)!).push(j);
  const jornadas = [...porJornada.keys()].sort((a, b) => a - b).map((n): JornadaCompeticao => {
    const folga = folgas.find((f) => f.jornada === n)?.clube;
    return {
      numero: n,
      data: datas.get(n) ?? "",
      jogos: (porJornada.get(n) ?? []).map((j) => {
        const r = resultados.get(j.id) as { golosCasa?: number; golosFora?: number } | undefined;
        return { id: j.id, casa: j.casa, fora: j.fora, casaNome: nome.get(j.casa) ?? j.casa, foraNome: nome.get(j.fora) ?? j.fora, ...(r?.golosCasa !== undefined ? { golosCasa: r.golosCasa } : {}), ...(r?.golosFora !== undefined ? { golosFora: r.golosFora } : {}) };
      }),
      ...(folga ? { folga: nome.get(folga) ?? folga } : {}),
    };
  });

  const tabela = tabelaDaCompeticao(repo, liga, epoca, escalao === "cp" || escalao === "distrital" ? "promocao" : "liga", params, { seed, reputacao: rep });
  // Sem calendário gravado a tabela não conhece os clubes: completa-se com todos a zeros, por reputação.
  const linhas: LinhaCompeticao[] = tabela.length > 0
    ? tabela.map((l) => ({ posicao: l.posicao, clube: l.clube, nome: nome.get(l.clube) ?? l.clube, jogos: l.jogos, vitorias: l.vitorias, empates: l.empates, derrotas: l.derrotas, golosMarcados: l.golosMarcados, golosSofridos: l.golosSofridos, diferenca: l.diferenca, pontos: l.pontos, ...(l.desempatePor ? { desempatePor: l.desempatePor } : {}) }))
    : [...clubes].sort((a, b) => b.reputacao - a.reputacao || a.nome.localeCompare(b.nome, "pt")).map((c, i) => ({ posicao: i + 1, clube: c.id, nome: c.nome, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golosMarcados: 0, golosSofridos: 0, diferenca: 0, pontos: 0 }));

  return {
    liga,
    escalao,
    ...(escalao === "distrital" ? { distrito: (clubes[0] as { distrito: string }).distrito } : {}),
    epoca,
    previa,
    clubes: [...clubes]
      .sort((a, b) => b.reputacao - a.reputacao || a.nome.localeCompare(b.nome, "pt"))
      .map((c) => ({ id: c.id, nome: c.nome, localidade: c.localidade, reputacao: c.reputacao, nivelReputacao: nivelDeReputacao(c.reputacao, params), capacidade: c.estadio.capacidade })),
    tabela: linhas,
    jornadas,
    jogosJogados: resultados.size,
    jogosTotais: jogos.length,
  };
}
