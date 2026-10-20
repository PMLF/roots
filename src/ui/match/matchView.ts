import { europeZone, type EuropeSlots } from "@/engine/europe/zones";
import type { LiveMatch } from "@/engine/season/liveMatch";
import type { SideStat, Side } from "@/engine/match/types";

/** Marcador de um jogo à passagem de um minuto. */
export function scorerAt(goals: { minute: number; side: Side }[], minute: number): [number, number] {
  const v = goals.filter((g) => g.minute <= minute);
  return [v.filter((g) => g.side === "home").length, v.filter((g) => g.side === "away").length];
}

export type TableLine = { club: string; name: string; matches: number; points: number; dg: number; gm: number; pos: number; before: number; playing: boolean };

/** A tabela da competição com os resultados que estão a decorrer somados (provisória). */
export function liveTable(match: LiveMatch, minute: number): TableLine[] {
  const matchGoals = match.lines.filter((l) => l.type === "goal").map((l) => ({ minute: l.minute, side: l.side as Side }));
  const ongoing = [
    { home: match.home.id, away: match.away.id, goals: matchGoals },
    ...match.others.map((o) => ({ home: o.home.id, away: o.away.id, goals: o.goals })),
  ];
  const sort = <L extends { points: number; dg: number; gm: number; name: string }>(l: L[]): L[] => l.sort((a, b) => b.points - a.points || b.dg - a.dg || b.gm - a.gm || a.name.localeCompare(b.name));
  const base = match.table.map((l) => ({ club: l.club, name: l.name, matches: l.matches, points: l.points, dg: l.scoredGoals - l.concededGoals, gm: l.scoredGoals, playing: false }));
  const before = new Map(sort([...base]).map((l, i) => [l.club, i + 1] as const));
  const lines = new Map<string, (typeof base)[number]>(base.map((l) => [l.club, { ...l }]));
  for (const e of ongoing) {
    const [gc, gf] = scorerAt(e.goals, minute);
    for (const [club, gm, gs] of [[e.home, gc, gf], [e.away, gf, gc]] as const) {
      const l = lines.get(club);
      if (!l) continue;
      l.matches += 1; l.gm += gm; l.dg += gm - gs; l.playing = true;
      l.points += gm > gs ? match.winPoints : gm === gs ? match.drawPoints : 0;
    }
  }
  return sort([...lines.values()]).map((l, i) => ({ ...l, pos: i + 1, before: before.get(l.club) ?? i + 1 }));
}

export type StatisticKey = "xg" | "possession" | "chances" | "shots" | "onTarget" | "away" | "blocked" | "accuracy" | "saves" | "corners" | "fouls" | "yellows" | "reds" | "injuries";
export type StatisticLine = { rowKey: StatisticKey; home: number; away: number; /** Como mostrar os valores. */ format: "integer" | "decimal" | "percentagem" };

/** As estatísticas do jogo, lado a lado (14 linhas), a partir do resumo do motor. A ordem é a de leitura: o que mais interessa primeiro. */
export function matchStatistics(summary: { home: SideStat; away: SideStat; homePossession: number }): StatisticLine[] {
  const { home, away } = summary;
  const ao = (e: SideStat) => e.shots - e.onTarget - e.blocked;
  const accuracy = (e: SideStat) => (e.shots > 0 ? e.onTarget / e.shots : 0);
  // defesas do guarda-redes de um lado: remates enquadrados do adversário que não foram golo
  const saves = (their: SideStat) => Math.max(0, their.onTarget - their.goals);
  return [
    { rowKey: "xg", home: home.xg, away: away.xg, format: "decimal" },
    { rowKey: "possession", home: summary.homePossession, away: 1 - summary.homePossession, format: "percentagem" },
    { rowKey: "chances", home: home.chances, away: away.chances, format: "integer" },
    { rowKey: "shots", home: home.shots, away: away.shots, format: "integer" },
    { rowKey: "onTarget", home: home.onTarget, away: away.onTarget, format: "integer" },
    { rowKey: "away", home: ao(home), away: ao(away), format: "integer" },
    { rowKey: "blocked", home: home.blocked, away: away.blocked, format: "integer" },
    { rowKey: "accuracy", home: accuracy(home), away: accuracy(away), format: "percentagem" },
    { rowKey: "saves", home: saves(away), away: saves(home), format: "integer" },
    { rowKey: "corners", home: home.corners, away: away.corners, format: "integer" },
    { rowKey: "fouls", home: home.fouls, away: away.fouls, format: "integer" },
    { rowKey: "yellows", home: home.yellows, away: away.yellows, format: "integer" },
    { rowKey: "reds", home: home.reds, away: away.reds, format: "integer" },
    { rowKey: "injuries", home: home.injuries, away: away.injuries, format: "integer" },
  ];
}

/** Zona da tabela numa posição: campeão, subida ou descida (as mesmas regras das outras tabelas). */
export function positionZone(pos: number, total: number, zones?: { promoted: number; relegated: number; europe?: EuropeSlots }): "champion" | "promotion" | "relegation" | "cl" | "clq" | "el" | "ecl" | undefined {
  if (!zones) return pos === 1 ? "champion" : undefined;
  if (pos === 1) return "champion";
  if (zones.europe) { const z = europeZone(pos, zones.europe); if (z) return z; }
  if (pos <= zones.promoted) return "promotion";
  if (zones.relegated > 0 && pos > total - zones.relegated) return "relegation";
  return undefined;
}
