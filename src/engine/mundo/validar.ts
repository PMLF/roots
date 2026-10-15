/** Validação do mundo gerado (GERACAO_MUNDO §3, passo 6). Devolve erros (bloqueiam) e avisos (calibração). */
import type { Escalao, Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { estaBloqueado } from "./bloqueio";
import { qualidadeAtual } from "./jogador";
import type { Pais } from "./paises";
import { ATRIBUTOS, POSICOES, type LoteMundo } from "./tipos";

export type ResumoMundo = {
  pessoas: number;
  jogadores: number;
  /** Por escalão: nº de jogadores, qualidade média, % de estrangeiros. */
  porEscalao: Record<string, { jogadores: number; qualidadeMedia: number; estrangeiros: number }>;
  folhaMaiorQueCapital: number;
};

export function validarMundo(lote: LoteMundo, dados: DadosBase, paises: readonly Pais[], p: Parametros): { erros: string[]; avisos: string[]; resumo: ResumoMundo } {
  const erros: string[] = [];
  const avisos: string[] = [];
  const ids = new Set<string>();
  const paisIds = new Set(paises.map((x) => x.id));
  const cidadeIds = new Set(dados.cidades.map((c) => c.id));
  for (const x of lote.pessoas) {
    if (ids.has(x.id)) erros.push(`id repetido: ${x.id}`);
    ids.add(x.id);
    if (!paisIds.has(x.nacionalidade)) erros.push(`${x.id}: país desconhecido ${x.nacionalidade}`);
    if (x.naturalDe !== undefined && !cidadeIds.has(x.naturalDe)) erros.push(`${x.id}: concelho desconhecido ${x.naturalDe}`);
    if (estaBloqueado(x.nome) || estaBloqueado(x.nomeDesportivo)) erros.push(`${x.id}: nome na lista de bloqueio (${x.nome})`);
  }
  const jogadorDe = new Map<string, (typeof lote.jogadores)[number]>();
  for (const j of lote.jogadores) {
    if (!ids.has(j.pessoa)) erros.push(`jogador sem pessoa: ${j.pessoa}`);
    jogadorDe.set(j.pessoa, j);
    for (const a of ATRIBUTOS) {
      const v = j.atributos[a];
      if (!Number.isInteger(v) || v < 1 || v > 20) erros.push(`${j.pessoa}: atributo ${a}=${v} fora de 1-20`);
    }
    if (j.potencial < 1 || j.potencial > 20) erros.push(`${j.pessoa}: potencial fora de 1-20`);
  }

  // posições cobertas e tamanho do plantel
  const porClube = new Map<string, typeof lote.jogadores>();
  for (const j of lote.jogadores) if (j.clube) porClube.set(j.clube, [...(porClube.get(j.clube) ?? []), j]);
  for (const cl of dados.clubes) {
    const js = porClube.get(cl.id) ?? [];
    if (js.length !== p.mundo.plantel[cl.escalao]) erros.push(`${cl.id}: ${js.length} jogadores (esperado ${p.mundo.plantel[cl.escalao]})`);
    const conta = new Map<string, number>();
    for (const j of js) conta.set(j.posicoes[0]!.pos, (conta.get(j.posicoes[0]!.pos) ?? 0) + 1);
    for (const pos of POSICOES) if ((conta.get(pos) ?? 0) < (pos === "GR" ? 2 : 1)) erros.push(`${cl.id}: posição ${pos} mal coberta`);
  }

  // qualidade e estrangeiros por escalão
  const escalaoDe = new Map(dados.clubes.map((c) => [c.id, c.escalao] as const));
  const acc = new Map<Escalao, { n: number; q: number; e: number }>();
  for (const j of lote.jogadores) {
    if (!j.clube) continue;
    const esc = escalaoDe.get(j.clube) as Escalao;
    const pessoa = lote.pessoas.find((x) => x.id === j.pessoa);
    void pessoa;
    const a = acc.get(esc) ?? { n: 0, q: 0, e: 0 };
    a.n++;
    a.q += qualidadeAtual(j.atributos, j.posicoes[0]!.pos);
    acc.set(esc, a);
  }
  const nacion = new Map(lote.pessoas.map((x) => [x.id, x.nacionalidade] as const));
  for (const j of lote.jogadores) {
    if (!j.clube) continue;
    const a = acc.get(escalaoDe.get(j.clube) as Escalao);
    if (a && nacion.get(j.pessoa) !== "pt") a.e++;
  }
  const porEscalao: ResumoMundo["porEscalao"] = {};
  for (const [esc, a] of acc) {
    const q = a.q / a.n;
    const e = a.e / a.n;
    porEscalao[esc] = { jogadores: a.n, qualidadeMedia: Math.round(q * 100) / 100, estrangeiros: Math.round(e * 1000) / 1000 };
    const alvo = p.mundo.qualidadeAlvo[esc].media;
    if (Math.abs(q - alvo) > 0.8) avisos.push(`${esc}: qualidade média ${q.toFixed(2)} longe do alvo ${alvo}`);
    if (Math.abs(e - p.estrangeiros[esc]) > 0.06) avisos.push(`${esc}: estrangeiros ${(e * 100).toFixed(1)} % longe de ${(p.estrangeiros[esc] * 100).toFixed(0)} %`);
  }

  // folha salarial vs capital (aviso)
  const folha = new Map<string, number>();
  for (const c of lote.contratos) folha.set(c.clube, (folha.get(c.clube) ?? 0) + c.salarioMensal * 12);
  let acima = 0;
  for (const cl of dados.clubes) if ((folha.get(cl.id) ?? 0) > 4 * cl.financas) acima++;
  if (acima > dados.clubes.length * 0.1) avisos.push(`${acima} clubes com folha anual > 4× o capital`);

  return {
    erros,
    avisos,
    resumo: { pessoas: lote.pessoas.length, jogadores: lote.jogadores.length, porEscalao, folhaMaiorQueCapital: acima },
  };
}
