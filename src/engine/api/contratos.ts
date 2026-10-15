import type { Parametros } from "../config/parametros";

/** Contrato entre a interface e o motor (que corre num Web Worker). Só dados serializáveis. */
export type PedidosMotor = {
  ping: { entrada: { eco: string }; saida: { eco: string; relogioMs: number } };
  versao: { entrada: null; saida: { motor: string; esquema: number } };
  parametros: { entrada: null; saida: Parametros };
};

export type TipoPedido = keyof PedidosMotor;

export type Mensagem<K extends TipoPedido = TipoPedido> = {
  [T in K]: { id: number; tipo: T; entrada: PedidosMotor[T]["entrada"] };
}[K];

export type RespostaMotor = { id: number; ok: true; saida: unknown } | { id: number; ok: false; erro: string };
