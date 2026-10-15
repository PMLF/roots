import { criarData } from "../calendario/datas";
import { PARAMETROS_PADRAO } from "../config/parametros";
import { VERSAO_ESQUEMA as ESQUEMA_BD } from "../persistencia/esquema";
import type { Repositorio } from "../persistencia/repositorio";
import { importarDados } from "../dados/importar";
import type { DadosBase, FontesCsv } from "../dados/tipos";
import { gerarMundo } from "../mundo/gerarMundo";
import { importarPaises, type Pais } from "../mundo/paises";
import { validarMundo } from "../mundo/validar";
import { Vista } from "../vista/vista";
import type { ClubeResumo, DiagnosticoBd, Mensagem, PedidosMotor, ProgressoMundo, ResumoMundoCriado, TipoPedido } from "./contratos";

export const VERSAO_MOTOR = "0.1.0";
export const VERSAO_ESQUEMA = ESQUEMA_BD;

/** O que o motor precisa do exterior. O worker fornece o SQLite do browser; os testes, memória. */
export type Servicos = {
  /** Texto dos CSV de `data/` (o worker vai buscá-los a /dados/; os testes lêem do disco). */
  carregarDados(): Promise<FontesCsv & { paises: string }>;
  abrirRepositorio(): Promise<{
    repositorio: Repositorio;
    backend: DiagnosticoBd["backend"];
    versaoSqlite: string;
    motivoMemoria?: string;
  }>;
};

/** Trata um pedido. Sem DOM nem worker, para ser testada diretamente. */
export async function tratar<K extends TipoPedido>(m: Mensagem<K>, servicos: Servicos, aoProgredir?: (p: ProgressoMundo) => void): Promise<PedidosMotor[K]["saida"]>;
export async function tratar(m: Mensagem, servicos: Servicos, aoProgredir: (p: ProgressoMundo) => void = () => undefined): Promise<unknown> {
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
    case "clubes": {
      const { dados } = await dadosDoJogo(servicos);
      return dados.clubes.map((c): ClubeResumo => ({ id: c.id, nome: c.nome, liga: c.liga }));
    }
    case "criarMundo":
      return criarMundo(m.entrada.seed, servicos, aoProgredir);
    case "plantel": {
      const { repositorio } = await servicos.abrirRepositorio();
      const clube = m.entrada.clube;
      const hoje = criarData(PARAMETROS_PADRAO.calendario.anoInicial, 7, 1);
      const vista = new Vista(repositorio, { observador: clube, participantes: new Set([`clube:${clube}`]), data: hoje, epoca: 1 }, PARAMETROS_PADRAO.conhecimento);
      return vista.plantel(clube);
    }
  }
}

type DadosDoJogo = { dados: DadosBase; paises: Pais[] };
const cache = new WeakMap<Servicos, Promise<DadosDoJogo>>();

/** Lê e valida os CSV uma vez por conjunto de serviços. */
function dadosDoJogo(servicos: Servicos): Promise<DadosDoJogo> {
  let p = cache.get(servicos);
  if (!p) {
    p = servicos.carregarDados().then((f) => {
      const d = importarDados(f);
      if (!d.ok) throw new Error("Dados inválidos:\n" + d.erros.join("\n"));
      const pa = importarPaises(f.paises);
      if (!pa.ok) throw new Error("Países inválidos:\n" + pa.erros.join("\n"));
      return { dados: d.dados, paises: pa.paises };
    });
    cache.set(servicos, p);
    p.catch(() => cache.delete(servicos));
  }
  return p;
}

async function criarMundo(seed: string, servicos: Servicos, aoProgredir: (p: ProgressoMundo) => void): Promise<ResumoMundoCriado> {
  const [{ repositorio }, { dados, paises }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
  if (repositorio.totalPessoas() > 0) {
    // reabrir um save que já tem mundo: não se gera outra vez
    return { seed: repositorio.meta("seed") ?? "?", clubes: dados.clubes.length, pessoas: repositorio.totalPessoas(), jogadores: Number(repositorio.meta("mundo.jogadores") ?? 0), ms: 0, avisos: [], jaExistia: true };
  }
  const t0 = Date.now();
  const params = PARAMETROS_PADRAO;
  const lote = gerarMundo({ seed, dados, paises, params, aoProgredir: (fase, feito, total) => aoProgredir({ fase, feito, total }) });
  aoProgredir({ fase: "validar", feito: 0, total: 1 });
  const v = validarMundo(lote, dados, paises, params);
  if (v.erros.length > 0) throw new Error("Mundo gerado inválido:\n" + v.erros.slice(0, 10).join("\n"));
  repositorio.transacao(() => {
    repositorio.definirMeta("seed", seed);
    repositorio.definirMeta("mundo.jogadores", String(lote.jogadores.length));
    repositorio.guardarMundo(lote, (feito, total) => aoProgredir({ fase: "guardar", feito, total }));
  });
  return { seed, clubes: dados.clubes.length, pessoas: lote.pessoas.length, jogadores: lote.jogadores.length, ms: Date.now() - t0, avisos: v.avisos, jaExistia: false };
}
