/**
 * Dados de origem importados dos CSV (RZ-007). São o ponto de partida do mundo,
 * não o modelo completo de MODELO_DADOS: plantéis, finanças detalhadas, estádios por
 * setores e pessoas são gerados depois (RZ-103). Tudo aqui é imutável pelo motor.
 */
import type { Escalao } from "../config/parametros";
import type { Estatuto } from "../localidade/estatuto";

export type ClubeId = string;
export type CidadeId = string;
export type LocalidadeId = string;
export type DistritoId = string;
export type SerieCP = "A" | "B" | "C" | "D";
export type Zona = "centro" | "perto" | "periferia" | "fora";
export type Propriedade = "clube" | "municipal" | "partilhada";

export type LocalizacaoEstadio = {
  zona: Zona;
  distanciaCentroKm: number;
  /** 0-100 */
  transportes: number;
  acessoRodoviario: number;
  estacionamento: number;
  lugaresEstacionamento: number;
  envolvente: number;
  terrenoExpansao: number;
};

export type EstadioBase = {
  nome: string;
  propriedade: Propriedade;
  capacidade: number;
  localizacao: LocalizacaoEstadio;
};

export type ClubeBase = {
  id: ClubeId;
  nome: string;
  /** Nome da localidade do clube (coluna "cidade" do CSV). */
  localidade: string;
  localidadeId: LocalidadeId;
  /** Concelho: a cidade do jogo. */
  cidade: CidadeId;
  distrito: DistritoId;
  escalao: Escalao;
  /** Liga/série onde joga no início, tal como no CSV ("CP Série A", "Distrital Beja", ...). */
  liga: string;
  reputacao: number;
  /** Capital inicial em euros. */
  financas: number;
  estadio: EstadioBase;
  cores: string;
  alcunha: string;
  mascote: string;
  rival: ClubeId;
  setor: string;
  tag2: string;
  polo: string;
  origem: "existente" | "novo";
};

export type AutarcaBase = {
  nome: string;
  /** Traços na escala 1-20 (valores do CSV, 1-10, ×2; PERSONALIDADE §2). */
  tracos: { ambicao: number; vaidade: number; paciencia: number; integridade: number };
  /** Atitude da Câmara perante o desporto, 1-10 (não é traço). */
  apoioDesporto: number;
};

export type CidadeBase = {
  id: CidadeId;
  nome: string;
  distrito: DistritoId;
  populacao: number;
  setor: string;
  tag2: string;
  polo: string;
  ilha: boolean;
  /** Euros por ano. */
  orcamentoMunicipal: number;
  autarca: AutarcaBase;
  /** 0-100 */
  culturaFutebol: number;
  clubes: ClubeId[];
};

/** Aldeia, vila ou cidade onde o clube vive, dentro de um concelho (RZ-136). O estatuto e a população evoluem no save. */
export type LocalidadeBase = {
  id: LocalidadeId;
  nome: string;
  cidade: CidadeId;
  distrito: DistritoId;
  populacao: number;
  estatuto: Estatuto;
  /** É a sede do concelho. */
  sede: boolean;
  clubes: ClubeId[];
};

export type DistritoBase = {
  id: DistritoId;
  nome: string;
  serieCP: SerieCP;
  /** Nº de clubes por escalão, para validar. */
  clubesPorEscalao: Record<Escalao, number>;
};

export type RivalidadeBase = {
  a: ClubeId;
  b: ClubeId;
  mutua: boolean;
  mesmoConcelho: boolean;
  mesmoDistrito: boolean;
  mesmoPolo: boolean;
  mesmaDivisao: boolean;
};

export type DadosBase = {
  distritos: DistritoBase[];
  cidades: CidadeBase[];
  localidades: LocalidadeBase[];
  clubes: ClubeBase[];
  rivalidades: RivalidadeBase[];
};

export type FontesCsv = { clubes: string; cidades: string; localidades: string; rivalidades: string; distritos: string };

export type ResultadoImportacao =
  | { ok: true; dados: DadosBase; avisos: string[] }
  | { ok: false; erros: string[] };
