/**
 * Jogo ao vivo (RZ-130): o jogo do clube do gamer é simulado inteiro de uma vez e a linha do tempo fica guardada no save
 * (`live.<jogo>`; só os últimos jogos) para a interface a reproduzir minuto a minuto, com pausa e velocidade.
 * Os outros jogos só deixam o resumo público (golos, vermelhos, lesões, melhor em campo).
 */
import type { MatchReport } from "../match/statistics";
import type { MatchTeam, MatchEvent, Side, ShotResult, MatchSummary, Tactic } from "../match/types";
import type { Position } from "../world/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

type LiveLineType = "start" | "goal" | "shot" | "corner" | "penalty" | "card" | "injury" | "substitution" | "halfTime" | "end";

export type LiveLine = {
  minute: number;
  type: LiveLineType;
  side?: Side;
  player?: string;
  name?: string;
  assistant?: string;
  /** Ids para a interface ligar os nomes às fichas (jogos guardados antes não os têm). */
  assistantId?: string;
  inId?: string;
  /** Quem entra, numa substituição. */
  playerIn?: string;
  outcome?: ShotResult;
  colour?: "yellow" | "red";
  secondYellow?: boolean;
  /** Notificar: golos, cartões, penáltis, lesões e substituições. Os remates e cantos só enchem o feed. */
  important: boolean;
  /** Num golo: o que muda no jogo, do ponto de vista de quem marca (para o comentário). */
  situation?: "opens" | "equalises" | "turns" | "rises" | "drops";
  /** Marcador depois deste lance. */
  homeGoals: number;
  awayGoals: number;
};

/**
 * Um jogador no jogo (painel «Equipas»): o onze inicial e o banco, com a nota ao minuto, o que fez e quando entrou ou saiu.
 * `estado`: em campo, no banco (ainda não entrou), substituído, ou expulso.
 */
export type LivePlayer = {
  id: string;
  name: string;
  position: Position;
  state: "pitch" | "bench" | "left" | "sentOff";
  /** Só quem já jogou. */
  rating?: number;
  /** Estrelas de nível (só nos jogadores do clube do gamer). */
  stars?: number;
  goals: number;
  assists: number;
  yellows: number;
  red: boolean;
  injured: boolean;
  /** Minuto em que entrou (suplentes). */
  cameOn?: number;
  /** Minuto em que saiu (substituído, lesionado, expulso). */
  left?: number;
  /** Quem o substituiu / quem substituiu. */
  substitutionWith?: { id: string; name: string };
  /** Posições que sabe jogar, com a aptidão (1-20): para escolher substituições. */
  positions?: { pos: string; aptitude: number }[];
};

/** Substituições e pausas do gamer neste jogo (as lesões também gastam substituições, mas não pausas). */
export type LiveSubs = { used: number; max: number; usedPauses: number; pausesMax: number };
export type LiveTeams = { home: LivePlayer[]; away: LivePlayer[] };

/** Constrói o painel das equipas no minuto a que `eventos` e `relatorio` chegam. */
export function matchTeams(teams: { home: MatchTeam; away: MatchTeam }, events: readonly MatchEvent[], report: MatchReport, name: (id: string) => string, current?: ReadonlyMap<string, string>): LiveTeams {
  const stat = new Map(report.players.map((j) => [j.id, j] as const));
  const cameOn = new Map<string, number>();
  const left = new Map<string, { minute: number; sentOff: boolean }>();
  const substitution = new Map<string, string>();
  for (const e of events) {
    if (e.type === "substitution") {
      cameOn.set(e.playerIn, e.minute);
      left.set(e.playerOut, { minute: e.minute, sentOff: false });
      substitution.set(e.playerOut, e.playerIn);
      substitution.set(e.playerIn, e.playerOut);
    } else if (e.type === "card" && e.colour === "red") left.set(e.player, { minute: e.minute, sentOff: true });
  }
  const side = (l: Side): LivePlayer[] =>
    [...teams[l].lineup, ...(teams[l].bench ?? [])].map((j, i) => {
      const st = stat.get(j.id);
      const initial = i < teams[l].lineup.length;
      const playerOut = left.get(j.id);
      const entity = cameOn.get(j.id);
      const played = initial || entity !== undefined;
      const other = substitution.get(j.id);
      return {
        id: j.id, name: name(j.id), position: (current?.get(j.id) as Position | undefined) ?? st?.position ?? j.position,
        state: playerOut ? (playerOut.sentOff ? "sentOff" : "left") : played ? "pitch" : "bench",
        ...(played && st ? { rating: st.rating } : {}),
        goals: st?.goals ?? 0, assists: st?.assists ?? 0, yellows: st?.yellows ?? 0, red: (st?.reds ?? 0) > 0, injured: !!st?.injury,
        ...(entity !== undefined ? { cameOn: entity } : {}), ...(playerOut ? { left: playerOut.minute } : {}),
        ...(other ? { substitutionWith: { id: other, name: name(other) } } : {}),
        ...(j.positions ? { positions: j.positions.map((x) => ({ pos: x.pos, aptitude: x.aptitude })) } : {}),
      };
    });
  return { home: side("home"), away: side("away") };
}

/** Uma linha da tabela da competição antes dos jogos de hoje. */
export type LiveTableLine = { club: string; name: string; matches: number; points: number; scoredGoals: number; concededGoals: number };

/** Outro jogo da mesma competição no mesmo dia: só os golos (o que se sabe dos jogos que não são o teu). */
export type OtherLiveMatch = {
  id: string;
  home: { id: string; name: string };
  away: { id: string; name: string };
  duration: number;
  goals: { minute: number; side: Side }[];
  homeGoals: number;
  awayGoals: number;
  /** Jogo a eliminar: houve prolongamento e/ou penáltis (RZ-244). */
  extraTime?: boolean;
  shootout?: { home: number; away: number };
};

/** Um jogo anterior entre as duas equipas (do ponto de vista de quem joga em casa agora não importa: guarda quem jogou onde). */
export type LiveMeeting = { id: string; date: IsoDate; competition: string; season: number; home: string; away: string; homeGoals: number; awayGoals: number };

/** O que se sabe do jogo além do que acontece em campo. Árbitro e transmissão entram quando existirem (RZ-218, RZ-222). */
export type MatchInfo = {
  stadium: { name: string; locality: string; capacity: number };
  /** Adeptos no estádio (pré-visualização determinística; o valor registado é o mesmo). */
  attendance: number;
  referee?: string;
  /** Quem transmite o jogo (televisão, streaming, rádio). */
  channels?: { name: string; middle: "tv" | "streaming" | "radio" }[];
};

/** xG acumulado de cada equipa em cada minuto (índice = minuto; o 0 é sempre 0). */
export type XgCurve = { home: number[]; away: number[] };

/** Constrói a curva de xG até ao minuto `ate` a partir dos remates. */
export function xgCurve(events: readonly MatchEvent[], until: number): XgCurve {
  const n = Math.max(0, Math.floor(until));
  const home = new Array<number>(n + 1).fill(0);
  const away = new Array<number>(n + 1).fill(0);
  for (const e of events) {
    if (e.type !== "shot") continue;
    const m = Math.min(n, Math.max(0, Math.ceil(e.minute)));
    (e.side === "home" ? home : away)[m]! += e.xg;
  }
  for (const v of [home, away]) for (let i = 1; i <= n; i++) v[i] = Math.round((v[i]! + v[i - 1]!) * 1000) / 1000;
  return { home, away };
}

export type LiveMatch = {
  id: string;
  competition: string;
  round: number;
  date: IsoDate;
  home: { id: string; name: string };
  away: { id: string; name: string };
  duration: number;
  homeGoals: number;
  awayGoals: number;
  lines: LiveLine[];
  /** Tabela antes dos jogos de hoje; a interface soma-lhe os marcadores a cada minuto. */
  table: LiveTableLine[];
  winPoints: number;
  drawPoints: number;
  others: OtherLiveMatch[];
  /** Cores de cada clube que aparece no jogo (casa, fora e tabela). */
  colours?: Record<string, string>;
  /** Escalão de cada clube que aparece (para as etiquetas 1L, 2L… nos resultados). */
  tiers?: Record<string, string>;
  /** As duas equipas: onze, banco, notas e o que cada jogador fez (ao minuto, ou as finais num jogo guardado). */
  teams?: LiveTeams;
  /** Estatísticas do jogo (as finais num jogo guardado; as do minuto atual ao vivo). */
  summary?: MatchSummary;
  /** Evolução do xG por minuto (até ao minuto atual ao vivo). */
  xg?: XgCurve;
  /** Últimos jogos entre as duas equipas, mais recente primeiro. */
  meetings?: LiveMeeting[];
  /** Substituições e pausas que o gamer já gastou (só ao vivo). */
  subs?: LiveSubs;
  /** Estádio, assistência, árbitro, ... */
  info?: MatchInfo;
  /** Quantos sobem e descem nesta competição (para as zonas da tabela). */
  zones?: { promoted: number; relegated: number; europe?: { rank: number; championsLeague: number; championsQualifying: number; europaLeague: number; conferenceLeague: number } };
  /** De que lado joga o clube do gamer. */
  gamerSide?: Side;
  /** Só ao vivo (RZ-170): o jogo está a decorrer, no minuto indicado, com esta tática do lado do gamer. */
  ongoing?: boolean;
  minute?: number;
  /** Lesionados da equipa do gamer à espera de substituição (o jogo pára até ele decidir). */
  pendingInjury?: string[];
  tactic?: Tactic;
};

const SAVE = 6;

/** Chave do save onde fica o jogo do gamer que está a decorrer (RZ-170). */
export const SESSION_KEY = "session";

/** Converte os eventos do motor no feed do jogo (sem os «lances» simples, que são ruído). */
export function matchLines(events: readonly MatchEvent[], duration: number, name: (id: string) => string): LiveLine[] {
  let gc = 0;
  let gf = 0;
  const out: LiveLine[] = [];
  const base = (e: { minute: number; side: Side }) => ({ minute: e.minute, side: e.side });
  const scorer = () => ({ homeGoals: gc, awayGoals: gf });
  // um segundo amarelo aparece como um só lance (amarelo e vermelho no mesmo cartão), não como dois
  const secondYellows = new Set(events.filter((e) => e.type === "card" && e.secondYellow).map((e) => `${e.minute}/${(e as { player: string }).player}`));
  for (const e of [...events].sort((a, b) => a.minute - b.minute)) {
    if (e.type === "card" && e.colour === "yellow" && secondYellows.has(`${e.minute}/${e.player}`)) continue;
    if (e.type === "shot") {
      let situation: LiveLine["situation"];
      if (e.outcome === "goal") {
        const ownSquad = e.side === "home" ? gc : gf;
        const their = e.side === "home" ? gf : gc;
        situation = ownSquad + their === 0 ? "opens" : ownSquad + 1 === their ? "equalises" : ownSquad + 1 < their ? "drops" : ownSquad === their ? "turns" : "rises";
        if (e.side === "home") gc++; else gf++;
      }
      out.push({ ...base(e), type: e.outcome === "goal" ? "goal" : "shot", ...(situation ? { situation } : {}), player: e.player, name: name(e.player), ...(e.assistant ? { assistant: name(e.assistant), assistantId: e.assistant } : {}), outcome: e.outcome, important: e.outcome === "goal", ...scorer() });
    } else if (e.type === "corner") out.push({ ...base(e), type: "corner", important: false, ...scorer() });
    else if (e.type === "foul" && e.penalty) out.push({ ...base(e), type: "penalty", player: e.player, name: name(e.player), important: true, ...scorer() });
    else if (e.type === "card") out.push({ ...base(e), type: "card", player: e.player, name: name(e.player), colour: e.colour, ...(e.secondYellow ? { secondYellow: true } : {}), important: true, ...scorer() });
    else if (e.type === "injury") out.push({ ...base(e), type: "injury", player: e.player, name: name(e.player), important: true, ...scorer() });
    else if (e.type === "substitution") out.push({ ...base(e), type: "substitution", player: e.playerOut, name: name(e.playerOut), playerIn: name(e.playerIn), inId: e.playerIn, important: true, ...scorer() });
  }
  // intervalo: marcador à passagem dos 45 minutos
  const onHalfTime = out.filter((l) => l.minute <= 45).at(-1);
  out.push({ minute: 0, type: "start", important: false, homeGoals: 0, awayGoals: 0 });
  out.push({ minute: 45, type: "halfTime", important: false, homeGoals: onHalfTime?.homeGoals ?? 0, awayGoals: onHalfTime?.awayGoals ?? 0 });
  out.push({ minute: duration, type: "end", important: false, ...scorer() });
  return out.sort((a, b) => a.minute - b.minute || (a.type === "halfTime" ? 1 : 0) - (b.type === "halfTime" ? 1 : 0));
}

export function saveLiveMatch(repo: Repository, match: LiveMatch): void {
  repo.setMeta(`live.${match.id}`, JSON.stringify(match));
  const ids = (JSON.parse(repo.meta("live.list") || "[]") as string[]).filter((x) => x !== match.id);
  ids.push(match.id);
  while (ids.length > SAVE) repo.setMeta(`live.${ids.shift()}`, "");
  repo.setMeta("live.list", JSON.stringify(ids));
}

/** O jogo pedido ou, sem id, o último jogo do clube do gamer. */
export function readLiveMatch(repo: Repository, id?: string): LiveMatch | null {
  const ids = JSON.parse(repo.meta("live.list") || "[]") as string[];
  const target = id ?? ids.at(-1);
  const raw = target ? repo.meta(`live.${target}`) : undefined;
  return raw ? (JSON.parse(raw) as LiveMatch) : null;
}

