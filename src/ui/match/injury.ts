import type { LiveMatch } from "@/engine/season/liveMatch";

/** Lesionados do gamer à espera de troca e se ainda há substituições para o fazer; só então o jogo tem de esperar pela troca. */
export function pendingInjuries(match: Pick<LiveMatch, "pendingInjury" | "teams" | "gamerSide" | "subs"> | undefined): { names: string[]; mustReplace: boolean } {
  const ids = match?.pendingInjury ?? [];
  if (!match || ids.length === 0) return { names: [], mustReplace: false };
  const team = match.teams?.[match.gamerSide ?? "home"] ?? [];
  const names = ids.map((id) => team.find((j) => j.id === id)?.name ?? "").filter((n) => n !== "");
  const left = match.subs ? match.subs.used < match.subs.max : false;
  return { names, mustReplace: left };
}
