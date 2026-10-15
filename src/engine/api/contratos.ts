import type { Parametros } from "../config/parametros";
import type { PessoaVista } from "../vista/tipos";

/** Resultado do autodiagnóstico da base de dados (RZ-128): escreve um evento e lê-o de volta. */
export type DiagnosticoBd = {
  backend: "opfs" | "memoria";
  /** Verdadeiro se os dados sobrevivem a recarregar a página. */
  persistente: boolean;
  motivoMemoria?: string;
  sqlite: string;
  esquema: number;
  /** Total de eventos DIAGNOSTICO guardados neste save (sobe a cada abertura se for persistente). */
  aberturas: number;
  /** Eventos totais no save. */
  eventos: number;
};

export type ProgressoMundo = { fase: string; feito: number; total: number };

export type ResumoMundoCriado = {
  seed: string;
  clubes: number;
  pessoas: number;
  jogadores: number;
  /** Tempo de geração + gravação neste pedido (0 se o mundo já existia). */
  ms: number;
  /** Avisos de calibração da validação (não bloqueiam). */
  avisos: string[];
  /** O save já tinha mundo (não se gera outra vez). */
  jaExistia: boolean;
};

export type ClubeResumo = { id: string; nome: string; liga: string };

/** Contrato entre a interface e o motor (que corre num Web Worker). Só dados serializáveis. */
export type PedidosMotor = {
  ping: { entrada: { eco: string }; saida: { eco: string; relogioMs: number } };
  versao: { entrada: null; saida: { motor: string; esquema: number } };
  parametros: { entrada: null; saida: Parametros };
  bd: { entrada: null; saida: DiagnosticoBd };
  /** Cria o mundo do save (RZ-103). Emite progresso; se o save já tem mundo, devolve o resumo sem gerar. */
  criarMundo: { entrada: { seed: string }; saida: ResumoMundoCriado };
  clubes: { entrada: null; saida: ClubeResumo[] };
  /** Plantel público de um clube, lido através da `Vista` (sem atributos, potencial nem personalidade). */
  plantel: { entrada: { clube: string }; saida: PessoaVista[] };
};

export type TipoPedido = keyof PedidosMotor;

export type Mensagem<K extends TipoPedido = TipoPedido> = {
  [T in K]: { id: number; tipo: T; entrada: PedidosMotor[T]["entrada"] };
}[K];

export type RespostaMotor =
  | { id: number; ok: true; saida: unknown }
  | { id: number; ok: false; erro: string }
  /** Progresso de um pedido demorado; o resultado final chega depois como `ok`. */
  | { id: number; progresso: ProgressoMundo };
