import type {
  AjusteClassificacao,
  CargoReg,
  ContratoReg,
  Data,
  EntidadeRef,
  Evento,
  EventoNovo,
  FolgaAgendada,
  Jogo,
  JogoAgendado,
  JogoFacto,
  JogadorReg,
  JogoNovo,
  LinhaClassificacao,
  LinhaStatJogador,
  Marcador,
  Observacao,
  ObservacaoNova,
  Participacao,
  PessoaPublica,
  PessoaReg,
  LoteMundoReg,
  Visibilidade,
} from "./tipos";

export type FiltroEventos = {
  /** Só eventos públicos (o que qualquer interessado pode ver). Atalho de `vis: ["publico"]`. */
  apenasPublicos?: boolean;
  /** Só eventos com estas visibilidades. */
  vis?: readonly Visibilidade[];
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
  totalEventos(): number;
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

  // --- calendário (RZ-102)
  /** Guarda o calendário de uma liga numa época. Recusa se já existir calendário dessa competição/época. */
  guardarCalendario(jogos: readonly JogoAgendado[], folgas: readonly FolgaAgendada[]): void;
  /** Por jornada e, dentro dela, por id. */
  calendario(competicao: string, epoca: number): { jogos: JogoAgendado[]; folgas: FolgaAgendada[] };
  /** Jogos de um clube na época (casa ou fora), por data. */
  calendarioDoClube(clube: string, epoca: number): JogoAgendado[];
  /** Primeiro jogo marcado do clube em `desde` ou depois. */
  proximoJogo(clube: string, desde: Data): JogoAgendado | undefined;

  // --- pessoas (RZ-103)
  /** Guarda o mundo gerado numa só transação (`aoProgredir` é chamado por lotes). Recusa se já existirem pessoas. */
  guardarMundo(lote: LoteMundoReg, aoProgredir?: (feito: number, total: number) => void): void;
  totalPessoas(): number;
  /** Factos públicos de uma pessoa: nome, idade, clube, posição, corpo. Nunca atributos, potencial nem personalidade. */
  pessoaPublica(id: string): PessoaPublica | undefined;
  /** Plantel público de um clube (jogadores ativos, por posição e nome). */
  plantelPublico(clube: string): PessoaPublica[];
  /** Cargos (presidente, treinador…) públicos de um clube ou cidade. */
  cargosPublicos(filtro: { clube?: string; cidade?: string }): PessoaPublica[];
  // verdade oculta (só o motor: simulação, geração, observações)
  pessoa(id: string): PessoaReg | undefined;
  jogador(pessoa: string): JogadorReg | undefined;
  contrato(pessoa: string): ContratoReg | undefined;
  cargo(pessoa: string): CargoReg | undefined;
  jogadoresDoClube(clube: string): JogadorReg[];

  // --- conhecimento
  acrescentarObservacao(o: ObservacaoNova): number;
  /** Mais recentes primeiro. */
  observacoes(observador: string, alvo: Pick<EntidadeRef, "k" | "id">, grupo?: string): Observacao[];
}

export type { Data };
