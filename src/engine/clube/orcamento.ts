/**
 * Orçamento anual do clube (RZ-114): a massa salarial máxima (euros por ano) e o dinheiro para transferências (jogadores e
 * staff, líquido). Cada época os clubes ganham um orçamento por defeito calculado das receitas esperadas e da folga de caixa;
 * o gamer pode alterá-lo no seu clube. As transferências e as renovações (RZ-205 a RZ-207) respeitam-no.
 */
import type { Parametros } from "../config/parametros";
import type { ClubeBase, DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import { custosMensais, massaSalarialMensal, receitaAnualEstimada, saldoDoClube } from "./financas";

export type Orcamento = { epoca: number; massaSalarialMax: number; transferencias: number };

const arredondar = (v: number) => Math.round(v / 1000) * 1000;

/** O orçamento por defeito: a massa não fica abaixo da atual (ninguém nasce já em falta) nem do peso máximo sobre as receitas. */
export function orcamentoPorDefeito(repo: Repositorio, c: ClubeBase, params: Parametros, epoca: number): Orcamento {
  const o = params.financas.orcamento;
  const massaAtual = massaSalarialMensal(repo, c.id) * 12;
  const custos = custosMensais(repo, c, params);
  const reserva = o.reservaMeses * (custos.salarios + custos.staff + custos.estadio + custos.fixos);
  return {
    epoca,
    massaSalarialMax: arredondar(Math.max(massaAtual, receitaAnualEstimada(c, params) * o.massaSobreReceita)),
    transferencias: arredondar(Math.max(0, saldoDoClube(repo, c) - reserva) * o.folgaTransferencias),
  };
}

/** O orçamento em vigor: o guardado para esta época ou, se ainda não houver, o que seria por defeito. */
export function orcamentoDoClube(repo: Repositorio, c: ClubeBase, params: Parametros, epoca: number): Orcamento {
  const v = repo.meta(`orcamento.${c.id}`);
  if (v) {
    const o = JSON.parse(v) as Orcamento;
    if (o.epoca === epoca) return o;
  }
  return orcamentoPorDefeito(repo, c, params, epoca);
}

/** No arranque de cada época dá a todos os clubes o orçamento por defeito (guarda o que o gamer escolheu até ao fim da época). */
export function garantirOrcamentos(repo: Repositorio, dados: DadosBase, params: Parametros, epoca: number): void {
  if (repo.meta("orcamento.epoca") === String(epoca)) return;
  for (const c of dados.clubes) repo.definirMeta(`orcamento.${c.id}`, JSON.stringify(orcamentoPorDefeito(repo, c, params, epoca)));
  repo.definirMeta("orcamento.epoca", String(epoca));
}

export type PedidoOrcamento = { massaSalarialMax: number; transferencias: number };

/** O gamer redefine o orçamento do seu clube. As transferências não passam do que há em caixa. */
export function definirOrcamento(repo: Repositorio, c: ClubeBase, params: Parametros, epoca: number, pedido: PedidoOrcamento): Orcamento {
  for (const [k, v] of Object.entries(pedido)) if (!Number.isFinite(v) || v < 0) throw new Error(`Orçamento inválido: ${k}`);
  if (pedido.transferencias > Math.max(0, saldoDoClube(repo, c))) throw new Error("As transferências não podem passar do que há em caixa");
  const o: Orcamento = { epoca, massaSalarialMax: arredondar(pedido.massaSalarialMax), transferencias: arredondar(pedido.transferencias) };
  repo.definirMeta(`orcamento.${c.id}`, JSON.stringify(o));
  return o;
}
