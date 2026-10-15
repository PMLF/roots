import type { Parametros } from "../config/parametros";

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

/** Contrato entre a interface e o motor (que corre num Web Worker). Só dados serializáveis. */
export type PedidosMotor = {
  ping: { entrada: { eco: string }; saida: { eco: string; relogioMs: number } };
  versao: { entrada: null; saida: { motor: string; esquema: number } };
  parametros: { entrada: null; saida: Parametros };
  bd: { entrada: null; saida: DiagnosticoBd };
};

export type TipoPedido = keyof PedidosMotor;

export type Mensagem<K extends TipoPedido = TipoPedido> = {
  [T in K]: { id: number; tipo: T; entrada: PedidosMotor[T]["entrada"] };
}[K];

export type RespostaMotor = { id: number; ok: true; saida: unknown } | { id: number; ok: false; erro: string };
