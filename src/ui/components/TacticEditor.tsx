"use client";
import { useCallback, useEffect, useState } from "react";
import type { ViewPlan } from "@/engine/api/contracts";
import { BENCH_SIZE, moveToBench, moveToReserve, moveToSlot, remapLineup, swapPlayers, type Board } from "@/engine/match/lineup";
import type { FormationId, Tactic } from "@/engine/match/types";
import { BenchStrip } from "@/ui/components/BenchStrip";
import { Card } from "@/ui/components/Card";
import { startPlayerDrag } from "@/ui/components/dragCard";
import { EntityLink } from "@/ui/components/Link";
import { PitchBoard } from "@/ui/components/PitchBoard";
import { Stars } from "@/ui/components/Stars";
import { TacticControls } from "@/ui/components/TacticControls";
import { backgroundColours, readColours } from "@/ui/colours";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/position";
import { useEngine } from "@/ui/EngineProvider";

type Squad = ViewPlan["squad"][number];
type Zone = "starting" | "bench" | "reserves";

const ORDER = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"];
const byPosition = (a: Squad, b: Squad) => ORDER.indexOf(a.positions[0]?.pos ?? "ST") - ORDER.indexOf(b.positions[0]?.pos ?? "ST") || (b.stars ?? 0) - (a.stars ?? 0) || a.name.localeCompare(b.name, "pt");
const energy = (form: number) => Math.max(0, Math.min(100, Math.round(((form - 0.85) / 0.15) * 100)));

/** Editor da tática e do onze do clube do gamer (RZ-158, RZ-248): campo em vetor, arrastar e largar, banco e reservas. Usado na página «Tática» e no ecrã pré-jogo (RZ-169). */
export function TacticEditor({ withoutNextMatch = false, heading }: { withoutNextMatch?: boolean; heading?: string }) {
  const { t } = useT();
  const engine = useEngine();
  const [plan, setPlan] = useState<ViewPlan | null | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  // as opções táticas começam fechadas: o foco é a escolha dos jogadores
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [held, setHeld] = useState<string | undefined>(undefined);
  // o realce dura enquanto o rato está premido ou o jogador anda a ser arrastado
  useEffect(() => {
    if (!held) return;
    const end = () => setHeld(undefined);
    window.addEventListener("mouseup", end);
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => { window.removeEventListener("mouseup", end); window.removeEventListener("dragend", end); window.removeEventListener("drop", end); };
  }, [held]);

  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("plan", null).then((p) => live && setPlan(p)).catch(() => live && setPlan(null));
    return () => { live = false; };
  }, [engine]);
  useEffect(() => {
    const show = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener("raizes:onze-invalido", show);
    return () => window.removeEventListener("raizes:onze-invalido", show);
  }, []);

  const save = useCallback(async (tactic: Tactic, board: Board, formationPositions: ViewPlan["formationPositions"]) => {
    if (!engine) return;
    try {
      const lineup = board.slots.flatMap((player, i) => (player ? [{ player, position: formationPositions[tactic.formation][i]! }] : []));
      const p = await engine.call("savePlan", { tactic, lineup, bench: board.bench });
      setPlan(p);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [engine]);

  if (plan === undefined) return <p>{t("profile.loading")}</p>;
  if (plan === null) return <p className="vazio">{t("myClub.empty")}</p>;

  const board: Board = { slots: plan.lineup.map((o) => o.player), bench: plan.bench };
  const commit = (next: Board | undefined, tactic: Tactic = plan.tactic) => {
    if (!next) { setError(t("tactic.benchFull", { n: BENCH_SIZE })); return; }
    setSelected(undefined);
    void save(tactic, next, plan.formationPositions);
  };
  const changeFormation = (formation: FormationId) => {
    const kept = remapLineup(plan.lineup.flatMap((o) => (o.player ? [{ player: o.player, position: o.position }] : [])), formation);
    const slots: (string | undefined)[] = Array.from({ length: 11 }, () => undefined);
    const free = plan.formationPositions[formation].map((pos, i) => ({ pos, i }));
    for (const s of kept) { const k = free.findIndex((f) => f.pos === s.position); slots[free[k]!.i] = s.player; free.splice(k, 1); }
    commit({ slots, bench: plan.bench }, { ...plan.tactic, formation });
  };
  const place = (player: string, slot: number) => commit(moveToSlot(board, player, slot));
  const toZone = (player: string, zone: Zone) => commit(zone === "bench" ? moveToBench(board, player) : moveToReserve(board, player));
  const swap = (dragged: string, over: string) => { if (dragged !== over) commit(swapPlayers(board, dragged, over)); };
  // largar numa casa livre do banco convoca; por cima de um suplente troca
  const dropOnBench = (dragged: string, over: string | undefined) => (over ? swap(dragged, over) : toZone(dragged, "bench"));

  const start = new Map(plan.lineup.flatMap((o, i) => (o.player ? [[o.player, i] as const] : [])));
  const rows: Record<Zone, Squad[]> = {
    starting: plan.squad.filter((p) => start.has(p.player)).sort((a, b) => (start.get(a.player) ?? 0) - (start.get(b.player) ?? 0)),
    bench: plan.bench.flatMap((id) => plan.squad.find((p) => p.player === id) ?? []),
    reserves: plan.squad.filter((p) => !start.has(p.player) && !plan.bench.includes(p.player)).sort(byPosition),
  };
  const slotOf = (id: string) => plan.lineup[start.get(id) ?? -1];
  const background = backgroundColours(readColours(plan.clubColours));
  // realces ao agarrar um jogador: lugares onde rende bem (se não está no onze) ou quem o substituiria bem (se está)
  const tone = (fit: number | undefined): "verde" | "amarelo" | undefined => (fit === undefined ? undefined : fit >= 0.95 ? "verde" : fit >= 0.8 ? "amarelo" : undefined);
  const heldInfo = held ? plan.squad.find((p) => p.player === held) : undefined;
  const heldSlot = held ? start.get(held) : undefined;
  const slotHints = new Map<number, "verde" | "amarelo">();
  const playerHints = new Map<string, "verde" | "amarelo">();
  if (heldInfo && heldSlot === undefined) plan.lineup.forEach((o, i) => { const h = tone(heldInfo.fit[o.position]); if (h) slotHints.set(i, h); });
  if (heldInfo && heldSlot !== undefined) {
    const position = plan.lineup[heldSlot]!.position;
    for (const p of plan.squad) { if (p.player === held || p.unavailable) continue; const h = tone(p.fit[position]); if (h) playerHints.set(p.player, h); }
  }
  const dimmed = heldInfo !== undefined && heldSlot !== undefined;
  const missing = plan.lineup.filter((o) => !o.player).length;

  const section = (zone: Zone, title: string, hint: string) => (
    <tbody
      key={zone}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id && zone !== "starting") toZone(id, zone); }}
    >
      <tr className="tabela-secao">
        <th colSpan={9}>
          {title} <small className="suave">{hint}</small>
          {selected && zone !== "starting" && !rows[zone].some((p) => p.player === selected) && <button type="button" className="ligacao-botao" onClick={() => toZone(selected, zone)}>{t("tactic.moveHere")}</button>}
        </th>
      </tr>
      {rows[zone].length === 0 && <tr className="alvo-vazio"><td colSpan={9} /></tr>}
      {rows[zone].map((p) => {
        const slot = slotOf(p.player);
        return (
          <tr
            key={p.player}
            draggable
            onDragStart={(e) => startPlayerDrag(e, p.player, { name: p.name, position: abbreviationPosition(t, slot?.position ?? p.positions[0]?.pos ?? "ST"), background })}
            onMouseDown={() => setHeld(p.player)}
            onContextMenu={(e) => { e.preventDefault(); toZone(p.player, "reserves"); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setHeld(undefined); const id = e.dataTransfer.getData("text/plain"); if (id) swap(id, p.player); }}
            onClick={() => setSelected(selected === p.player ? undefined : p.player)}
            className={`${selected === p.player ? "escolhido" : ""}${p.unavailable ? " indisponivel" : ""}${playerHints.has(p.player) ? ` dica-${playerHints.get(p.player)}` : dimmed && p.player !== held ? " esmaecido" : ""}`}
            aria-selected={selected === p.player}
          >
            <td><EntityLink k="person" id={p.player}>{p.name}</EntityLink></td>
            <td>{slot ? abbreviationPosition(t, slot.position) : p.positions.slice(0, 2).map((x) => abbreviationPosition(t, x.pos)).join("/")}</td>
            <td className="num">{p.matches}</td>
            <td className="num" title={t("tactic.avgLast5")}>{p.avgLast5 !== undefined ? p.avgLast5.toFixed(1).replace(".", ",") : "—"}</td>
            <td className={`num${energy(p.form) < 50 ? " erro" : ""}`} title={t("tactic.form")}>{energy(p.form)}%</td>
            <td>{p.stars !== undefined ? <Stars value={p.stars} /> : "?"}</td>
            <td className="num">{p.age}</td>
            <td className="num">{p.goals}</td>
            <td>{p.unavailable ? <span className="erro">{t(`tactic.${p.unavailable}` as Key)}</span> : null}</td>
          </tr>
        );
      })}
    </tbody>
  );

  return (
    <div className="cartoes tatica-pagina">
      {(heading || (!withoutNextMatch && plan.nextMatch)) && (
        <header className="tatica-cabecalho">
          {heading && <h1>{heading}</h1>}
          {!withoutNextMatch && plan.nextMatch && (
            <p className="tatica-proximo">
              <span className="suave">{t("tactic.nextMatch")}:</span> <b>{plan.nextMatch.atHome ? "" : "@ "}{plan.nextMatch.opponent}</b> <span className="suave">· {plan.nextMatch.date} · {plan.nextMatch.competition}{plan.nextMatch.confirmed && ` · ${t("tactic.confirmed")}`}</span>
            </p>
          )}
        </header>
      )}
      <Card wide className="tatica-colapso">
        <button type="button" className="tatica-colapso-topo" aria-expanded={optionsOpen} aria-controls="tatica-opcoes" onClick={() => setOptionsOpen((o) => !o)}>
          <span className="tatica-colapso-titulo">{t("tactic.options")}</span>
          <span className="tatica-colapso-resumo suave">{plan.tactic.formation}{(["mentality", "intensity", "directness", "line"] as const).map((k) => ` · ${t(`tactic.opt.${k}.${plan.tactic[k]}` as Key)}`).join("")}</span>
          <span className="tatica-colapso-acao">{t(optionsOpen ? "tactic.optionsHide" : "tactic.optionsEdit")}<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3.5 8 8l5-4.5M3 8l5 4.5L13 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        </button>
        {optionsOpen && <div id="tatica-opcoes" className="tatica-colapso-corpo"><TacticControls tactic={plan.tactic} onChange={(next) => commit(board, next)} formations={plan.formations} onFormation={changeFormation} formationHint={t("tactic.formationWarning")} /></div>}
      </Card>
      <div className="tatica-grelha">
        <Card>
          <PitchBoard formation={plan.tactic.formation} plan={plan} selected={selected} onSelect={(id) => setSelected(selected === id ? undefined : id)} onPlace={place} onRemove={(id) => toZone(id, "reserves")} held={held} hints={slotHints} onGrab={setHeld} />
          <BenchStrip plan={plan} selected={selected} dimmed={dimmed} hints={playerHints} held={held} onSelect={(id) => setSelected(selected === id ? undefined : id)} onGrab={setHeld} onDropOn={dropOnBench} onRemove={(id) => toZone(id, "reserves")} />
        </Card>
        <Card className="tatica-plantel">
          {error && <p className="erro" role="alert">{error}</p>}
          <div className="tatica-tabela">
            <div className="tabela-rolar">
              <table className="tabela densa tabela-onze">
                <thead>
                  <tr>
                    <th>{t("tactic.col.name")}</th><th>{t("tactic.col.pos")}</th><th className="num">{t("tactic.col.games")}</th><th className="num">{t("tactic.col.last5")}</th><th className="num">{t("tactic.col.energy")}</th><th>{t("tactic.col.level")}</th><th className="num">{t("tactic.col.age")}</th><th className="num">{t("tactic.col.goals")}</th><th />
                  </tr>
                </thead>
                {section("starting", t("tactic.starting", { n: 11 - missing }), "")}
                {section("bench", t("tactic.bench"), `${plan.bench.length}/${BENCH_SIZE}`)}
                {section("reserves", t("tactic.reserves"), `${rows.reserves.length}`)}
              </table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
