/**
 * Vista (RZ-129): a única porta de leitura da interface.
 * Devolve apenas (a) factos públicos de todo o mundo, (b) factos privados/secretos em que o observador
 * participa, e (c) estimativas com margem vindas de observações. Não recebe nem importa a "verdade"
 * (atributos, potencial, personalidade, finanças): por construção, não tem como a devolver.
 */
import type { Parametros } from "../config/parametros";
import type { Repositorio } from "../persistencia/repositorio";
import type { FiltroEventos } from "../persistencia/repositorio";
import type { Data, EntidadeRef, Evento, Jogo, LinhaClassificacao, LinhaStatJogador, Marcador, Observacao, PessoaPublica } from "../persistencia/tipos";
import { paraDias } from "../calendario/datas";
import type { Alvo, Conhecimento, Estimativa, FichaPessoa, Frescura, PessoaVista, Rotulo, ValoresObservados } from "./tipos";

/** Só o que a Vista usa do repositório: leitura de factos públicos e de observações. */
export type FontePublica = Pick<Repositorio, "eventosDe" | "jogo" | "marcadores" | "classificacao" | "statsJogador" | "observacoes" | "pessoaPublica" | "plantelPublico" | "cargosPublicos">;

export type ContextoVista = {
  /** Quem observa (o clube do gamer). As observações são suas. */
  observador: string;
  /** Entidades "nossas" ("clube:id", "pessoa:id"): vemos os eventos privados/secretos em que participam. */
  participantes: ReadonlySet<string>;
  data: Data;
  epoca: number;
};

export const chaveParticipante = (e: Pick<EntidadeRef, "k" | "id">): string => `${e.k}:${e.id}`;

export class Vista {
  constructor(
    private readonly fonte: FontePublica,
    private readonly ctx: ContextoVista,
    private readonly k: Parametros["conhecimento"],
  ) {}

  // ---------- factos públicos
  /** Eventos de uma entidade: todos os públicos + os privados/secretos em que participamos. Mais recentes primeiro. */
  eventos(entidade: Alvo, filtro: Omit<FiltroEventos, "apenasPublicos" | "vis"> = {}): Evento[] {
    const { limite, ...resto } = filtro;
    const publicos = this.fonte.eventosDe(entidade, { ...resto, vis: ["publico"], ...(limite !== undefined ? { limite } : {}) });
    const nossos = this.fonte
      .eventosDe(entidade, { ...resto, vis: ["privado", "secreto"] })
      .filter((e) => e.entidades.some((x) => this.ctx.participantes.has(chaveParticipante(x))));
    const todos = [...publicos, ...nossos].sort((a, b) => b.id - a.id);
    return limite === undefined ? todos : todos.slice(0, limite);
  }

  jogo(id: string): Jogo | undefined {
    return this.fonte.jogo(id);
  }
  marcadores(competicao: string, epoca: number, jornada: number): Marcador[] {
    return this.fonte.marcadores(competicao, epoca, jornada);
  }
  classificacao(competicao: string, epoca: number): LinhaClassificacao[] {
    return this.fonte.classificacao(competicao, epoca);
  }
  /** Golos, jogos, cartões… são factos de jogo e portanto públicos (não são atributos). */
  statsJogador(jogador: string): LinhaStatJogador[] {
    return this.fonte.statsJogador(jogador);
  }

  // ---------- pessoas
  private comIdade(p: PessoaPublica): PessoaVista {
    return { ...p, idade: Math.floor((paraDias(this.ctx.data) - paraDias(p.nascimento)) / 365.25) };
  }
  /** Factos públicos de uma pessoa (nome, idade, clube, posição, corpo). */
  pessoa(id: string): PessoaVista | undefined {
    const p = this.fonte.pessoaPublica(id);
    return p ? this.comIdade(p) : undefined;
  }
  plantel(clube: string): PessoaVista[] {
    return this.fonte.plantelPublico(clube).map((p) => this.comIdade(p));
  }
  cargos(filtro: { clube?: string; cidade?: string }): PessoaVista[] {
    return this.fonte.cargosPublicos(filtro).map((p) => this.comIdade(p));
  }
  /** Ficha completa para a interface: factos públicos + o que se sabe (com margem) dos grupos observados. */
  ficha(id: string): FichaPessoa | undefined {
    const publico = this.pessoa(id);
    if (!publico) return undefined;
    const alvo: Alvo = { k: "pessoa", id };
    const atributos = this.conhecimento(alvo, "atributos");
    const potencial = this.conhecimento(alvo, "potencial");
    const personalidade = this.conhecimento(alvo, "personalidade");
    return { publico, ...(atributos ? { atributos } : {}), ...(potencial ? { potencial } : {}), ...(personalidade ? { personalidade } : {}) };
  }

  // ---------- conhecimento
  /**
   * O que o observador sabe sobre `alvo` num grupo (atributos | personalidade | potencial | financas | contrato).
   * `undefined` se nunca o observou. Várias observações combinam-se por média ponderada pelo inverso da
   * variância, com a incerteza a crescer com a idade da observação.
   */
  conhecimento(alvo: Alvo, grupo: string): Conhecimento | undefined {
    const obs = this.fonte.observacoes(this.ctx.observador, alvo, grupo);
    if (obs.length === 0) return undefined;
    const k = this.k;
    const idade = (o: Observacao) => Math.max(0, this.ctx.epoca - o.epoca);
    const frescura = (o: Observacao): Frescura => ({
      vistoEm: o.data,
      epocasDesde: idade(o),
      desatualizado: idade(o) >= k.desatualizadoAposEpocas,
    });

    type Acum = { somaPeso: number; somaPesoEst: number; escala?: [number, number]; recente: Observacao };
    const acum = new Map<string, Acum>();
    let rotulos: Rotulo[] = [];
    let rotulosJaVistos = false;
    for (const o of obs) {
      // `obs` vem das mais recentes para as mais antigas
      const v = o.valores as ValoresObservados;
      if (!rotulosJaVistos && v.rotulos) {
        rotulos = v.rotulos;
        rotulosJaVistos = true;
      }
      for (const [campo, { est, sigma }] of Object.entries(v.campos ?? {})) {
        const sigmaEfetivo = Math.max(sigma, 1e-6) * (1 + k.crescimentoIncertezaPorEpoca * idade(o));
        const peso = 1 / (sigmaEfetivo * sigmaEfetivo);
        const a = acum.get(campo);
        if (a) {
          a.somaPeso += peso;
          a.somaPesoEst += peso * est;
        } else acum.set(campo, { somaPeso: peso, somaPesoEst: peso * est, ...(v.escala ? { escala: v.escala } : {}), recente: o });
      }
    }

    const campos: Conhecimento["campos"] = {};
    for (const [campo, a] of acum) {
      const media = a.somaPesoEst / a.somaPeso;
      const margem = k.z * Math.sqrt(1 / a.somaPeso);
      const [min, max] = a.escala ?? [-Infinity, Infinity];
      const est: Estimativa = {
        valor: arred(Math.min(max, Math.max(min, media))),
        margem: arred(margem),
        intervalo: [arred(Math.max(min, media - margem)), arred(Math.min(max, media + margem))],
      };
      campos[campo] = { ...est, ...frescura(a.recente) };
    }
    const maisRecente = obs[0] as Observacao;
    return { ...frescura(maisRecente), observacoes: obs.length, campos, rotulos };
  }

  /** Atalho: estimativa de um campo (p. ex. "finalizacao") dentro de um grupo. */
  estimativa(alvo: Alvo, grupo: string, campo: string): (Estimativa & Frescura) | undefined {
    return this.conhecimento(alvo, grupo)?.campos[campo];
  }
}

const arred = (x: number) => Math.round(x * 10) / 10;
