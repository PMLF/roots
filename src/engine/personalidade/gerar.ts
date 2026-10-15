/** Geração de personalidade (RZ-004/103; docs/PERSONALIDADE §2-3). Funções puras. */
import type { Rng } from "../aleatorio/rng";
import { limitar } from "../aleatorio/rng";

export const TRACOS = ["ambicao", "lealdade", "vaidade", "paciencia", "integridade", "ganancia", "temperamento", "profissionalismo"] as const;
export type Traco = (typeof TRACOS)[number];
export type Personalidade = Record<Traco, number>;

export type PapelPessoa = "jogador" | "treinador" | "staff" | "presidente" | "autarca" | "empresario" | "agente" | "arbitro" | "adepto" | "jornalista";

export type Arquetipo = { nome: string; tracos: Partial<Personalidade> };

export const ARQUETIPOS: Record<string, Arquetipo> = {
  comum: { nome: "Comum", tracos: {} },
  lider: { nome: "Líder de balneário", tracos: { lealdade: 15, profissionalismo: 16, temperamento: 8 } },
  estrela: { nome: "Estrela caprichosa", tracos: { vaidade: 17, ganancia: 15, lealdade: 6 } },
  operario: { nome: "Operário", tracos: { profissionalismo: 17, ambicao: 9, vaidade: 6 } },
  pavioCurto: { nome: "Pavio curto", tracos: { temperamento: 18, integridade: 9 } },
  autarcaObra: { nome: "Autarca de obra", tracos: { ambicao: 16, vaidade: 15, paciencia: 7 } },
  autarcaDiscreto: { nome: "Autarca discreto", tracos: { vaidade: 5, paciencia: 15, integridade: 14 } },
  agenteTubarao: { nome: "Agente tubarão", tracos: { ganancia: 18, lealdade: 5, integridade: 7 } },
  empresarioLocal: { nome: "Empresário local", tracos: { lealdade: 14, vaidade: 13 } },
  veterano: { nome: "Veterano paciente", tracos: { paciencia: 16, profissionalismo: 15, temperamento: 6 } },
  mercenario: { nome: "Mercenário", tracos: { lealdade: 4, ganancia: 16, ambicao: 14 } },
  idealista: { nome: "Idealista", tracos: { integridade: 17, ganancia: 5, lealdade: 14 } },
};

/** Pesos dos arquétipos por papel; o que falta fica em "comum". */
const POR_PAPEL: Record<PapelPessoa, Record<string, number>> = {
  jogador: { comum: 60, lider: 6, estrela: 8, operario: 12, pavioCurto: 6, mercenario: 5, idealista: 3 },
  treinador: { comum: 55, veterano: 15, lider: 10, operario: 10, idealista: 5, pavioCurto: 5 },
  staff: { comum: 65, operario: 15, veterano: 10, idealista: 5, mercenario: 5 },
  presidente: { comum: 45, empresarioLocal: 20, estrela: 8, idealista: 10, mercenario: 7, veterano: 10 },
  autarca: { comum: 30, autarcaObra: 35, autarcaDiscreto: 35 },
  empresario: { comum: 25, empresarioLocal: 55, mercenario: 10, idealista: 10 },
  agente: { comum: 25, agenteTubarao: 50, mercenario: 15, idealista: 10 },
  arbitro: { comum: 70, idealista: 12, pavioCurto: 8, mercenario: 10 },
  jornalista: { comum: 60, idealista: 15, pavioCurto: 10, mercenario: 15 },
  adepto: { comum: 70, pavioCurto: 15, idealista: 10, empresarioLocal: 5 },
};

export type ContextoPersonalidade = {
  /** Jogador natural da cidade do seu clube: lealdade +3. */
  naturalDaCidade?: boolean;
  /** País de origem difícil: profissionalismo +2 (regra opcional). */
  origemDificil?: boolean;
  /** Treinador veterano: paciência +2. */
  veterano?: boolean;
  /** Força um arquétipo (p. ex. os traços do autarca vêm do CSV). */
  arquetipo?: string;
  /** Traços já conhecidos (têm prioridade sobre o gerado). */
  fixos?: Partial<Personalidade>;
};

export function gerarPersonalidade(rng: Rng, papel: PapelPessoa, ctx: ContextoPersonalidade = {}, min = 1, max = 20): { personalidade: Personalidade; arquetipo: string } {
  const pesos = POR_PAPEL[papel];
  const chaves = Object.keys(pesos);
  const arquetipo = ctx.arquetipo ?? rng.ponderado(chaves, (k) => pesos[k] as number);
  const base = ARQUETIPOS[arquetipo];
  if (!base) throw new Error(`Arquétipo desconhecido: ${arquetipo}`);
  const p = {} as Personalidade;
  for (const t of TRACOS) {
    let v = Math.round((base.tracos[t] ?? 10) + rng.gauss(0, 2.5));
    if (t === "lealdade" && ctx.naturalDaCidade) v += 3;
    if (t === "profissionalismo" && ctx.origemDificil) v += 2;
    if (t === "paciencia" && ctx.veterano) v += 2;
    p[t] = limitar(ctx.fixos?.[t] ?? v, min, max);
  }
  return { personalidade: p, arquetipo };
}
