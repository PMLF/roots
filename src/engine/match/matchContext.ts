/**
 * Árbitro e transmissão de um jogo. Provisório até aos direitos de transmissão (RZ-218) e aos árbitros como pessoas (RZ-222):
 * o árbitro é um nome fictício sorteado de forma estável pelo jogo e os canais dependem do escalão e da competição.
 * Os nomes dos canais são fictícios (nada de marcas reais).
 */
import { Rng } from "../random/rng";
import type { Tier } from "../config/parameters";
import { generateName } from "../world/names";

type BroadcastMiddle = "tv" | "streaming" | "radio";
export type BroadcastChannel = { name: string; middle: BroadcastMiddle };

/** O árbitro do jogo: sempre o mesmo para o mesmo save e jogo. */
export function matchReferee(seed: string, match: string): string {
  return generateName(new Rng(seed, `arbitro/${match}`), "portugal").full;
}

const TV_CHANNEL: BroadcastChannel = { name: "Canal Liga", middle: "tv" };
const IS_OPEN_TV_CHANNEL: BroadcastChannel = { name: "Canal Nacional", middle: "tv" };
const STREAMING_CHANNEL: BroadcastChannel = { name: "BolaPlay", middle: "streaming" };
const NATIONAL_RADIO: BroadcastChannel = { name: "Rádio Bola", middle: "radio" };
const LOCAL_RADIO: BroadcastChannel = { name: "Rádio Local", middle: "radio" };

/** Quem transmite o jogo (vazio se ninguém). Na Primeira Liga um jogo em cada três vai também à televisão. */
export function matchChannels(tier: Tier, competition: string, seed: string, match: string): BroadcastChannel[] {
  if (competition === "CP Final") return [IS_OPEN_TV_CHANNEL, STREAMING_CHANNEL, NATIONAL_RADIO];
  if (tier === "firstLeague") return new Rng(seed, `canal/${match}`).float() < 1 / 3 ? [TV_CHANNEL, STREAMING_CHANNEL, NATIONAL_RADIO] : [STREAMING_CHANNEL, NATIONAL_RADIO];
  if (tier === "secondLeague") return [STREAMING_CHANNEL, NATIONAL_RADIO];
  if (tier === "thirdLeague" || tier === "cp") return [NATIONAL_RADIO];
  return [LOCAL_RADIO];
}
