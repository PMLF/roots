import { PARAMETROS_PADRAO } from "../config/parametros";
import { VERSAO_ESQUEMA as ESQUEMA_BD } from "../persistencia/esquema";
import type { Repositorio } from "../persistencia/repositorio";
import type { DiagnosticoBd, Mensagem, PedidosMotor, TipoPedido } from "./contratos";

export const VERSAO_MOTOR = "0.1.0";
export const VERSAO_ESQUEMA = ESQUEMA_BD;

/** O que o motor precisa do exterior. O worker fornece o SQLite do browser; os testes, memória. */
export type Servicos = {
  abrirRepositorio(): Promise<{
    repositorio: Repositorio;
    backend: DiagnosticoBd["backend"];
    versaoSqlite: string;
    motivoMemoria?: string;
  }>;
};

/** Trata um pedido. Sem DOM nem worker, para ser testada diretamente. */
export async function tratar<K extends TipoPedido>(m: Mensagem<K>, servicos: Servicos): Promise<PedidosMotor[K]["saida"]>;
export async function tratar(m: Mensagem, servicos: Servicos): Promise<unknown> {
  switch (m.tipo) {
    case "ping":
      return { eco: m.entrada.eco, relogioMs: Date.now() };
    case "versao":
      return { motor: VERSAO_MOTOR, esquema: VERSAO_ESQUEMA };
    case "parametros":
      return PARAMETROS_PADRAO;
    case "bd": {
      const a = await servicos.abrirRepositorio();
      const r = a.repositorio;
      r.acrescentarEvento({ tipo: "DIAGNOSTICO", data: new Date().toISOString().slice(0, 10), epoca: 0, vis: "privado", entidades: [], dados: {} });
      const saida: DiagnosticoBd = {
        backend: a.backend,
        persistente: a.backend === "opfs",
        ...(a.motivoMemoria !== undefined ? { motivoMemoria: a.motivoMemoria } : {}),
        sqlite: a.versaoSqlite,
        esquema: r.versaoEsquema,
        aberturas: r.contar("DIAGNOSTICO"),
        eventos: r.totalEventos(),
      };
      return saida;
    }
  }
}
