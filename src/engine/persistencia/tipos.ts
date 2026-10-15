/**
 * Tipos da camada de persistência (RZ-128). Ver docs/HISTORICO_EVENTOS.md.
 * O motor só conhece estes tipos e a interface `Repositorio`; o SQLite é um pormenor.
 */

/** 'AAAA-MM-DD' no calendário do jogo. */
export type Data = string;

export type Visibilidade = "publico" | "privado" | "secreto";
export type TipoEntidade = "clube" | "pessoa" | "cidade" | "competicao" | "jogo";
export type Origem = "jogo" | "gerado";

export type EntidadeRef = { k: TipoEntidade; id: string; papel?: string };

/** O que o motor entrega para acrescentar; `id` e `v` atribuem-se ao gravar. */
export type EventoNovo = {
  tipo: string;
  /** Versão do esquema de `dados` para este tipo (por omissão 1). */
  v?: number;
  data: Data;
  epoca: number;
  jornada?: number;
  vis: Visibilidade;
  entidades: EntidadeRef[];
  causa?: number;
  /** Só em eventos CORRECAO. */
  corrige?: number;
  origem?: Origem;
  dados: Record<string, unknown>;
};

export type Evento = Required<Omit<EventoNovo, "jornada" | "causa" | "corrige">> & {
  id: number;
  jornada?: number;
  causa?: number;
  corrige?: number;
};

/** Códigos de `jogo_facto`: G golo, A assistência, CA amarelo, CV vermelho, L lesão, S substituição, P penálti falhado. */
export type TipoFacto = "G" | "A" | "CA" | "CV" | "L" | "S" | "P";

export type JogoFacto = {
  minuto: number;
  tipo: TipoFacto;
  jogador: string;
  /** Em G: o clube a quem o golo é creditado (num auto-golo, o adversário do jogador). */
  clube: string;
  /** p. ex. 'penalti', 'auto', 'gravidade:3'. */
  extra?: string;
};

export type Participacao = { jogador: string; clube: string; titular: boolean; minutos: number; nota?: number };

export type JogoNovo = {
  id: string;
  competicao: string;
  epoca: number;
  jornada: number;
  data: Data;
  casa: string;
  fora: string;
  golosCasa: number;
  golosFora: number;
  xgCasa?: number;
  xgFora?: number;
  posseCasa?: number;
  assistencia?: number;
  receita?: number;
  importancia?: number;
  arbitro?: string;
  causa?: number;
};

export type Jogo = Required<Omit<JogoNovo, "causa">> & { evento: number };

export type LinhaClassificacao = {
  clube: string;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  golosMarcados: number;
  golosSofridos: number;
  /** Pontos dos jogos, sem ajustes. */
  pontosJogos: number;
  /** Soma dos ajustes (sanções retroativas). */
  ajuste: number;
  pontos: number;
};

export type LinhaStatJogador = {
  jogador: string;
  epoca: number;
  clube: string;
  competicao: string;
  jogos: number;
  minutos: number;
  golos: number;
  assistencias: number;
  amarelos: number;
  vermelhos: number;
};

export type Marcador = { jogador: string; clube: string; minuto: number; jogo: string };

export type Observacao = {
  id: number;
  observador: string;
  alvoK: TipoEntidade;
  alvoId: string;
  /** atributos | personalidade | potencial | financas | contrato */
  grupo: string;
  valores: Record<string, unknown>;
  qualidade: number;
  fonte: string;
  data: Data;
  epoca: number;
};
export type ObservacaoNova = Omit<Observacao, "id">;

export type AjusteClassificacao = {
  competicao: string;
  epoca: number;
  clube: string;
  pontos: number;
  /** Evento (p. ex. SANCAO_APLICADA) que justifica o ajuste. */
  evento: number;
};

export type PontosPorResultado = { vitoria: number; empate: number };

/** Jogo marcado no calendário (ainda sem resultado). Ao ser jogado passa a `jogo` (mesmo `id`). */
export type JogoAgendado = { id: string; competicao: string; epoca: number; jornada: number; data: Data; casa: string; fora: string };
/** Clube que folga numa jornada de uma liga com número ímpar de clubes. */
export type FolgaAgendada = { competicao: string; epoca: number; jornada: number; clube: string };
