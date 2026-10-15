import { PARAMETROS_PADRAO } from "../config/parametros";
import type { Mensagem, PedidosMotor, TipoPedido } from "./contratos";

export const VERSAO_MOTOR = "0.1.0";
export const VERSAO_ESQUEMA = 1;

/** Trata um pedido. Função pura (sem DOM nem worker) para ser testada diretamente. */
export function tratar<K extends TipoPedido>(m: Mensagem<K>): PedidosMotor[K]["saida"];
export function tratar(m: Mensagem): unknown {
  switch (m.tipo) {
    case "ping":
      return { eco: m.entrada.eco, relogioMs: Date.now() };
    case "versao":
      return { motor: VERSAO_MOTOR, esquema: VERSAO_ESQUEMA };
    case "parametros":
      return PARAMETROS_PADRAO;
  }
}
