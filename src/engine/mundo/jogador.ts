/** Geração de um jogador: posições, atributos, potencial e corpo (RZ-103; GERACAO_MUNDO §5). */
import type { Rng } from "../aleatorio/rng";
import { limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import { ATRIBUTOS, ATRIBUTOS_GR, ATRIBUTOS_TECNICOS, POSICOES, type Atributo, type Atributos, type Posicao } from "./tipos";

/** Atributos-chave por posição: a qualidade atual do jogador é a média destes. */
export const CHAVE: Record<Posicao, readonly Atributo[]> = {
  GR: ["reflexos", "jogoAereo", "jogoPes", "posicionamentoGR", "manuseamento", "saidas"],
  DD: ["cruzamento", "desarme", "marcacao", "velocidade", "resistencia", "posicionamento"],
  DE: ["cruzamento", "desarme", "marcacao", "velocidade", "resistencia", "posicionamento"],
  DC: ["desarme", "marcacao", "cabeceamento", "posicionamento", "forca", "antecipacao", "coragem"],
  MDC: ["desarme", "marcacao", "passe", "posicionamento", "antecipacao", "trabalhoEquipa", "resistencia"],
  MC: ["passe", "visao", "controloBola", "decisao", "trabalhoEquipa", "resistencia"],
  MO: ["passe", "visao", "drible", "criatividade", "tecnica", "primeiroToque", "remateLonge"],
  ED: ["drible", "velocidade", "aceleracao", "cruzamento", "agilidade", "tecnica"],
  EE: ["drible", "velocidade", "aceleracao", "cruzamento", "agilidade", "tecnica"],
  PL: ["finalizacao", "cabeceamento", "desmarcacao", "primeiroToque", "compostura", "aceleracao"],
};

const OFENSIVOS: readonly Atributo[] = ["finalizacao", "drible", "criatividade", "desmarcacao", "remateLonge"];
const DEFENSIVOS: readonly Atributo[] = ["desarme", "marcacao"];
const FISICOS_IDADE: readonly Atributo[] = ["velocidade", "aceleracao", "agilidade", "salto", "recuperacao"];
const MENTAIS_IDADE: readonly Atributo[] = ["decisao", "posicionamento", "antecipacao", "compostura", "lideranca", "concentracao"];

const VIZINHAS: Record<Posicao, readonly Posicao[]> = {
  GR: [],
  DD: ["ED", "DC", "MC"],
  DE: ["EE", "DC"],
  DC: ["MDC", "DD", "DE"],
  MDC: ["DC", "MC"],
  MC: ["MDC", "MO"],
  MO: ["MC", "ED", "EE", "PL"],
  ED: ["DD", "MO", "EE", "PL"],
  EE: ["DE", "MO", "ED", "PL"],
  PL: ["MO", "ED", "EE"],
};

export function gerarAtributos(rng: Rng, pos: Posicao, qualidade: number, idade: number): Atributos {
  const chave = new Set(CHAVE[pos]);
  const a = {} as Atributos;
  for (const nome of ATRIBUTOS) {
    const gr = (ATRIBUTOS_GR as readonly string[]).includes(nome);
    if (gr && pos !== "GR") {
      a[nome] = rng.inteiro(1, 3);
      continue;
    }
    let desloc = -1.5;
    if (chave.has(nome)) desloc = 0;
    else if (pos === "GR" && !gr && (ATRIBUTOS_TECNICOS as readonly string[]).includes(nome)) desloc = -6;
    if (!chave.has(nome)) {
      if (["DD", "DE", "DC", "MDC"].includes(pos) && OFENSIVOS.includes(nome)) desloc -= 3;
      if (["ED", "EE", "PL", "MO"].includes(pos) && DEFENSIVOS.includes(nome)) desloc -= 3;
    }
    if (FISICOS_IDADE.includes(nome)) desloc -= Math.max(0, idade - 30) * 0.45;
    if (MENTAIS_IDADE.includes(nome)) desloc += limitar((idade - 22) * 0.12, -0.5, 1.2);
    a[nome] = limitar(Math.round(qualidade + desloc + rng.gauss(0, 1.3)), 1, 20);
  }
  return a;
}

/** Qualidade atual = média dos atributos-chave da posição principal. */
export function qualidadeAtual(a: Atributos, pos: Posicao): number {
  const ks = CHAVE[pos];
  return ks.reduce((s, k) => s + a[k], 0) / ks.length;
}

export function gerarPosicoes(rng: Rng, principal: Posicao, aptidaoSecundaria: number): { pos: Posicao; aptidao: number }[] {
  const out = [{ pos: principal, aptidao: 20 }];
  for (const v of VIZINHAS[principal]) if (rng.prob(0.35)) out.push({ pos: v, aptidao: limitar(Math.round(20 * aptidaoSecundaria + rng.gauss(0, 2)), 1, 19) });
  return out;
}

/**
 * Qualidade atual e potencial a partir do "nível-alvo" do plantel `alvo` e da idade:
 * jovens ainda não chegaram lá (mas o potencial sim), veteranos já desceram.
 */
export function qualidadeEPotencial(rng: Rng, alvo: number, idade: number, m: Parametros["mundo"]): { atual: number; potencial: number } {
  const pico = m.idadePico;
  const deficit = Math.max(0, pico - 3 - idade) * 0.35;
  const declinio = Math.max(0, idade - 31) * 0.3;
  const atual = limitar(alvo - deficit - declinio, 1, 20);
  const margem = idade < pico ? Math.max(0, rng.gauss(deficit + 0.4, 0.9)) : 0;
  return { atual, potencial: limitar(atual + margem, atual, 20) };
}

export function gerarCorpo(rng: Rng, pos: Posicao): { alturaCm: number; pesoKg: number; pe: "D" | "E" | "A" } {
  const base = pos === "GR" ? 188 : pos === "DC" ? 184 : pos === "PL" ? 181 : ["ED", "EE", "MO"].includes(pos) ? 175 : 178;
  const alturaCm = Math.round(limitar(rng.gauss(base, 5), 160, 205));
  const pesoKg = Math.round(limitar((alturaCm - 100) * 0.92 + rng.gauss(0, 4), 55, 100));
  const r = rng.float();
  const pe = r < 0.7 ? "D" : r < 0.95 ? "E" : "A";
  return { alturaCm, pesoKg, pe };
}

export { POSICOES };
