/** Formas das pessoas geradas (RZ-103). Todas de "verdade": a UI só as vê através da `Vista`. */
import type { Escalao } from "../config/parametros";
import type { PapelPessoa, Personalidade } from "../personalidade/gerar";
import type { Data } from "../persistencia/tipos";

export const POSICOES = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"] as const;
export type Posicao = (typeof POSICOES)[number];

export const ATRIBUTOS_TECNICOS = ["finalizacao", "remateLonge", "passe", "cruzamento", "drible", "controloBola", "cabeceamento", "desarme", "marcacao", "bolaParada", "penaltis", "tecnica", "lancamentos", "primeiroToque"] as const;
export const ATRIBUTOS_MENTAIS = ["visao", "decisao", "compostura", "trabalhoEquipa", "posicionamento", "antecipacao", "concentracao", "determinacao", "lideranca", "agressividade", "criatividade", "desmarcacao", "sacrificio", "coragem"] as const;
export const ATRIBUTOS_FISICOS = ["velocidade", "aceleracao", "resistencia", "forca", "agilidade", "salto", "equilibrio", "aptidaoFisica", "recuperacao"] as const;
export const ATRIBUTOS_GR = ["reflexos", "jogoAereo", "jogoPes", "posicionamentoGR", "comunicacao", "manuseamento", "saidas", "pontapeBaliza"] as const;
export const ATRIBUTOS = [...ATRIBUTOS_TECNICOS, ...ATRIBUTOS_MENTAIS, ...ATRIBUTOS_FISICOS, ...ATRIBUTOS_GR] as const;
export type Atributo = (typeof ATRIBUTOS)[number];
export type Atributos = Record<Atributo, number>;

export type PessoaNova = {
  id: string;
  nome: string;
  nomeDesportivo: string;
  nascimento: Data;
  /** id do país (`data/paises.csv`). */
  nacionalidade: string;
  /** Concelho de naturalidade (portugueses nascidos cá). */
  naturalDe?: string;
  papeis: PapelPessoa[];
  personalidade: Personalidade;
  arquetipo: string;
  /** 1 = detalhado … 3 = esboço (GERACAO_MUNDO). */
  lod: 1 | 2 | 3;
};

export type JogadorNovo = {
  pessoa: string;
  posicoes: { pos: Posicao; aptidao: number }[];
  atributos: Atributos;
  /** Verdade oculta; a `Vista` só devolve estimativas. */
  potencial: number;
  alturaCm: number;
  pesoKg: number;
  pe: "D" | "E" | "A";
  clube?: string;
  estado: "ativo" | "livre";
};

export type ContratoNovo = { pessoa: string; clube: string; salarioMensal: number; inicio: Data; fim: Data };

export type FuncaoCargo = "presidente" | "autarca" | "treinador" | "adjunto" | "olheiro" | "medico" | "fisio" | "comunidade" | "empresario" | "dirigenteAdeptos" | "agente" | "arbitro" | "jornalista";
export type CargoNovo = { pessoa: string; funcao: FuncaoCargo; clube?: string; cidade?: string; qualidade?: Record<string, number> };

export type LoteMundo = {
  pessoas: PessoaNova[];
  jogadores: JogadorNovo[];
  contratos: ContratoNovo[];
  cargos: CargoNovo[];
};

export type EscalaoClube = Escalao;
