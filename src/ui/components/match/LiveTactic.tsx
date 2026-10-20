"use client";
import { useEffect, useRef, useState } from "react";
import type { ViewPlan } from "@/engine/api/contracts";
import { FORMATIONS, FORMATION_IDS } from "@/engine/match/formations";
import type { Tactic } from "@/engine/match/types";
import type { LiveMatch, LivePlayer } from "@/engine/season/liveMatch";
import { POSITIONS, type Position } from "@/engine/world/types";
import { BenchStrip } from "@/ui/components/BenchStrip";
import { Card } from "@/ui/components/Card";
import { CloseButton } from "@/ui/components/CloseButton";
import { EntityLink } from "@/ui/components/Link";
import { SubsCounters } from "@/ui/components/match/Substitutions";
import { PitchBoard } from "@/ui/components/PitchBoard";
import { Stars } from "@/ui/components/Stars";
import { TacticControls } from "@/ui/components/TacticControls";
import { EventIcon } from "@/ui/components/EventIcon";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/position";

type Pair = { playerOut: string; playerIn: string };
const fitOf = (j: LivePlayer, pos: Position): number => {
  const a = j.positions?.find((x) => x.pos === pos)?.aptitude;
  return a === undefined ? (j.position === pos ? 1 : 0.4) : Math.min(1, a / 20);
};
const tone = (fit: number | undefined): "verde" | "amarelo" | undefined => (fit === undefined ? undefined : fit >= 0.95 ? "verde" : fit >= 0.8 ? "amarelo" : undefined);

/** Põe cada jogador em campo no lugar da formação que tem a sua posição (quem sobra, nos lugares que restam). */
function pitchSlots(formation: Tactic["formation"], players: readonly LivePlayer[]): (LivePlayer | undefined)[] {
  const free = [...players];
  const out = FORMATIONS[formation].map((pos) => { const k = free.findIndex((p) => p.position === pos); return k < 0 ? undefined : free.splice(k, 1)[0]; });
  return out.map((x) => x ?? free.shift());
}

/** O jogo ao vivo como `ViewPlan`, para usar o mesmo campo, banco e tabela da página de Táticas; as substituições escolhidas já aplicadas. */
function livePlan(match: LiveMatch, tactic: Tactic, pairs: readonly Pair[]): ViewPlan {
  const mine = match.teams?.[match.gamerSide ?? "home"] ?? [];
  const byId = new Map(mine.map((j) => [j.id, j] as const));
  const incoming = new Map(pairs.map((p) => [p.playerOut, p.playerIn] as const));
  const used = new Set(pairs.map((p) => p.playerIn));
  const onPitch = mine.filter((j) => j.state === "pitch");
  const slots = pitchSlots(tactic.formation, onPitch).map((j) => (j && incoming.has(j.id) ? byId.get(incoming.get(j.id) as string) : j));
  const positions = FORMATIONS[tactic.formation];
  return {
    clubName: "", clubColours: match.colours?.[match.gamerSide === "away" ? match.away.id : match.home.id] ?? "", tactic, formations: [...FORMATION_IDS],
    formationPositions: Object.fromEntries(FORMATION_IDS.map((f) => [f, [...FORMATIONS[f]]])) as ViewPlan["formationPositions"],
    lineup: positions.map((position, i) => { const j = slots[i]; return { position, ...(j ? { player: j.id, name: j.name, performance: fitOf(j, position) } : {}), outOfPosition: j ? fitOf(j, position) < 0.95 : false }; }),
    bench: mine.filter((j) => j.state === "bench" && !used.has(j.id)).map((j) => j.id),
    ready: { ok: true },
    squad: mine.filter((j) => j.state === "pitch" || j.state === "bench").map((j) => ({
      player: j.id, name: j.name, age: 0, form: 1, positions: (j.positions ?? [{ pos: j.position, aptitude: 20 }]).map((x) => ({ pos: x.pos as Position, aptitude: x.aptitude })),
      fit: Object.fromEntries(POSITIONS.map((p) => [p, fitOf(j, p)])) as Record<Position, number>,
      ...(j.stars !== undefined ? { stars: j.stars } : {}), matches: 0, goals: j.goals, ...(j.rating !== undefined ? { avgLast5: j.rating } : {}), ...(j.injured ? { unavailable: "injury" as const } : {}),
    })),
  };
}

/**
 * Tática e substituições durante o jogo, num popup com o mesmo aspeto da página de Táticas (mesmo campo, banco e tabela):
 * as opções táticas mudam logo; o onze e o banco só mudam por substituições (um suplente para cima de um titular, ou ao contrário),
 * que se confirmam de uma vez. Quem sai não volta.
 */
export function TacticInMatch({ match, tactic, onChange, onClose, busy, subsError, onConfirmSubs }: { match: LiveMatch; tactic: Tactic; onChange: (t: Tactic) => void; onClose: () => void; busy: boolean; subsError?: string; onConfirmSubs: (substitutions: Pair[]) => Promise<boolean> }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [held, setHeld] = useState<string | undefined>(undefined);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  useEffect(() => {
    if (!held) return;
    const end = () => setHeld(undefined);
    window.addEventListener("mouseup", end); window.addEventListener("dragend", end); window.addEventListener("drop", end);
    return () => { window.removeEventListener("mouseup", end); window.removeEventListener("dragend", end); window.removeEventListener("drop", end); };
  }, [held]);

  const plan = livePlan(match, tactic, pairs);
  const subs = match.subs;
  const remaining = subs ? subs.max - subs.used - pairs.length : 0;
  const mine = match.teams?.[match.gamerSide ?? "home"] ?? [];
  const hurt = new Set(match.pendingInjury ?? []);
  const startOf = new Map(plan.lineup.flatMap((o, i) => (o.player ? [[o.player, i] as const] : [])));
  const original = new Map(pairs.map((p) => [p.playerIn, p.playerOut] as const));
  const onBench = (id: string) => plan.bench.includes(id);
  // trocar = um suplente por um titular; escolhe-se por clique ou a arrastar, em qualquer sentido
  const swap = (a: string, b: string) => {
    if (remaining <= 0 || busy) return;
    const benchId = onBench(a) ? a : onBench(b) ? b : undefined;
    const pitchId = startOf.has(a) ? a : startOf.has(b) ? b : undefined;
    if (!benchId || !pitchId || original.has(pitchId)) return;
    setPairs((p) => [...p, { playerOut: pitchId, playerIn: benchId }]);
    setSelected(undefined);
  };
  const place = (player: string, slot: number) => { const out = plan.lineup[slot]?.player; if (out) swap(player, out); };
  const undo = (inId: string) => setPairs((p) => p.filter((x) => x.playerIn !== inId));
  const heldInfo = held ? plan.squad.find((p) => p.player === held) : undefined;
  const heldSlot = held ? startOf.get(held) : undefined;
  const slotHints = new Map<number, "verde" | "amarelo">();
  const playerHints = new Map<string, "verde" | "amarelo">();
  if (heldInfo && heldSlot === undefined) plan.lineup.forEach((o, i) => { const h = tone(heldInfo.fit[o.position]); if (h) slotHints.set(i, h); });
  if (heldInfo && heldSlot !== undefined) { const position = plan.lineup[heldSlot]!.position; for (const p of plan.squad) { if (p.player === held || !onBench(p.player)) continue; const h = tone(p.fit[position]); if (h) playerHints.set(p.player, h); } }
  const dimmed = heldInfo !== undefined && heldSlot !== undefined;

  const confirm = async () => { if (await onConfirmSubs(pairs)) setPairs([]); };
  const byId = new Map(mine.map((j) => [j.id, j] as const));
  const row = (id: string) => {
    const j = byId.get(id);
    if (!j) return null;
    const slot = plan.lineup[startOf.get(id) ?? -1];
    return (
      <tr key={id} onClick={() => setSelected(selected === id ? undefined : id)} aria-selected={selected === id} className={`${selected === id ? "escolhido" : ""}${j.injured ? " indisponivel" : ""}`}>
        <td><EntityLink k="person" id={id}>{j.name}</EntityLink>{original.has(id) && <small className="suave"> · {t("match.subs.in")}</small>}</td>
        <td>{abbreviationPosition(t, slot?.position ?? j.position)}</td>
        <td>{j.stars !== undefined ? <Stars value={j.stars} /> : "?"}</td>
        <td className="num">{j.rating !== undefined ? j.rating.toFixed(1).replace(".", ",") : "—"}</td>
        <td className="num">{j.goals > 0 ? `⚽${j.goals}` : ""}{j.yellows > 0 ? <> <EventIcon rowKey="card" colour="yellow" /></> : null}{j.injured ? <> <EventIcon rowKey="injury" /></> : null}</td>
      </tr>
    );
  };
  const startingIds = plan.lineup.flatMap((o) => (o.player ? [o.player] : []));
  return (
    <dialog ref={ref} className="popup tatica-jogo" aria-labelledby="h-tatica-jogo" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2 id="h-tatica-jogo">{t("match.tacticTitle")} <small className="suave">· {tactic.formation}</small></h2>
      <TacticControls tactic={tactic} onChange={onChange} disabled={busy} />
      {hurt.size > 0 && <p className="mensagem-renovacao erro" role="alert">{t("match.subs.injuryForced")}</p>}
      <div className="tatica-grelha">
        <Card>
          <PitchBoard formation={tactic.formation} plan={plan} selected={selected} onSelect={(id) => setSelected(selected === id ? undefined : id)} onPlace={place} onRemove={undo} held={held} hints={slotHints} onGrab={setHeld} />
          <BenchStrip plan={plan} selected={selected} dimmed={dimmed} hints={playerHints} held={held} onSelect={(id) => setSelected(selected === id ? undefined : id)} onGrab={setHeld} onDropOn={(dragged, over) => { if (over) swap(dragged, over); }} onRemove={() => undefined} />
        </Card>
        <Card className="tatica-plantel">
          {subs && <p className="subs-resumo"><SubsCounters subs={subs} /></p>}
          <div className="tatica-tabela">
            <div className="tabela-rolar">
              <table className="tabela densa tabela-onze">
                <thead><tr><th>{t("tactic.col.name")}</th><th>{t("tactic.col.pos")}</th><th>{t("tactic.col.level")}</th><th className="num">{t("match.rating")}</th><th /></tr></thead>
                <tbody><tr className="tabela-secao"><th colSpan={5}>{t("tactic.starting", { n: startingIds.length })}</th></tr>{startingIds.map(row)}</tbody>
                <tbody><tr className="tabela-secao"><th colSpan={5}>{t("tactic.bench")} <small className="suave">{plan.bench.length}</small></th></tr>{plan.bench.map(row)}</tbody>
              </table>
            </div>
          </div>
          {pairs.length > 0 && (
            <ul className="subs-pares" aria-label={t("match.subs.chosen")}>
              {pairs.map((p) => (
                <li key={p.playerIn}>
                  <span className="sub-sai">▼ {byId.get(p.playerOut)?.name}</span> <span className="sub-entra">▲ {byId.get(p.playerIn)?.name}</span>
                  <button type="button" className="ligacao-botao" onClick={() => undo(p.playerIn)}>{t("match.subs.remove")}</button>
                </li>
              ))}
            </ul>
          )}
          {subsError && <p className="erro" role="alert">{subsError}</p>}
          <p className="acoes"><button type="button" className="primario" disabled={pairs.length === 0 || busy} onClick={() => void confirm()}>{t("match.subs.confirm")}{pairs.length > 0 ? ` (${pairs.length})` : ""}</button></p>
        </Card>
      </div>
      <p className="suave tatica-aviso">{t("match.tacticWarning")}</p>
    </dialog>
  );
}
