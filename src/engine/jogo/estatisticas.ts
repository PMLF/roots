/**
 * Estatísticas pós-jogo (RZ-105; docs/MOTOR_JOGO.md §6): do resultado do motor ao relatório que a ficha do jogo mostra.
 * Puro e determinístico (as notas levam um ruído estável tirado da seed e do id do jogo). Sem texto: os momentos-chave
 * são estruturados e a interface escreve-os no idioma do gamer. Lesões entram com RZ-107.
 */
import { Rng, clamp } from "../aleatorio/rng";
import type { Params } from "../config/parametros";
import type { Position } from "../mundo/tipos";
import type { Injury } from "../lesoes/lesao";
import { otherSide, type MatchInput, type MatchTeam, type MatchEvent, type SideStat, type Side, type Origin, type MatchSummary } from "./tipos";

export type PlayerStat = {
  id: string;
  side: Side;
  club: string;
  position: Position;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  onTarget: number;
  xg: number;
  missedPenalties: number;
  fouls: number;
  yellows: number;
  /** 1 se foi expulso (vermelho direto ou segundo amarelo). */
  reds: number;
  /** Lesão sofrida neste jogo. */
  injury?: Injury;
  /** Só guarda-redes: remates à baliza defendidos. */
  saves: number;
  concededGoals: number;
  /** 1-10, uma casa decimal. */
  rating: number;
};

export type MatchGoal = { minute: number; side: Side; player: string; assistant?: string; origin: Origin; homeGoals: number; awayGoals: number };

/** O que o golo mudou no marcador, do ponto de vista de quem marcou. «Reviravolta» = passa para a frente depois de ter estado a perder. */
export type GoalContext = "abertura" | "draw" | "turnaround" | "vantagem" | "reducao" | "alargou";

export type MomentKey =
  | { type: "goal"; minute: number; side: Side; player: string; assistant?: string; origin: Origin; context: GoalContext; homeGoals: number; awayGoals: number }
  | { type: "penalti-falhado"; minute: number; side: Side; player: string; goalkeeper?: string; saved: boolean }
  | { type: "grande-defesa"; minute: number; side: Side; player: string; goalkeeper: string; xg: number }
  | { type: "injury"; minute: number; side: Side; player: string; injury: Injury; substitute?: string }
  | { type: "expulsao"; minute: number; side: Side; player: string; secondYellow: boolean }
  | { type: "ocasiao-falhada"; minute: number; side: Side; player: string; xg: number };

export type MatchCard = { minute: number; side: Side; player: string; colour: "yellow" | "red"; secondYellow?: true };

export type MatchInjury = { minute: number; side: Side; player: string; injury: Injury; substitute?: string };

export type MatchReport = {
  duration: number;
  homeGoals: number;
  awayGoals: number;
  /** Golos ao intervalo (até ao minuto `duracao`/2 arredondado, 45 num jogo normal). */
  halfTime: { home: number; away: number };
  homePossession: number;
  home: SideStat;
  away: SideStat;
  /** Golos por ordem, com o marcador depois de cada um. */
  goals: MatchGoal[];
  /** Todos os cartões, por ordem. */
  cards: MatchCard[];
  /** Lesões em jogo, por ordem, com o suplente que entrou (se entrou). */
  injuries: MatchInjury[];
  moments: MomentKey[];
  players: PlayerStat[];
  /** Id do homem do jogo (melhor nota; desempata por golos + assistências, xG e id). */
  matchMan: string;
};

const defensive: Partial<Record<Position, number>> = { GK: 1, RB: 1, CB: 1, LB: 1, DM: 0.5 };
const round = (x: number, homes: number) => Math.round(x * 10 ** homes) / 10 ** homes;

/** `proprios` e `adversario` são os golos ANTES deste golo; `jaPerdia` diz se a equipa já perdeu em algum momento do jogo. */
function goalContext(own: number, opponent: number, alreadyLost: boolean): GoalContext {
  if (own === 0 && opponent === 0) return "abertura";
  if (own + 1 === opponent) return "draw";
  if (own + 1 < opponent) return "reducao";
  if (own === opponent) return alreadyLost ? "turnaround" : "vantagem";
  return "alargou";
}

/**
 * Constrói o relatório. `equipas` tem de incluir todos os jogadores que jogaram (os do onze inicial e, quando
 * houver substituições, os que entraram); um evento de um jogador que lá não está é um erro.
 */
export function matchReport(
  input: Pick<MatchInput, "seed" | "id">,
  teams: { home: MatchTeam; away: MatchTeam },
  events: readonly MatchEvent[],
  summary: MatchSummary,
  params: Params,
): MatchReport {
  const pj = params.match;
  const n = pj.ratings;
  const players = new Map<string, PlayerStat>();
  for (const side of ["home", "away"] as const) {
    for (const [j, minutes] of [...teams[side].lineup.map((x) => [x, summary.duration] as const), ...(teams[side].bench ?? []).map((x) => [x, 0] as const)]) {
      players.set(j.id, { id: j.id, side, club: teams[side].club, position: j.position, minutes, goals: 0, assists: 0, shots: 0, onTarget: 0, xg: 0, missedPenalties: 0, fouls: 0, yellows: 0, reds: 0, saves: 0, concededGoals: 0, rating: n.base });
    }
  }
  const get = (id: string): PlayerStat => {
    const j = players.get(id);
    if (!j) throw new Error(`relatorioDoJogo: jogador ${id} não está nas equipas`);
    return j;
  };

  const scorer = { home: 0, away: 0 };
  const halfTime = { home: 0, away: 0 };
  const alreadyLost = { home: false, away: false };
  const middle = Math.round(pj.duration / 2);
  const goals: MatchGoal[] = [];
  const cards: MatchCard[] = [];
  const injuries: MatchInjury[] = [];
  const moments: MomentKey[] = [];
  /** Ajustes à nota por jogador, antes do clamp. */
  const adjustment = new Map<string, number>();
  const add = (id: string, v: number) => adjustment.set(id, (adjustment.get(id) ?? 0) + v);

  for (const e of events) {
    if (e.type === "foul") {
      const inf = get(e.player);
      inf.fouls++;
      add(e.player, e.penalty ? n.grantedPenalty : n.foul);
      continue;
    }
    if (e.type === "injury") {
      const j = get(e.player);
      j.injury = e.injury;
      j.minutes = Math.min(j.minutes, e.minute);
      moments.push({ type: "injury", minute: e.minute, side: e.side, player: e.player, injury: e.injury });
      injuries.push({ minute: e.minute, side: e.side, player: e.player, injury: e.injury });
      continue;
    }
    if (e.type === "substitution") {
      const playerOut = get(e.playerOut);
      const playerIn = get(e.playerIn);
      playerOut.minutes = Math.min(playerOut.minutes, e.minute);
      playerIn.minutes = summary.duration - e.minute;
      playerIn.position = playerOut.position;
      const m = moments.find((x) => x.type === "injury" && x.player === e.playerOut);
      if (m && m.type === "injury") m.substitute = e.playerIn;
      const l = injuries.find((x) => x.player === e.playerOut);
      if (l) l.substitute = e.playerIn;
      continue;
    }
    if (e.type === "card") {
      const j = get(e.player);
      cards.push({ minute: e.minute, side: e.side, player: e.player, colour: e.colour, ...(e.secondYellow ? { secondYellow: true as const } : {}) });
      if (e.colour === "yellow") {
        j.yellows++;
        add(e.player, n.yellow);
      } else {
        j.reds++;
        j.minutes = Math.min(j.minutes, e.minute);
        add(e.player, n.red);
        moments.push({ type: "expulsao", minute: e.minute, side: e.side, player: e.player, secondYellow: !!e.secondYellow });
      }
      continue;
    }
    if (e.type !== "shot") continue;
    const end = get(e.player);
    end.shots++;
    end.xg += e.xg;
    const gk = e.goalkeeper ? get(e.goalkeeper) : undefined;
    if (e.outcome === "goal") {
      const opp = otherSide(e.side);
      const context = goalContext(scorer[e.side], scorer[opp], alreadyLost[e.side]);
      scorer[e.side]++;
      if (scorer[e.side] > scorer[opp]) alreadyLost[opp] = true;
      if (e.minute <= middle) halfTime[e.side]++;
      end.goals++;
      end.onTarget++;
      add(e.player, n.goal);
      if (e.assistant) {
        get(e.assistant).assists++;
        add(e.assistant, n.attendance);
      }
      const g: MatchGoal = { minute: e.minute, side: e.side, player: e.player, ...(e.assistant ? { assistant: e.assistant } : {}), origin: e.origin, homeGoals: scorer.home, awayGoals: scorer.away };
      goals.push(g);
      moments.push({ type: "goal", ...g, context });
      continue;
    }
    if (e.outcome === "saved") {
      end.onTarget++;
      add(e.player, n.onTargetShot);
      if (gk) {
        gk.saves++;
        add(gk.id, n.defence);
      }
    }
    if (e.origin === "penalty") {
      end.missedPenalties++;
      add(e.player, n.missedPenalty);
      moments.push({ type: "penalti-falhado", minute: e.minute, side: e.side, player: e.player, ...(e.goalkeeper ? { goalkeeper: e.goalkeeper } : {}), saved: e.outcome === "saved" });
    } else if (e.xg >= pj.moments.bigXg) {
      if (e.outcome === "saved" && e.goalkeeper) moments.push({ type: "grande-defesa", minute: e.minute, side: e.side, player: e.player, goalkeeper: e.goalkeeper, xg: e.xg });
      else {
        add(e.player, n.missedChance);
        moments.push({ type: "ocasiao-falhada", minute: e.minute, side: e.side, player: e.player, xg: e.xg });
      }
    }
  }

  // notas: base + ações + defesa + resultado + ruído estável
  const rng = new Rng(input.seed, `jogo/${input.id}/notas`);
  const goalsOf = (l: Side) => scorer[l];
  for (const j of players.values()) {
    const mine = goalsOf(j.side);
    const its = goalsOf(otherSide(j.side));
    const weight = defensive[j.position] ?? 0;
    let rating = n.base + (adjustment.get(j.id) ?? 0);
    if (weight > 0) {
      rating += n.concededGoals * its * weight;
      if (its === 0) rating += n.zeroGoalmouth * weight;
    }
    rating += mine > its ? n.outcome : mine < its ? -n.outcome : 0;
    rating += (rng.derive(j.id).float() * 2 - 1) * n.noise;
    j.rating = round(clamp(rating, n.min, n.max), 1);
    j.xg = round(j.xg, 3);
    j.concededGoals = j.position === "GK" ? its : 0;
  }

  const list = [...players.values()].filter((j) => j.minutes > 0);
  const best = [...list].sort((a, b) => b.rating - a.rating || b.goals + b.assists - (a.goals + a.assists) || b.xg - a.xg || a.id.localeCompare(b.id))[0] as PlayerStat;
  moments.sort((a, b) => a.minute - b.minute);
  return {
    duration: summary.duration,
    homeGoals: scorer.home,
    awayGoals: scorer.away,
    halfTime,
    homePossession: summary.homePossession,
    home: summary.home,
    away: summary.away,
    goals,
    cards,
    injuries,
    moments,
    players: list,
    matchMan: best.id,
  };
}
