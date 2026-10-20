/**
 * Motor de jogo por oportunidades (RZ-104; docs/GAME_ENGINE.md).
 *
 * Cada minuto é um passo independente: o seu fluxo aleatório vem de `jogo/<id>/m<minuto>`, por isso
 * `simularAte(45)` seguido de `simularAte(90)` dá exatamente o mesmo jogo que `simularAte(90)` (retomável),
 * e mudar a equipa a meio (`alterarEquipa`) só afeta os minutos seguintes.
 * Puro e determinístico: sem relógio, sem DOM, sem base de dados.
 */
import type { Position } from "../world/types";
import { Rng, clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import { aptitudeIn, areaEdge, teamStrength, type TeamStrength } from "./team";
import { riskPer90, drawLotsInjury } from "../injuries/injury";
import { DEFAULT_TACTIC, cornerShotMultiplier, fatigueIn, foulsMultiplier, styleWeights, toughness } from "./formations";
import { otherSide, type MatchInput, type MatchTeam, type SideStat, type MatchEvent, type OnPitchPlayer, type Side, type Origin, type MatchSummary, type Tactic, type Shootout } from "./types";

const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoide = (x: number): number => 1 / (1 + Math.exp(-x));

const newSide = (): SideStat => ({ goals: 0, chances: 0, shots: 0, onTarget: 0, blocked: 0, xg: 0, corners: 0, fouls: 0, possessionMinutes: 0, yellows: 0, reds: 0, injuries: 0 });

function chooseWeighted<T>(rng: Rng, items: readonly T[], weight: (x: T) => number): T {
  let total = 0;
  const weights = items.map((x) => {
    const w = Math.max(0, weight(x));
    total += w;
    return w;
  });
  if (total <= 0) return items[rng.integer(0, items.length - 1)] as T;
  let r = rng.float() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] as number;
    if (r < 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

export class MatchSimulator {
  /** Duração regular (90 + acréscimos). Os minutos de prolongamento só contam se o jogo a eliminar acabar empatado. */
  readonly regularDuration: number;
  private readonly extraDuration: number;
  private extraTime = false;
  private readonly knockout: boolean;
  private readonly neutral: boolean;
  private readonly carry: { home: number; away: number };
  private shootoutCache: Shootout | undefined;
  private readonly rng: Rng;
  private readonly p: Params["match"];
  private readonly params: Params;
  private teams: Record<Side, MatchTeam>;
  private strengths: Record<Side, TeamStrength>;
  /** Força em cada minuto: a base menos o cansaço (RZ-108). */
  private effective: Record<Side, TeamStrength>;
  private last = 0;
  /** Expulsos de cada lado: não voltam a jogar, nem com `alterarEquipa`. */
  private readonly sentOff: Record<Side, Set<string>> = { home: new Set(), away: new Set() };
  /** Lesionados sem suplente: jogam menos um (penalização igual à de um expulso). */
  private readonly withoutSubstitute: Record<Side, number> = { home: 0, away: 0 };
  /** Lado com substituições manuais (o do gamer): quem se lesiona sai sem suplente automático e fica à espera de troca. */
  private readonly manualSide: Side | undefined;
  private readonly pending: Record<Side, Map<string, OnPitchPlayer>> = { home: new Map(), away: new Map() };
  private readonly turf: number;
  /** Quem se lesionou neste jogo não volta. */
  private readonly baseRisks: Record<Side, number[] | undefined> = { home: undefined, away: undefined };
  private readonly injured: Record<Side, Set<string>> = { home: new Set(), away: new Set() };
  private readonly yellows: Record<Side, Set<string>> = { home: new Set(), away: new Set() };
  private readonly stats: Record<Side, SideStat> = { home: newSide(), away: newSide() };

  constructor(input: MatchInput, params: Params, options?: { manualSubs?: Side }) {
    this.manualSide = options?.manualSubs;
    this.p = params.match;
    this.params = params;
    this.turf = input.turf ?? 0.5;
    this.rng = new Rng(input.seed, `jogo/${input.id}`);
    const a = this.p.stoppage;
    this.regularDuration = this.p.duration + this.rng.derive("stoppage").integer(a.min, a.max);
    const x = this.p.extraTime;
    this.extraDuration = x.minutes + this.rng.derive("extraStoppage").integer(x.stoppage.min, x.stoppage.max);
    this.knockout = input.knockout ?? false;
    this.neutral = input.neutral ?? false;
    this.carry = input.carry ?? { home: 0, away: 0 };
    this.teams = { home: input.home, away: input.away };
    this.strengths = { home: this.computeStrength(input.home, "home"), away: this.computeStrength(input.away, "away") };
    this.effective = { home: this.strengths.home, away: this.strengths.away };
  }

  private computeStrength(eq: MatchTeam, side: Side): TeamStrength {
    return teamStrength(eq.lineup, eq.tactic ?? DEFAULT_TACTIC, this.params, this.boldness(eq, side));
  }

  /**
   * Quanto rendem as opções arrojadas (mentalidade, estilo, linha, área) neste contexto (RZ-249): mais em casa que fora,
   * mais com a equipa em forma, mais com um treinador que sabe de táticas. 1 = neutro.
   */
  private boldness(eq: MatchTeam, side: Side): number {
    const c = this.params.tactic.context;
    const form = eq.lineup.length > 0 ? eq.lineup.reduce((a, j) => a + j.form, 0) / eq.lineup.length : 0.95;
    const venue = this.neutral ? 0 : side === "home" ? c.home : -c.home;
    return clamp(1 + venue + c.form * (form - 0.95) + c.coach * ((eq.coach ?? 10) - 10), c.min, c.max);
  }
  private tactic(side: Side): Tactic {
    return this.teams[side].tactic ?? DEFAULT_TACTIC;
  }

  /** Duração total até agora: regular, mais o prolongamento quando o jogo a eliminar chegou empatado ao fim dos 90'. */
  get duration(): number {
    return this.regularDuration + (this.extraTime ? this.extraDuration : 0);
  }
  get minute(): number {
    return this.last;
  }
  get finished(): boolean {
    return this.last >= this.duration;
  }
  /** Empatado, contando os golos da primeira mão (se houver). */
  private level(): boolean {
    return this.stats.home.goals + this.carry.home === this.stats.away.goals + this.carry.away;
  }

  /** Muda a equipa (substituições, tática…) a partir do minuto seguinte. */
  changeTeam(side: Side, team: MatchTeam): void {
    const away = (j: OnPitchPlayer) => this.sentOff[side].has(j.id) || this.injured[side].has(j.id);
    this.teams[side] = { ...team, lineup: team.lineup.filter((j) => !away(j)), ...(team.bench ? { bench: team.bench.filter((j) => !away(j)) } : {}) };
    this.strengths[side] = this.computeStrength(this.teams[side], side);
    this.baseRisks[side] = undefined;
  }

  /** A equipa de um lado neste momento: quem está em campo e o banco que resta. */
  team(side: Side): MatchTeam {
    return this.teams[side];
  }

  /**
   * Substituições do treinador (RZ-215): cada `entra` (do banco) ocupa a posição de `sai` (em campo). Valem a partir do minuto
   * seguinte. Os limites (5 substituições, 3 pausas) são da sessão do jogo, não do simulador.
   */
  substitute(side: Side, substitutions: readonly { playerOut: string; playerIn: string }[]): MatchEvent[] {
    const out: MatchEvent[] = [];
    let eq = this.teams[side];
    for (const t of substitutions) {
      const injured = this.pending[side].get(t.playerOut);
      const playerOut = injured ?? eq.lineup.find((j) => j.id === t.playerOut);
      const playerIn = (eq.bench ?? []).find((j) => j.id === t.playerIn);
      if (!playerOut) throw new Error(`substituir: ${t.playerOut} não está em campo`);
      if (!playerIn) throw new Error(`substituir: ${t.playerIn} não está no banco`);
      const fresh: OnPitchPlayer = { ...playerIn, position: playerOut.position, ...(playerIn.positions ? { aptitude: aptitudeIn(playerIn.positions, playerOut.position, this.params) } : {}) };
      // um lesionado já saiu do onze: o suplente entra como acrescento e a equipa deixa de jogar com menos um
      eq = { ...eq, lineup: injured ? [...eq.lineup, fresh] : eq.lineup.map((j) => (j.id === playerOut.id ? fresh : j)), bench: (eq.bench ?? []).filter((b) => b.id !== playerIn.id) };
      if (injured) {
        this.pending[side].delete(t.playerOut);
        this.withoutSubstitute[side] = Math.max(0, this.withoutSubstitute[side] - 1);
      }
      out.push({ type: "substitution", minute: this.last, side, playerOut: playerOut.id, playerIn: playerIn.id, reason: injured ? "injury" : "coach" });
    }
    this.teams[side] = eq;
    this.strengths[side] = this.computeStrength(eq, side);
    this.baseRisks[side] = undefined;
    this.updateEffective(this.last);
    return out;
  }

  /**
   * Reposicionamento do treinador (RZ-255): cada jogador em campo passa a jogar na posição indicada (a aptidão recalcula-se).
   * Não gasta substituições nem pausas. Serve para reorganizar a equipa depois de uma expulsão ou lesão (uma posição pode ficar vazia).
   */
  reposition(side: Side, moves: readonly { player: string; position: Position }[]): void {
    const eq = this.teams[side];
    const by = new Map(moves.map((m) => [m.player, m.position] as const));
    for (const id of by.keys()) if (!eq.lineup.some((j) => j.id === id)) throw new Error(`reposicionar: ${id} não está em campo`);
    const lineup = eq.lineup.map((j) => {
      const position = by.get(j.id);
      if (!position || position === j.position) return j;
      return { ...j, position, ...(j.positions ? { aptitude: aptitudeIn(j.positions, position, this.params) } : {}) };
    });
    this.teams[side] = { ...eq, lineup };
    this.strengths[side] = this.computeStrength(this.teams[side], side);
    this.baseRisks[side] = undefined;
    this.updateEffective(this.last);
  }

  /** Lesionados à espera de substituição (só no lado manual). */
  pendingInjuries(side: Side): string[] {
    return [...this.pending[side].keys()];
  }

  /** Muda só a tática de um lado (RZ-170): vale a partir do minuto seguinte. */
  changeTactic(side: Side, tactic: Tactic): void {
    this.changeTeam(side, { ...this.teams[side], tactic });
  }

  /** Simula até ao minuto indicado (inclusive) e devolve os eventos novos, por ordem. */
  simulateUntil(minute: number): MatchEvent[] {
    const target = Math.floor(minute);
    const events: MatchEvent[] = [];
    while (this.last < target && this.last < this.duration) {
      this.last++;
      this.step(this.last, events);
      // fim dos 90' num jogo a eliminar empatado: segue-se o prolongamento
      if (this.knockout && !this.extraTime && this.last >= this.regularDuration && this.level()) this.extraTime = true;
    }
    return events;
  }

  /**
   * Série de penáltis, se o jogo a eliminar acabou empatado depois do prolongamento. Determinística por jogo: marcadores por
   * ordem de qualidade (guarda-redes no fim), cobranças alternadas, depois morte súbita com a mesma ordem.
   */
  shootout(): Shootout | undefined {
    if (!this.knockout || !this.finished || !this.level()) return undefined;
    if (this.shootoutCache) return this.shootoutCache;
    const c = this.params.knockoutRounds.penalties;
    const r = this.rng.derive("shootout");
    const order = (side: Side) => [...this.teams[side].lineup].sort((a, b) => (a.position === "GK" ? 1 : 0) - (b.position === "GK" ? 1 : 0) || b.attributes.penalties * b.form - a.attributes.penalties * a.form || (a.id < b.id ? -1 : 1));
    const keeper = (side: Side) => {
      const g = this.teams[side].lineup.find((j) => j.position === "GK");
      return g ? (g.attributes.reflexes + g.attributes.handling) / 2 : 10;
    };
    const takers = { home: order("home"), away: order("away") };
    const out: Shootout = { home: 0, away: 0, kicks: [] };
    const kick = (side: Side, n: number) => {
      const t = takers[side];
      const taker = t[n % t.length] as OnPitchPlayer;
      const p = clamp(c.goalProb + c.takerSkill * (taker.attributes.penalties - 10) - c.keeperSkill * (keeper(otherSide(side)) - 10), 0.4, 0.95);
      const scored = r.prob(p);
      if (scored) out[side]++;
      out.kicks.push({ side, player: taker.id, scored });
    };
    for (let i = 0; i < c.initial; i++) {
      kick("home", i);
      kick("away", i);
      const remain = c.initial - 1 - i;
      // decidido antes do fim: quem fica atrás já não alcança
      if (out.home > out.away + remain || out.away > out.home + remain) break;
    }
    // morte súbita
    for (let i = c.initial; out.home === out.away && i < c.initial + 60; i++) {
      kick("home", i);
      kick("away", i);
    }
    if (out.home === out.away) { out.home++; out.kicks.push({ side: "home", player: (takers.home[0] as OnPitchPlayer).id, scored: true }); }
    this.shootoutCache = out;
    return out;
  }

  summary(): MatchSummary {
    const total = this.stats.home.possessionMinutes + this.stats.away.possessionMinutes;
    return {
      minute: this.last,
      duration: this.duration,
      regularDuration: this.regularDuration,
      extraTime: this.extraTime,
      finished: this.finished,
      home: { ...this.stats.home },
      away: { ...this.stats.away },
      homePossession: total > 0 ? this.stats.home.possessionMinutes / total : 0.5,
      ...(this.shootout() ? { shootout: this.shootout() as Shootout } : {}),
    };
  }

  // ---------- um minuto
  /** Fração das oportunidades que cabe a `lado`: logística da diferença de controlo (com a vantagem da casa). */
  private quota(side: Side): number {
    const c = this.effective.home.control + (this.neutral ? 0 : this.p.homeAdvantage) - this.effective.away.control;
    const home = sigmoide(c / this.p.controlScale);
    return side === "home" ? home : 1 - home;
  }

  /** Força de cada lado neste minuto: base, cansaço, jogadores expulsos e estilos que reagem ao adversário. */
  private updateEffective(m: number): void {
    const pen = this.p.cards.sentOffPenalty;
    for (const side of ["home", "away"] as const) {
      const f = fatigueIn(m, this.regularDuration, this.tactic(side), this.params.tactic);
      const b = this.strengths[side];
      const x = this.sentOff[side].size + this.withoutSubstitute[side];
      this.effective[side] = { ...b, attack: b.attack - f * 0.5 - pen.attack * x, control: b.control - f - pen.control * x, defence: b.defence - f - pen.defence * x };
    }
    // estilos que reagem ao adversário: o contra-ataque rende mais quanto mais bola o outro tem; o jogo direto explora linhas altas
    for (const side of ["home", "away"] as const) {
      const t = this.tactic(side);
      const w = styleWeights(t);
      const c = this.params.tactic.counterAttack;
      const scale = this.boldness(this.teams[side], side);
      const open = clamp(this.effective[otherSide(side)].control - this.effective[side].control, 0, c.max);
      const e = this.effective[side];
      const edge = clamp(areaEdge(this.teams[side].lineup, this.teams[otherSide(side)].lineup, t.area) / this.params.tactic.area.scale, -1, 1);
      this.effective[side] = {
        ...e,
        attack: e.attack + scale * (this.params.tactic.attackDirectPerLine * w.direct * Math.max(0, this.tactic(otherSide(side)).line - 3) + c.attackPerPoint * w.counter * open + this.params.tactic.area.attack * edge),
        defence: e.defence + c.defencePerPoint * w.counter * open,
      };
    }
  }

  /** Quanto «queima tempo» a equipa que ganha (0 a 1; negativo se aproveita cada segundo): só depois do minuto `timeWasting.start`. */
  private wasting(side: Side, m: number): number {
    const u = this.params.tactic.timeWasting;
    if (m < u.start) return 0;
    const lead = this.stats[side].goals + this.carry[side] - (this.stats[otherSide(side)].goals + this.carry[otherSide(side)]);
    return lead > 0 ? (this.tactic(side).timeWasting - 3) / 2 : 0;
  }

  private step(m: number, out: MatchEvent[]): void {
    const r = this.rng.derive(`m${m}`);
    this.updateEffective(m);
    const tempo = 1 + (this.params.tactic.tempo.chances * (this.tactic("home").intensity + this.tactic("away").intensity - 6)) / 2;
    const u = this.params.tactic.timeWasting;
    const burning = Math.max(this.wasting("home", m), this.wasting("away", m));
    this.stats[r.prob(this.quota("home")) ? "home" : "away"].possessionMinutes++;
    for (const side of ["home", "away"] as const) {
      // quem ganha e queima tempo corta as oportunidades dos dois; quem perde e aproveita cada segundo cria mais
      const hurry = this.wasting(otherSide(side), m) > 0 ? 0 : 1 + u.hurry * Math.max(0, (3 - this.tactic(side).timeWasting) / 2);
      const lambda = (2 * this.p.chancesPerTeam * tempo * this.quota(side) * (1 - u.chances * Math.max(0, burning)) * (burning > 0 ? 1 : hurry)) / this.regularDuration;
      if (r.prob(lambda)) this.chance(r, m, side, out);
    }
    for (const side of ["home", "away"] as const) {
      if (r.prob((this.p.fouls.byTeam * foulsMultiplier(this.tactic(side), this.params.tactic)) / this.regularDuration)) this.foul(r, m, side, out);
    }
    for (const side of ["home", "away"] as const) this.injuryPossible(r, m, side, out);
  }

  private difference(side: Side): number {
    return this.effective[side].attack - this.effective[otherSide(side)].defence;
  }

  private chance(r: Rng, m: number, side: Side, out: MatchEvent[]): void {
    const eq = this.teams[side];
    this.stats[side].chances++;
    const d = this.difference(side);
    const sh = this.params.tactic.shooting;
    const shotP = sigmoide(logit(this.p.baseShotP) + (this.p.sensitivity.shot * d) / 10 + sh.shotLogit * (this.tactic(side).shooting - 3));
    if (!r.prob(shotP)) {
      const driver = chooseWeighted(r, eq.lineup, (j) => this.p.attendanceWeight[j.position] ?? 0);
      out.push({ type: "play", minute: m, side, player: driver.id });
      if (r.prob(this.p.corners.pIfBlocked)) this.corner(r, m, side, out, 0);
      return;
    }
    const xg0 = this.p.xg.base + this.p.xg.amplitude * Math.pow(r.float(), this.p.xg.exponent);
    const finisher = chooseWeighted(r, eq.lineup, (j) => (this.p.shotWeight[j.position] ?? 0) * Math.pow(j.attributes.finishing / 10, 2));
    // rematar de mais longe vale menos, a não ser que o finalizador tenha remate de longe
    const far = this.tactic(side).shooting - 3;
    const xgFactor = Math.max(0.3, 1 - sh.xg * far + sh.skill * far * ((finisher.attributes.longShot - 10) / 10));
    const xg = clamp(sigmoide(logit(clamp(xg0, 0.001, 0.999)) + (this.p.sensitivity.xg * d) / 10) * xgFactor, this.p.xg.min, this.p.xg.max);
    const assistant = r.prob(this.p.assistedP)
      ? chooseWeighted(
          r,
          eq.lineup.filter((j) => j.id !== finisher.id),
          (j) => (this.p.attendanceWeight[j.position] ?? 0) * Math.pow((j.attributes.pass + j.attributes.vision + j.attributes.flair) / 15, 2),
        )
      : undefined;
    this.shot(r, m, side, out, finisher, assistant, xg, "openPlay", 0);
  }

  /** Resolve um remate (já escolhido o finalizador e o xG) e o que dele nasce (canto). */
  private shot(r: Rng, m: number, side: Side, out: MatchEvent[], end: OnPitchPlayer, assist: OnPitchPlayer | undefined, xg: number, origin: Origin, depth: number): void {
    const est = this.stats[side];
    const opp = otherSide(side);
    const gk = this.teams[opp].lineup.find((j) => j.position === "GK");
    const skill = origin === "penalty" ? end.attributes.penalties : origin === "corner" ? (end.attributes.heading + end.attributes.finishing) / 2 : end.attributes.finishing;
    est.shots++;
    est.xg += xg;
    const base = { type: "shot" as const, minute: m, side, player: end.id, ...(assist ? { assistant: assist.id } : {}), xg: Math.round(xg * 1000) / 1000, origin, ...(gk ? { goalkeeper: gk.id } : {}) };
    // bloqueado por um defesa (não há bloqueios em penáltis)
    if (origin !== "penalty" && r.prob(this.p.blockedP)) {
      est.blocked++;
      out.push({ ...base, outcome: "blocked" });
      if (r.prob(this.p.corners.pIfBlocked)) this.corner(r, m, side, out, depth);
      return;
    }
    // o xG é a probabilidade de golo antes de bloqueios: depois de um remate não bloqueado vale xg/(1-pBloqueado)
    const blockedNotP = origin === "penalty" ? 1 : 1 - this.p.blockedP;
    const goalP = sigmoide(logit(clamp(xg / blockedNotP, 0.001, 0.97)) + (this.p.weight.finishing * (skill * end.form - 10)) / 10 - (this.p.weight.goalkeeper * (this.effective[opp].goalkeeper - 10)) / 10);
    if (r.prob(goalP)) {
      est.goals++;
      est.onTarget++;
      out.push({ ...base, outcome: "goal" });
      return;
    }
    const targetP = Math.min(this.p.onTarget.max, this.p.onTarget.base + this.p.onTarget.porXg * xg);
    const savedP = targetP > goalP ? (targetP - goalP) / (1 - goalP) : 0;
    if (r.prob(savedP)) {
      est.onTarget++;
      out.push({ ...base, outcome: "saved" });
      if (r.prob(this.p.corners.pIfSaved)) this.corner(r, m, side, out, depth);
    } else out.push({ ...base, outcome: "away" });
  }

  /** Canto a favor de `lado`; pode dar um remate de cabeça (e, no máximo uma vez, outro canto). */
  private corner(r: Rng, m: number, side: Side, out: MatchEvent[], depth: number): void {
    const eq = this.teams[side];
    this.stats[side].corners++;
    out.push({ type: "corner", minute: m, side });
    if (depth >= 1 || !r.prob(this.p.corners.shotP * cornerShotMultiplier(this.tactic(side), this.params.tactic))) return;
    const header = chooseWeighted(r, eq.lineup, (j) => (this.p.headingWeight[j.position] ?? 0) * Math.pow((j.attributes.heading / 10) * (j.heightCm / 178), 2));
    const scorer = eq.lineup.filter((j) => j.position !== "GK").reduce((a, b) => (b.attributes.setPieces + b.attributes.crossing > a.attributes.setPieces + a.attributes.crossing ? b : a));
    const xg0 = this.p.xg.base + this.p.xg.amplitude * this.p.corners.xgFactor * Math.pow(r.float(), this.p.xg.exponent);
    const xg = clamp(sigmoide(logit(clamp(xg0, 0.001, 0.999)) + (this.p.sensitivity.xg * this.difference(side)) / 10), this.p.xg.min, this.p.xg.max);
    this.shot(r, m, side, out, header, scorer.id === header.id ? undefined : scorer, xg, "corner", depth + 1);
  }

  /** Risco de lesão neste minuto: soma dos riscos individuais; se acontece, escolhe-se quem, ponderado pelo risco. */
  private injuryPossible(r: Rng, m: number, side: Side, out: MatchEvent[]): void {
    const eq = this.teams[side];
    const t = this.tactic(side);
    const fatigue = fatigueIn(m, this.regularDuration, t, this.params.tactic);
    // o cansaço multiplica o risco de todos por igual: calcula-se uma vez por equipa e muda-se só quando a equipa muda
    const base = (this.baseRisks[side] ??= eq.lineup.map(
      (j) =>
        riskPer90({ form: j.form, physicalAptitude: j.attributes.physicalAptitude, turf: this.turf, medical: eq.medical ?? 10, opponentPlayFair: toughness(this.tactic(otherSide(side))) as 1 | 2 | 3 | 4 | 5, intensity: t.intensity, relapse: !!j.relapse }, this.params) / this.regularDuration,
    ));
    const factor = 1 + this.params.injuries.risk.fatigue * fatigue;
    const risks = base.map((x) => x * factor);
    const total = risks.reduce((a, b) => a + b, 0);
    if (!r.prob(total)) return;
    let x = r.float() * total;
    let k = 0;
    for (; k < risks.length - 1; k++) {
      x -= risks[k] as number;
      if (x < 0) break;
    }
    const player = eq.lineup[k] as OnPitchPlayer;
    const injury = drawLotsInjury(r, this.params, { medical: eq.medical ?? 10, ...(player.relapse ? { relapse: player.relapse } : {}) });
    this.stats[side].injuries++;
    this.injured[side].add(player.id);
    out.push({ type: "injury", minute: m, side, player: player.id, injury });
    // o suplente: mesma posição se houver; guarda-redes só por guarda-redes
    const bench = eq.bench ?? [];
    const playerIn =
      bench.find((b) => b.position === player.position) ??
      (player.position === "GK" ? undefined : bench.filter((b) => b.position !== "GK").reduce<OnPitchPlayer | undefined>((a, b) => (!a || b.attributes.finishing + b.attributes.tackling + b.attributes.pass > a.attributes.finishing + a.attributes.tackling + a.attributes.pass ? b : a), undefined));
    const lineup = eq.lineup.filter((j) => j.id !== player.id);
    if (side === this.manualSide) {
      // equipa do gamer: nada de substituições automáticas, joga com menos um até ele decidir
      this.pending[side].set(player.id, player);
      this.teams[side] = { ...eq, lineup };
      this.withoutSubstitute[side]++;
    } else if (playerIn) {
      lineup.push({ ...playerIn, position: player.position, ...(playerIn.positions ? { aptitude: aptitudeIn(playerIn.positions, player.position, this.params) } : {}) });
      this.teams[side] = { ...eq, lineup, bench: bench.filter((b) => b.id !== playerIn.id) };
      out.push({ type: "substitution", minute: m, side, playerOut: player.id, playerIn: playerIn.id, reason: "injury" });
    } else {
      this.teams[side] = { ...eq, lineup };
      this.withoutSubstitute[side]++;
    }
    this.strengths[side] = this.computeStrength(this.teams[side], side);
    this.baseRisks[side] = undefined;
    this.updateEffective(m);
  }

  /** Cartão por uma falta: vermelho direto, amarelo (e vermelho se já tinha um). O expulso sai do jogo. */
  private card(r: Rng, m: number, side: Side, out: MatchEvent[], inf: OnPitchPlayer, penalty: boolean): void {
    const c = this.p.cards;
    const u = this.params.tactic.timeWasting;
    const mult = (this.params.tactic.fairPlay.cards[toughness(this.tactic(side)) - 1] as number) * ((inf.attributes.aggression + 10) / 20)
      * (1 + u.cards * Math.max(0, this.wasting(side, m))) * (1 + u.provoke * Math.max(0, this.wasting(otherSide(side), m)));
    const redP = Math.min(1, (penalty ? c.penaltyRedP : c.directRedP) * mult);
    const yellowP = Math.min(1, (penalty ? c.penaltyYellowP : c.yellowP) * mult * (this.yellows[side].has(inf.id) ? c.alreadyYellow.card : 1));
    if (r.prob(redP)) {
      this.sendOff(m, side, out, inf, false);
    } else if (r.prob(yellowP)) {
      this.stats[side].yellows++;
      out.push({ type: "card", minute: m, side, player: inf.id, colour: "yellow" });
      if (this.yellows[side].has(inf.id)) this.sendOff(m, side, out, inf, true);
      else this.yellows[side].add(inf.id);
    }
  }

  private sendOff(m: number, side: Side, out: MatchEvent[], inf: OnPitchPlayer, secondYellow: boolean): void {
    this.stats[side].reds++;
    out.push({ type: "card", minute: m, side, player: inf.id, colour: "red", ...(secondYellow ? { secondYellow: true as const } : {}) });
    this.sentOff[side].add(inf.id);
    this.teams[side] = { ...this.teams[side], lineup: this.teams[side].lineup.filter((j) => j.id !== inf.id) };
    this.strengths[side] = this.computeStrength(this.teams[side], side);
    this.baseRisks[side] = undefined;
    this.updateEffective(m);
  }

  /** Falta de `lado`: pode dar penálti ou livre perigoso a favor do adversário. */
  private foul(r: Rng, m: number, side: Side, out: MatchEvent[]): void {
    const eq = this.teams[side];
    const opp = otherSide(side);
    this.stats[side].fouls++;
    const offender = chooseWeighted(r, eq.lineup, (j) => (j.position === "GK" ? 0.05 : 1) * (this.yellows[side].has(j.id) ? this.p.cards.alreadyYellow.foul : 1) * Math.pow((j.attributes.aggression + 10) / 20, 2) * Math.sqrt(21 - j.attributes.tackling));
    const penalty = r.prob(this.p.penalty.pPerFoul);
    out.push({ type: "foul", minute: m, side, player: offender.id, penalty });
    this.card(r, m, side, out, offender, penalty);
    if (penalty) {
      const taker = this.teams[opp].lineup.filter((j) => j.position !== "GK").reduce((a, b) => (b.attributes.penalties * b.form > a.attributes.penalties * a.form ? b : a));
      this.shot(r, m, opp, out, taker, undefined, this.p.penalty.xg, "penalty", 1);
    } else if (r.prob(this.p.fouls.shotFreeP)) {
      const taker = chooseWeighted(r, this.teams[opp].lineup, (j) => Math.pow(j.attributes.setPieces / 10, 3) * (j.position === "GK" ? 0 : 1));
      const xg = clamp(sigmoide(logit(0.05) + (this.p.sensitivity.xg * this.difference(opp)) / 10), this.p.xg.min, this.p.xg.max);
      this.shot(r, m, opp, out, taker, undefined, xg, "free", 1);
    }
  }
}

/** Joga o jogo todo de uma vez. */
export function simulateMatch(input: MatchInput, params: Params): { events: MatchEvent[]; summary: MatchSummary } {
  const s = new MatchSimulator(input, params);
  const events = s.simulateUntil(Number.POSITIVE_INFINITY);
  return { events, summary: s.summary() };
}
