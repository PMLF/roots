/**
 * Árbitro e transmissão de um jogo. Provisório até aos direitos de transmissão (RZ-218) e aos árbitros como pessoas (RZ-222):
 * o árbitro é um nome fictício sorteado de forma estável pelo jogo e os canais dependem do escalão e da competição.
 * Os nomes dos canais são fictícios (nada de marcas reais).
 */
import { Rng } from "../aleatorio/rng";
import type { Escalao } from "../config/parametros";
import { gerarNome } from "../mundo/nomes";

export type MeioTransmissao = "tv" | "streaming" | "radio";
export type CanalTransmissao = { nome: string; meio: MeioTransmissao };

/** O árbitro do jogo: sempre o mesmo para o mesmo save e jogo. */
export function arbitroDoJogo(seed: string, jogo: string): string {
  return gerarNome(new Rng(seed, `arbitro/${jogo}`), "portugal").completo;
}

const CANAL_TV: CanalTransmissao = { nome: "Canal Liga", meio: "tv" };
const CANAL_TV_ABERTA: CanalTransmissao = { nome: "Canal Nacional", meio: "tv" };
const CANAL_STREAMING: CanalTransmissao = { nome: "BolaPlay", meio: "streaming" };
const RADIO_NACIONAL: CanalTransmissao = { nome: "Rádio Bola", meio: "radio" };
const RADIO_LOCAL: CanalTransmissao = { nome: "Rádio Local", meio: "radio" };

/** Quem transmite o jogo (vazio se ninguém). Na Primeira Liga um jogo em cada três vai também à televisão. */
export function canaisDoJogo(escalao: Escalao, competicao: string, seed: string, jogo: string): CanalTransmissao[] {
  if (competicao === "CP Final") return [CANAL_TV_ABERTA, CANAL_STREAMING, RADIO_NACIONAL];
  if (escalao === "primeiraLiga") return new Rng(seed, `canal/${jogo}`).float() < 1 / 3 ? [CANAL_TV, CANAL_STREAMING, RADIO_NACIONAL] : [CANAL_STREAMING, RADIO_NACIONAL];
  if (escalao === "segundaLiga") return [CANAL_STREAMING, RADIO_NACIONAL];
  if (escalao === "terceiraLiga" || escalao === "cp") return [RADIO_NACIONAL];
  return [RADIO_LOCAL];
}
