/**
 * Laboratório (pedido do Pedro, 15-10-2026; RZ-139): simula **sem gravar nada no save** um jogo entre dois clubes ou uma
 * liga inteira com o mundo gerado, para ver o motor a funcionar e dar feedback enquanto o ciclo de dias (RZ-119) não existe.
 * Usa o mesmo motor, o mesmo calendário e os mesmos desempates do jogo a sério; um repositório em memória guarda a liga.
 */
import { Rng } from "../aleatorio/rng";
import { gerarCalendarioLiga, paraRepositorio } from "../calendario/calendario";
import { ordenarClassificacao } from "../competicao/classificacao";
import type { Parametros, Escalao } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { FORMACOES, TATICA_PADRAO } from "../jogo/formacoes";
import { onzeAutomatico, type CandidatoOnze } from "../jogo/equipa";
import { jogarJogo } from "../jogo/detalhe";
import type { RelatorioJogo } from "../jogo/estatisticas";
import type { EquipaJogo, FormacaoId, Tatica } from "../jogo/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";

export type CompeticaoResumo = { liga: string; escalao: Escalao; clubes: number };

/** As ligas/séries do mundo, da mais alta para a mais baixa. */
export function competicoesDoMundo(dados: DadosBase): CompeticaoResumo[] {
  const ordem: Escalao[] = ["primeiraLiga", "segundaLiga", "terceiraLiga", "cp", "distrital"];
  const m = new Map<string, CompeticaoResumo>();
  for (const c of dados.clubes) {
    const l = m.get(c.liga) ?? m.set(c.liga, { liga: c.liga, escalao: c.escalao, clubes: 0 }).get(c.liga)!;
    l.clubes++;
  }
  return [...m.values()].sort((a, b) => ordem.indexOf(a.escalao) - ordem.indexOf(b.escalao) || a.liga.localeCompare(b.liga, "pt"));
}

function candidatos(repo: Repositorio, clube: string): CandidatoOnze[] {
  return repo
    .jogadoresDoClube(clube)
    .filter((j) => j.estado === "ativo")
    .map((j) => ({ pessoa: j.pessoa, posicoes: j.posicoes, atributos: j.atributos, alturaCm: j.alturaCm }));
}

function equipa(clube: string, cands: readonly CandidatoOnze[], tatica?: Partial<Tatica>): EquipaJogo {
  const t: Tatica = { ...TATICA_PADRAO, ...tatica };
  return { clube, onze: onzeAutomatico(cands, FORMACOES[t.formacao]), tatica: t };
}

export type JogoLab = {
  casa: { id: string; nome: string; tatica: Tatica };
  fora: { id: string; nome: string; tatica: Tatica };
  relatorio: RelatorioJogo;
  /** Nome de cada jogador que apareceu no relatório. */
  nomes: Record<string, string>;
  /** Quem começou: posição ocupada e nome. */
  onzes: { casa: { id: string; posicao: string }[]; fora: { id: string; posicao: string }[] };
  historias: string[];
};

export function jogoLab(
  repo: Repositorio,
  dados: DadosBase,
  params: Parametros,
  e: { casa: string; fora: string; seed: string; taticaCasa?: Partial<Tatica>; taticaFora?: Partial<Tatica> },
): JogoLab {
  const cc = dados.clubes.find((c) => c.id === e.casa);
  const cf = dados.clubes.find((c) => c.id === e.fora);
  if (!cc || !cf) throw new Error("Clube desconhecido");
  if (cc.id === cf.id) throw new Error("Escolhe dois clubes diferentes");
  const casa = equipa(cc.id, candidatos(repo, cc.id), e.taticaCasa);
  const fora = equipa(cf.id, candidatos(repo, cf.id), e.taticaFora);
  const r = jogarJogo({ seed: e.seed, id: `lab-${e.seed}`, casa, fora }, 0, { id: `lab-${e.seed}`, competicao: "LAB", epoca: 0, jornada: 1, data: "2026-08-15" }, params);
  if (r.nivel !== 0) throw new Error("nível inesperado");
  const nomes: Record<string, string> = {};
  for (const c of [cc.id, cf.id]) for (const p of repo.plantelPublico(c)) nomes[p.id] = p.nomeDesportivo;
  return {
    casa: { id: cc.id, nome: cc.nome, tatica: casa.tatica as Tatica },
    fora: { id: cf.id, nome: cf.nome, tatica: fora.tatica as Tatica },
    relatorio: r.relatorio,
    nomes,
    onzes: { casa: casa.onze.map((j) => ({ id: j.id, posicao: j.posicao })), fora: fora.onze.map((j) => ({ id: j.id, posicao: j.posicao })) },
    historias: r.historias.map((h) => h.tipo),
  };
}

export type LinhaLiga = {
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
  reputacao: number;
};

export type LigaLab = {
  liga: string;
  escalao: Escalao;
  jornadas: number;
  jogos: number;
  tabela: LinhaLiga[];
  artilheiros: { jogador: string; nome: string; clube: string; golos: number }[];
  totais: { golosPorJogo: number; amarelosPorJogo: number; vermelhosPorJogo: number; lesoesPorJogo: number; goleadas: number; hatTricks: number; ms: number };
};

export function ligaLab(repo: Repositorio, dados: DadosBase, params: Parametros, e: { liga: string; seed: string; formacao?: FormacaoId }): LigaLab {
  const t0 = Date.now();
  const clubes = dados.clubes.filter((c) => c.liga === e.liga);
  if (clubes.length < 2) throw new Error("Liga desconhecida");
  const escalao = (clubes[0] as { escalao: Escalao }).escalao;
  const equipas = new Map(clubes.map((c) => [c.id, equipa(c.id, candidatos(repo, c.id), e.formacao ? { formacao: e.formacao } : undefined)]));
  const cal = gerarCalendarioLiga({ competicao: e.liga, escalao, clubes: clubes.map((c) => c.id) }, 1, params.calendario, new Rng(`${e.seed}|cal|${e.liga}`));
  const { jogos } = paraRepositorio(cal);
  const mem = new RepositorioMemoria();
  const golos = new Map<string, { clube: string; golos: number }>();
  let amarelos = 0, vermelhos = 0, lesoes = 0, goleadas = 0, hatTricks = 0;
  for (const g of [...jogos].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1))) {
    const r = jogarJogo({ seed: e.seed, id: g.id, casa: equipas.get(g.casa) as EquipaJogo, fora: equipas.get(g.fora) as EquipaJogo }, 1, { id: g.id, competicao: g.competicao, epoca: g.epoca, jornada: g.jornada, data: g.data }, params);
    mem.registarJogo(r.registo.jogo, r.registo.factos, r.registo.participacoes);
    for (const f of r.registo.factos) {
      if (f.tipo === "G" && f.extra !== "auto") golos.set(f.jogador, { clube: f.clube, golos: (golos.get(f.jogador)?.golos ?? 0) + 1 });
      if (f.tipo === "CA") amarelos++;
      if (f.tipo === "CV") vermelhos++;
    }
    lesoes += r.registo.lesoes.length;
    for (const h of r.historias) {
      if (h.tipo === "GOLEADA") goleadas++;
      if (h.tipo === "HATTRICK") hatTricks++;
    }
  }
  const rep = new Map(clubes.map((c) => [c.id, c.reputacao] as const));
  const nome = new Map(clubes.map((c) => [c.id, c.nome] as const));
  const tabela = ordenarClassificacao(mem.classificacao(e.liga, 1), mem.jogosDaCompeticao(e.liga, 1), params.desempate[escalao === "cp" || escalao === "distrital" ? "promocao" : "liga"], {
    pontosVitoria: params.classificacao.pontosVitoria,
    pontosEmpate: params.classificacao.pontosEmpate,
    seed: e.seed,
    competicao: e.liga,
    epoca: 1,
    reputacao: rep,
    clubes: clubes.map((c) => c.id),
  }).map((l): LinhaLiga => ({
    posicao: l.posicao, clube: l.clube, nome: nome.get(l.clube) ?? l.clube, jogos: l.jogos, vitorias: l.vitorias, empates: l.empates, derrotas: l.derrotas,
    golosMarcados: l.golosMarcados, golosSofridos: l.golosSofridos, diferenca: l.diferenca, pontos: l.pontos, reputacao: rep.get(l.clube) ?? 0,
    ...(l.desempatePor ? { desempatePor: l.desempatePor } : {}),
  }));
  const nomes = new Map<string, string>();
  for (const c of clubes) for (const p of repo.plantelPublico(c.id)) nomes.set(p.id, p.nomeDesportivo);
  const n = jogos.length || 1;
  return {
    liga: e.liga,
    escalao,
    jornadas: cal.jornadas.length,
    jogos: jogos.length,
    tabela,
    artilheiros: [...golos.entries()]
      .sort((a, b) => b[1].golos - a[1].golos || (a[0] < b[0] ? -1 : 1))
      .slice(0, 10)
      .map(([jogador, v]) => ({ jogador, nome: nomes.get(jogador) ?? jogador, clube: nome.get(v.clube) ?? v.clube, golos: v.golos })),
    totais: {
      golosPorJogo: tabela.reduce((s, l) => s + l.golosMarcados, 0) / n,
      amarelosPorJogo: amarelos / n,
      vermelhosPorJogo: vermelhos / n,
      lesoesPorJogo: lesoes / n,
      goleadas: goleadas,
      hatTricks,
      ms: Date.now() - t0,
    },
  };
}
