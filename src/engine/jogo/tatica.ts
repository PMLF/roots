/**
 * Táticas do treinador (RZ-108; docs/MOTOR_JOGO.md §7): preferências derivadas da personalidade e escolha da formação
 * para o plantel. Puro e determinístico. Os efeitos na força estão em `formacoes.ts`.
 */
import { Rng, limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import type { Personalidade } from "../personalidade/gerar";
import { onzeComValor, type CandidatoOnze } from "./equipa";
import { BASE, ESTILOS, FORMACAO_IDS, FORMACOES, linhasDaFormacao } from "./formacoes";
import type { EquipaJogo, Estilo, FormacaoId, Nivel } from "./tipos";

// ---------- treinador

export type PerfilTatico = {
  /** Formações favoritas, da preferida para a menos preferida. */
  formacoes: FormacaoId[];
  estilo: Estilo;
  intensidade: Nivel;
  linha: Nivel;
  ritmo: Nivel;
  fairPlay: Nivel;
  /** 0 = teimoso (insiste nas favoritas), 1 = adapta-se ao plantel. */
  flexibilidade: number;
};

const nivel = (x: number): Nivel => limitar(Math.round(x), 1, 5) as Nivel;

/** Quão ofensiva é uma formação, -1 (muito defensiva) a +1. */
function ofensividade(f: FormacaoId): number {
  const l = linhasDaFormacao(FORMACOES[f]);
  return limitar(((l.ataque - BASE.ataque) - (l.defesa - BASE.defesa)) / 2, -1, 1);
}

function escolherPonderado<T>(rng: Rng, itens: readonly T[], peso: (x: T) => number): T {
  const pesos = itens.map(peso);
  let r = rng.float() * pesos.reduce((a, b) => a + b, 0);
  for (let i = 0; i < itens.length; i++) {
    r -= pesos[i] as number;
    if (r < 0) return itens[i] as T;
  }
  return itens[itens.length - 1] as T;
}

/**
 * As preferências táticas de um treinador, derivadas da personalidade e da qualidade tática (1-20).
 * Ambicioso e vaidoso: formações ofensivas, jogo bonito, linha alta. Pavio curto: fair play duro. Impaciente: ritmo alto e jogo direto.
 * Vaidoso é teimoso; quem sabe de táticas adapta-se. Estável: mesma seed e mesmo treinador, mesmo perfil.
 */
export function perfilTreinador(seed: string, pessoaId: string, pers: Personalidade, qualidadeTatica: number, params: Parametros): PerfilTatico {
  const rng = new Rng(seed, `treinador/${pessoaId}/tatica`);
  const ofensivo = (pers.ambicao + pers.vaidade - 20) / 20;
  const livres = [...FORMACAO_IDS];
  const formacoes: FormacaoId[] = [];
  for (let k = 0; k < Math.min(params.tatica.treinador.favoritas, livres.length); k++) {
    const f = escolherPonderado(rng, livres, (x) => Math.exp(1.6 * ofensivo * ofensividade(x)) * (0.4 + rng.float()) * (x === "4-3-3" ? 1.3 : 1));
    formacoes.push(f);
    livres.splice(livres.indexOf(f), 1);
  }
  const estilo = escolherPonderado(rng, ESTILOS, (e) => {
    switch (e) {
      case "bonito": return 0.6 + pers.vaidade / 12 + pers.paciencia / 20;
      case "direto": return 0.6 + (20 - pers.paciencia) / 14 + pers.ambicao / 30;
      case "contraAtaque": return 0.4 + (20 - pers.ambicao) / 16 + (20 - pers.vaidade) / 30;
      default: return 1.2;
    }
  });
  const flexibilidade = limitar(0.5 * (qualidadeTatica / 20) + 0.5 * (1 - pers.vaidade / 20) + rng.gauss(0, 0.05), 0, 1);
  return {
    formacoes,
    estilo,
    intensidade: nivel(3 + (pers.ambicao - 10) / 5 + rng.gauss(0, 0.6)),
    linha: nivel(3 + (pers.vaidade + pers.ambicao - 20) / 12 + rng.gauss(0, 0.6)),
    ritmo: nivel(3 + (10 - pers.paciencia) / 6 + rng.gauss(0, 0.6)),
    fairPlay: nivel(3 + (pers.temperamento - 10) / 5 - (pers.integridade - 10) / 10 + rng.gauss(0, 0.5)),
    flexibilidade,
  };
}

/**
 * Escolhe a formação para este plantel: valor médio do onze + bónus pela preferência do treinador
 * (1.º favorito 100 %, 2.º 66 %, 3.º 33 %), reduzido pela flexibilidade. Um teimoso insiste nas favoritas
 * mesmo com o plantel errado; um flexível escolhe a que dá o melhor onze.
 */
export function escolherEquipa(clube: string, candidatos: readonly CandidatoOnze[], perfil: PerfilTatico, params: Parametros): EquipaJogo {
  const { bonusPreferencia, favoritas } = params.tatica.treinador;
  let melhor: { f: FormacaoId; onze: EquipaJogo["onze"]; u: number } | undefined;
  for (const f of FORMACAO_IDS) {
    const { onze, valor } = onzeComValor(candidatos, FORMACOES[f]);
    const rank = perfil.formacoes.indexOf(f);
    const pref = rank < 0 ? 0 : (favoritas - rank) / favoritas;
    const u = valor + (1 - perfil.flexibilidade) * bonusPreferencia * pref;
    if (!melhor || u > melhor.u) melhor = { f, onze, u };
  }
  const m = melhor as NonNullable<typeof melhor>;
  return { clube, onze: m.onze, tatica: { formacao: m.f, estilo: perfil.estilo, intensidade: perfil.intensidade, linha: perfil.linha, ritmo: perfil.ritmo, fairPlay: perfil.fairPlay } };
}
