import type {
  AjusteClassificacao,
  Data,
  EntidadeRef,
  Evento,
  EventoNovo,
  Jogo,
  JogoFacto,
  JogoNovo,
  LinhaClassificacao,
  LinhaStatJogador,
  Marcador,
  Observacao,
  ObservacaoNova,
  Participacao,
} from "./tipos";

export type FiltroEventos = {
  /** Só eventos públicos (o que qualquer interessado pode ver). */
  apenasPublicos?: boolean;
  tipo?: string;
  desdeEpoca?: number;
  ateEpoca?: number;
  limite?: number;
};

/**
 * Porta de persistência do motor. Síncrona (o motor corre num worker e os dois SQLite são síncronos).
 * Adaptadores: memória (testes rápidos), SQLite (Node e browser). Todos passam na mesma bateria de testes.
 * A história é só de acrescentar; as derivadas atualizam-se na mesma transação e são reconstruíveis.
 */
export interface Repositorio {
  readonly versaoEsquema: number;

  /** Atómico e encadeável: se `fn` lançar, desfaz tudo o que fez (incluindo transações internas). */
  transacao<T>(fn: () => T): T;

  // --- metadados do save (seed, versão do motor, …)
  meta(chave: string): string | undefined;
  definirMeta(chave: string, valor: string): void;

  // --- história
  acrescentarEvento(e: EventoNovo): number;
  evento(id: number): Evento | undefined;
  /** Mais recentes primeiro. */
  eventosDe(entidade: Pick<EntidadeRef, "k" | "id">, filtro?: FiltroEventos): Evento[];
  contar(tipo: string, entidade?: Pick<EntidadeRef, "k" | "id">, intervalo?: { desdeEpoca?: number; ateEpoca?: number }): number;
  ultimo(tipo: string, entidade: Pick<EntidadeRef, "k" | "id">): Evento | undefined;
  /** Os `n` eventos mais recentes do tipo para a entidade (mais recente primeiro). Rege "3 derrotas seguidas", etc. */
  ultimos(tipo: string, entidade: Pick<EntidadeRef, "k" | "id">, n: number): Evento[];
  /** O evento, as suas causas (para trás) e os seus efeitos (para a frente), por ordem de id. */
  cadeia(eventoId: number): Evento[];
  /** Todos os eventos por ordem de id, uma linha JSON cada (crónica, partilha, depuração). */
  exportarNdjson(): string;

  // --- jogos (factos compactos) + derivadas
  registarJogo(jogo: JogoNovo, factos: JogoFacto[], participacoes: Participacao[]): { evento: number };
  jogo(id: string): Jogo | undefined;
  marcadores(competicao: string, epoca: number, jornada: number): Marcador[];
  classificacao(competicao: string, epoca: number): LinhaClassificacao[];
  statsJogador(jogador: string): LinhaStatJogador[];
  /** Acrescenta uma sanção retroativa: não reescreve nenhum jogo nem evento. */
  ajustarClassificacao(a: AjusteClassificacao): void;
  /** Recalcula todas as derivadas a partir da história. Deve dar o mesmo que o incremental. */
  reconstruirDerivadas(): void;

  // --- conhecimento
  acrescentarObservacao(o: ObservacaoNova): number;
  /** Mais recentes primeiro. */
  observacoes(observador: string, alvo: Pick<EntidadeRef, "k" | "id">, grupo?: string): Observacao[];
}

export type { Data };
