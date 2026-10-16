/**
 * Finanças do clube (RZ-114; docs/HISTORICO_EVENTOS.md §5.1). O dinheiro de cada clube é um livro de lançamentos:
 * - `saldo.<clube>` (meta) é a derivada do saldo; arranca no capital inicial do CSV (`ClubeBase.financas`);
 * - `lancar` soma um valor (receita > 0, despesa < 0) a uma categoria do mês corrente (`mes.<clube>`);
 * - `fecharMes` grava o evento privado `FECHO_FINANCEIRO` por clube com o saldo e o resumo do mês, e zera o mês.
 * Valores em `parametros.financas.modelo`. A UI nunca lê isto: só o clube do gamer em exato e, para os outros, a palavra de `estadoFinanceiro`.
 */
import { Rng } from "../aleatorio/rng";
import type { Escalao, Parametros } from "../config/parametros";
import type { ClubeBase, DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";

export type CategoriaFinanceira = "bilheteira" | "patrocinios" | "comercial" | "premios" | "salarios" | "staff" | "estadio" | "fixos";
export type Mes = Partial<Record<CategoriaFinanceira, number>>;

const RECEITAS: readonly CategoriaFinanceira[] = ["bilheteira", "patrocinios", "comercial", "premios"];

export function saldoDoClube(repo: Repositorio, clube: ClubeBase): number {
  const v = repo.meta(`saldo.${clube.id}`);
  return v === undefined ? clube.financas : Number(v);
}

export function mesDoClube(repo: Repositorio, clube: string): Mes {
  const v = repo.meta(`mes.${clube}`);
  return v ? (JSON.parse(v) as Mes) : {};
}

/** Regista um lançamento: soma ao saldo e ao mês. Receitas positivas, despesas negativas. */
export function lancar(repo: Repositorio, clube: ClubeBase, categoria: CategoriaFinanceira, valor: number): void {
  if (!valor) return;
  repo.definirMeta(`saldo.${clube.id}`, String(Math.round(saldoDoClube(repo, clube) + valor)));
  const mes = mesDoClube(repo, clube.id);
  mes[categoria] = Math.round((mes[categoria] ?? 0) + valor);
  repo.definirMeta(`mes.${clube.id}`, JSON.stringify(mes));
}

/** Razão reputação / referência do escalão, com limites e expoente: o quanto o clube vale acima ou abaixo do típico. */
export function fatorReputacao(clube: ClubeBase, params: Parametros): number {
  const m = params.financas.modelo;
  const r = Math.min(m.razaoReputacao.max, Math.max(m.razaoReputacao.min, clube.reputacao / m.reputacaoRef[clube.escalao]));
  return r ** m.expoenteReputacao;
}

export function massaSalarialMensal(repo: Repositorio, clube: string): number {
  return repo.jogadoresDoClube(clube).reduce((t, j) => t + (repo.contrato(j.pessoa)?.salarioMensal ?? 0), 0);
}

/** Custos mensais (salários + staff + estádio + fixos), sempre positivos. */
export function custosMensais(repo: Repositorio, clube: ClubeBase, params: Parametros): Record<"salarios" | "staff" | "estadio" | "fixos", number> {
  const m = params.financas.modelo;
  const e: Escalao = clube.escalao;
  return { salarios: massaSalarialMensal(repo, clube.id), staff: m.staffMensal[e], estadio: Math.round((clube.estadio.capacidade * m.estadioPorLugarAno[e]) / 12), fixos: m.fixoMensal[e] };
}

/** Receitas anuais fixas esperadas (patrocínios e comercial); a bilheteira e os prémios variam. */
export function receitasFixasAnuais(clube: ClubeBase, params: Parametros): { patrocinios: number; comercial: number } {
  const m = params.financas.modelo;
  const f = fatorReputacao(clube, params);
  return { patrocinios: Math.round(m.patrocinioAnual[clube.escalao] * f), comercial: Math.round(m.comercialAnual[clube.escalao] * f) };
}

/**
 * Fecha o mês que acabou: salários, staff, estádio e fixos saem; patrocínios e comercial entram (1/12 do ano).
 * Grava `FECHO_FINANCEIRO` por clube. Os clubes fora da pirâmide (segunda distrital) não têm movimentos.
 */
export function fecharMes(repo: Repositorio, dados: DadosBase, params: Parametros, data: Data, epoca: number, ativo: (clube: ClubeBase) => boolean): void {
  for (const c of dados.clubes) {
    if (!ativo(c)) continue;
    const custos = custosMensais(repo, c, params);
    const fixas = receitasFixasAnuais(c, params);
    lancar(repo, c, "patrocinios", fixas.patrocinios / 12);
    lancar(repo, c, "comercial", fixas.comercial / 12);
    lancar(repo, c, "salarios", -custos.salarios);
    lancar(repo, c, "staff", -custos.staff);
    lancar(repo, c, "estadio", -custos.estadio);
    lancar(repo, c, "fixos", -custos.fixos);
    const mes = mesDoClube(repo, c.id);
    const receitas = RECEITAS.reduce((t, k) => t + (mes[k] ?? 0), 0);
    const despesas = Object.entries(mes).reduce((t, [k, v]) => t + (RECEITAS.includes(k as CategoriaFinanceira) ? 0 : (v as number)), 0);
    repo.acrescentarEvento({ tipo: "FECHO_FINANCEIRO", data, epoca, vis: "privado", origem: "jogo", entidades: [{ k: "clube", id: c.id, papel: "clube" }], dados: { receitas, despesas, saldo: saldoDoClube(repo, c), mes } });
    repo.definirMeta(`mes.${c.id}`, "{}");
  }
}

// --- estado descritivo público (HISTORICO_EVENTOS §5.1) ---

export type Saude = "beiraFalencia" | "emRisco" | "apertado";
export type Riqueza = "poderoso" | "muitoRico" | "rico" | "folgado" | "remediado" | "estavel" | "modesto" | "pobre";
export type EstadoFinanceiro = { estado: Saude | Riqueza; /** O gamer vê exato: sem erro de estimativa. */ exato: boolean };

const BANDAS: Record<Escalao, [Riqueza, Riqueza, Riqueza, Riqueza, Riqueza]> = {
  primeiraLiga: ["poderoso", "rico", "remediado", "modesto", "pobre"],
  segundaLiga: ["muitoRico", "rico", "estavel", "modesto", "pobre"],
  terceiraLiga: ["muitoRico", "rico", "estavel", "modesto", "pobre"],
  cp: ["rico", "folgado", "estavel", "modesto", "pobre"],
  distrital: ["rico", "folgado", "estavel", "modesto", "pobre"],
};

type Medida = { clube: ClubeBase; saldo: number; custos: number; receitas: number };

function medir(repo: Repositorio, c: ClubeBase, params: Parametros): Medida {
  const cm = custosMensais(repo, c, params);
  const fixas = receitasFixasAnuais(c, params);
  const m = params.financas.modelo;
  const bilheteira = c.estadio.capacidade * m.ocupacao[c.escalao] * m.precoBilhete[c.escalao] * 15;
  return { clube: c, saldo: saldoDoClube(repo, c), custos: cm.salarios + cm.staff + cm.estadio + cm.fixos, receitas: fixas.patrocinios + fixas.comercial + bilheteira };
}

/**
 * A palavra pública sobre as finanças de um clube. Saúde primeiro (meses de folga e dívida), depois riqueza como percentil de
 * `receitas anuais + saldo` entre os clubes do mesmo escalão. Para um clube que não é o do gamer, com probabilidade
 * `probErroEstimativaRival` a banda de riqueza vem uma ao lado (estável por seed, clube e época).
 */
export function estadoFinanceiro(repo: Repositorio, dados: DadosBase, params: Parametros, clube: ClubeBase, opcoes: { proprio: boolean; epoca: number; seed: string }): EstadoFinanceiro {
  const p = params.financas;
  const eu = medir(repo, clube, params);
  const folga = eu.custos > 0 ? eu.saldo / eu.custos : Infinity;
  const divida = Math.max(0, -eu.saldo);
  if (folga < 0 && divida > p.dividaSobreReceitaFalencia * eu.receitas) return { estado: "beiraFalencia", exato: opcoes.proprio };
  if (folga < p.folgaMesesRisco || eu.saldo < 0) return { estado: "emRisco", exato: opcoes.proprio };
  if (folga < p.folgaMesesApertado) return { estado: "apertado", exato: opcoes.proprio };
  const iguais = dados.clubes.filter((c) => c.escalao === clube.escalao).map((c) => (c.id === clube.id ? eu : medir(repo, c, params)));
  const recursos = (x: Medida) => x.receitas + x.saldo;
  const abaixo = iguais.filter((x) => recursos(x) < recursos(eu)).length;
  const percentil = iguais.length > 1 ? (abaixo / (iguais.length - 1)) * 100 : 50;
  const [a, b, c2, d] = p.percentisRiqueza;
  let banda = percentil >= a ? 0 : percentil >= b ? 1 : percentil >= c2 ? 2 : percentil >= d ? 3 : 4;
  if (!opcoes.proprio) {
    const rng = new Rng(opcoes.seed, `financas/${clube.id}/${opcoes.epoca}`);
    if (rng.float() < p.probErroEstimativaRival) banda = Math.min(4, Math.max(0, banda + (rng.float() < 0.5 ? -1 : 1)));
  }
  return { estado: BANDAS[clube.escalao][banda] as Riqueza, exato: opcoes.proprio };
}

const proximoMes = (chave: string): string => {
  const [a, m] = chave.split("-").map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * Fecha todos os meses em atraso até ao mês de `data` (inclusive: o fecho do dia 1 fecha o mês anterior). Corre ao passar para
 * o dia 1 de cada mês e ao mudar de época, para que os meses sem jogos (junho, julho) também paguem os custos.
 */
export function fecharMesesAte(repo: Repositorio, dados: DadosBase, params: Parametros, data: Data, epoca: number, ativo: (clube: ClubeBase) => boolean): void {
  const alvo = data.slice(0, 7);
  const ultimo = repo.meta("financas.fechadoAte");
  if (ultimo === undefined) { repo.definirMeta("financas.fechadoAte", alvo); return; }
  let m = ultimo;
  while (m < alvo) {
    m = proximoMes(m);
    fecharMes(repo, dados, params, `${m}-01`, epoca, ativo);
  }
  repo.definirMeta("financas.fechadoAte", m);
}
