/** Tabela de países (RZ-132) e pesos de nascimento/migração (MODELO_DADOS §15, GERACAO_MUNDO §4). */
import { lerTabela } from "../dados/csv";
import type { Escalao, Parametros } from "../config/parametros";
import { limitar } from "../aleatorio/rng";

export type Pais = {
  id: string;
  nome: string;
  /** Milhões de habitantes. */
  populacao: number;
  /** 0-100 */
  tradicao: number;
  infraestrutura: number;
  /** 0-1: quão natural é um jogador deste país vir para Portugal. */
  afinidadePortugal: number;
  familiaNomes: string;
  lusofono: boolean;
  /** (tradição + infraestrutura) / 2 */
  indice: number;
};

export function importarPaises(csv: string): { ok: true; paises: Pais[] } | { ok: false; erros: string[] } {
  const t = lerTabela(csv);
  const erros = [...t.erros];
  const paises: Pais[] = [];
  const ids = new Set<string>();
  for (const l of t.linhas) {
    const v = l.valores;
    const n = (c: string) => Number(v[c]);
    const p: Pais = {
      id: v.id ?? "",
      nome: v.nome ?? "",
      populacao: n("populacao_milhoes"),
      tradicao: n("tradicao"),
      infraestrutura: n("infraestrutura"),
      afinidadePortugal: n("afinidade_pt"),
      familiaNomes: v.familia_nomes ?? "",
      lusofono: v.lusofono === "1",
      indice: 0,
    };
    const onde = `paises linha ${l.numero}`;
    if (!p.id || ids.has(p.id)) erros.push(`${onde}: id vazio ou repetido`);
    ids.add(p.id);
    if (!p.nome || !p.familiaNomes) erros.push(`${onde}: nome e familia_nomes obrigatórios`);
    if (!(p.populacao > 0)) erros.push(`${onde}: população > 0`);
    for (const [c, x] of [["tradicao", p.tradicao], ["infraestrutura", p.infraestrutura]] as const) if (!(x >= 0 && x <= 100)) erros.push(`${onde}: ${c} entre 0 e 100`);
    if (!(p.afinidadePortugal >= 0 && p.afinidadePortugal <= 1)) erros.push(`${onde}: afinidade_pt entre 0 e 1`);
    p.indice = (p.tradicao + p.infraestrutura) / 2;
    paises.push(p);
  }
  if (!paises.some((p) => p.id === "pt")) erros.push("paises: falta Portugal (pt)");
  return erros.length > 0 ? { ok: false, erros } : { ok: true, paises };
}

/** Quantos jogadores um país produz (relativo): √população × (0,3 + índice/100). */
export const pesoNascimento = (p: Pais): number => Math.sqrt(p.populacao) * (0.3 + p.indice / 100);

/** Qualidade necessária (0-1) de um escalão: cresce com o nível. */
export const qualidadeNecessaria = (esc: Escalao): number => ({ primeiraLiga: 1, segundaLiga: 0.75, terceiraLiga: 0.5, cp: 0.3, distrital: 0.1 })[esc];

/** w(país → Portugal) = peso de nascimento × afinidade × (0,5 + qualidade necessária). */
export const pesoParaPortugal = (p: Pais, esc: Escalao): number => pesoNascimento(p) * p.afinidadePortugal * (0.5 + qualidadeNecessaria(esc));

/** Probabilidade de cauda do país: sobe com o índice, nunca é zero. */
export function probCauda(p: Pais, m: Parametros["mundo"]["talento"]): number {
  return m.epsIndice0 + (m.epsIndice100 - m.epsIndice0) * limitar(p.indice / 100, 0, 1);
}
