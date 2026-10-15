import type { Parametros } from "../config/parametros";
import type { ResultadoPesquisa } from "../pesquisa/pesquisar";
import type { CompeticaoResumo, JogoLab, LigaLab } from "../laboratorio/laboratorio";
import type { FormacaoId, Tatica } from "../jogo/tipos";
import type { Escalao, NivelReputacao } from "../config/parametros";
import type { LinhaStatJogador } from "../persistencia/tipos";
import type { FichaPessoa, PessoaVista } from "../vista/tipos";

/** Resultado do autodiagnóstico da base de dados (RZ-128): escreve um evento e lê-o de volta. */
export type DiagnosticoBd = {
  backend: "opfs" | "memoria";
  /** Verdadeiro se os dados sobrevivem a recarregar a página. */
  persistente: boolean;
  motivoMemoria?: string;
  sqlite: string;
  esquema: number;
  /** Total de eventos DIAGNOSTICO guardados neste save (sobe a cada abertura se for persistente). */
  aberturas: number;
  /** Eventos totais no save. */
  eventos: number;
};

export type ProgressoMundo = { fase: string; feito: number; total: number };

export type ResumoMundoCriado = {
  seed: string;
  clubes: number;
  pessoas: number;
  jogadores: number;
  /** Tempo de geração + gravação neste pedido (0 se o mundo já existia). */
  ms: number;
  /** Avisos de calibração da validação (não bloqueiam). */
  avisos: string[];
  /** O save já tinha mundo (não se gera outra vez). */
  jaExistia: boolean;
};

/** Referência a uma entidade para ligações (`Ligacao`): tipo, id e nome a mostrar. */
export type RefEntidade = { k: "clube" | "cidade" | "localidade" | "pessoa" | "competicao"; id: string; nome: string };

/** Nível geral (1-20): estimado (com margem) a partir do que se sabe dos atributos; exato no modo developer. */
export type NivelEstimado = { valor: number; margem: number; exato: boolean };

/** A verdade oculta, só devolvida no modo developer («ver tudo»). */
export type VerdadePessoa = {
  atributos?: Record<string, number>;
  potencial?: number;
  posicoes?: { pos: string; aptidao: number }[];
  personalidade: Record<string, number>;
  arquetipo: string;
  lod: number;
  salarioMensal?: number;
  qualidade?: Record<string, number>;
};

export type FichaPessoaDados = {
  ficha: FichaPessoa;
  clube?: RefEntidade;
  naturalDe?: RefEntidade;
  /** Factos de jogo por época e competição (públicos). */
  stats: LinhaStatJogador[];
  /** Contrato atual: as datas são públicas, o salário não. */
  contrato?: { inicio: string; fim: string };
  nivel?: NivelEstimado;
  verdade?: VerdadePessoa;
};

export type FichaClubeDados = {
  id: string;
  nome: string;
  liga: string;
  localidade: RefEntidade & { estatuto: EstatutoLocalidade };
  cidade: RefEntidade;
  distrito: string;
  cores: string;
  alcunha: string;
  mascote: string;
  rival?: RefEntidade;
  reputacao: number;
  estadio: { nome: string; capacidade: number };
  plantel: PessoaVista[];
  cargos: PessoaVista[];
  escalao: Escalao;
  nivelReputacao: NivelReputacao;
  estadioDetalhe: { propriedade: string; zona: string; distanciaCentroKm: number; transportes: number; acessoRodoviario: number; estacionamento: number; terrenoExpansao: number };
  /** Divisão em que o clube esteve, por época (a história de subidas e descidas). */
  historicoDivisoes: { epoca: number; escalao: Escalao; liga: string }[];
  /** Por jogador do plantel: fim de contrato e nível geral. */
  plantelExtra: Record<string, { contratoFim?: string; nivel?: NivelEstimado }>;
  /** Por membro da equipa técnica: desde quando está no clube (contrato). */
  verdade?: { reputacao: number; financas: number; qualidadeStaff: Record<string, Record<string, number>>; plantelNivel: number };
};

export type EstatutoLocalidade = "aldeia" | "vila" | "cidade";

export type FichaLocalidadeDados = {
  id: string;
  nome: string;
  estatuto: EstatutoLocalidade;
  populacao: number;
  /** Desde quando tem o estatuto atual. */
  desde: string;
  sede: boolean;
  cidade: RefEntidade;
  distrito: string;
  clubes: (RefEntidade & { liga: string })[];
  /** Mudanças de estatuto, da mais recente para a mais antiga. */
  historico: { data: string; de: EstatutoLocalidade; para: EstatutoLocalidade; populacao: number }[];
};

export type { ResultadoPesquisa, CompeticaoResumo, JogoLab, LigaLab };

export type ClubeResumo = { id: string; nome: string; liga: string };

/** Contrato entre a interface e o motor (que corre num Web Worker). Só dados serializáveis. */
export type PedidosMotor = {
  ping: { entrada: { eco: string }; saida: { eco: string; relogioMs: number } };
  versao: { entrada: null; saida: { motor: string; esquema: number } };
  parametros: { entrada: null; saida: Parametros };
  bd: { entrada: null; saida: DiagnosticoBd };
  /** Cria o mundo do save (RZ-103). Emite progresso; se o save já tem mundo, devolve o resumo sem gerar. */
  criarMundo: { entrada: { seed: string }; saida: ResumoMundoCriado };
  /** O mundo do save, se já foi criado (não gera nada). */
  estadoMundo: { entrada: null; saida: ResumoMundoCriado | null };
  clubes: { entrada: null; saida: ClubeResumo[] };
  paises: { entrada: null; saida: { id: string; nome: string }[] };
  /** Pesquisa global por nome (clubes, cidades, pessoas). */
  pesquisar: { entrada: { q: string; limite?: number }; saida: ResultadoPesquisa[] };
  fichaPessoa: { entrada: { id: string; verTudo?: boolean }; saida: FichaPessoaDados | null };
  fichaClube: { entrada: { id: string; verTudo?: boolean }; saida: FichaClubeDados | null };
  fichaLocalidade: { entrada: { id: string }; saida: FichaLocalidadeDados | null };
  /** Apaga o save atual e gera um mundo novo com esta seed (RZ-137). Emite progresso como `criarMundo`. */
  reiniciarMundo: { entrada: { seed: string }; saida: ResumoMundoCriado };
  /** Laboratório (RZ-139): as ligas e séries do mundo. */
  competicoes: { entrada: null; saida: CompeticaoResumo[] };
  /** Laboratório: simula um jogo entre dois clubes sem gravar nada no save. */
  laboratorioJogo: { entrada: { casa: string; fora: string; seed: string; taticaCasa?: Partial<Tatica>; taticaFora?: Partial<Tatica> }; saida: JogoLab };
  /** Laboratório: simula uma liga inteira (uma época) sem gravar nada no save. */
  laboratorioLiga: { entrada: { liga: string; seed: string; formacao?: FormacaoId }; saida: LigaLab };
  /** Plantel público de um clube, lido através da `Vista` (sem atributos, potencial nem personalidade). */
  plantel: { entrada: { clube: string }; saida: PessoaVista[] };
};

export type TipoPedido = keyof PedidosMotor;

export type Mensagem<K extends TipoPedido = TipoPedido> = {
  [T in K]: { id: number; tipo: T; entrada: PedidosMotor[T]["entrada"] };
}[K];

export type RespostaMotor =
  | { id: number; ok: true; saida: unknown }
  | { id: number; ok: false; erro: string }
  /** Progresso de um pedido demorado; o resultado final chega depois como `ok`. */
  | { id: number; progresso: ProgressoMundo };
