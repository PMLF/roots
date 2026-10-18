"use client";
import { useEffect, useRef, useState } from "react";
import type { LivePlayer, LiveMatch, LiveSubs } from "@/engine/season/liveMatch";
import { CloseButton } from "@/ui/components/CloseButton";
import { Stars } from "@/ui/components/Stars";
import { EventIcon } from "@/ui/components/EventIcon";
import { abbreviationPosition } from "@/ui/i18n/position";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Barrinhas com o que resta: uma por substituição (5) e uma por pausa (3). */
export function SubsCounters({ subs }: { subs: LiveSubs }) {
  const { t } = useT();
  const bars = (used: number, max: number, label: string) => (
    <span className="contador-subs" role="img" aria-label={`${label}: ${max - used} / ${max}`}>
      <span>{label}</span>
      <span className="contador-barras" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => <i key={i} className={i < max - used ? "free" : "gasta"} />)}
      </span>
    </span>
  );
  return <span className="contadores-subs">{bars(subs.used, subs.max, t("match.subs.subsCount"))}{bars(subs.usedPauses, subs.pausesMax, t("match.subs.pauseCount"))}</span>;
}

/** Já não se pode fazer mais nenhuma substituição agora? (sem substituições, ou sem pausas fora do intervalo) */
export function withoutSubstitutions(subs: LiveSubs | undefined, inHalfTime: boolean): boolean {
  return !subs || subs.used >= subs.max || (!inHalfTime && subs.usedPauses >= subs.pausesMax);
}

type Pair = { playerOut: string; playerIn: string };
type Level = "good" | "average" | "bad";
/** Semáforo de quão bem um suplente cobre uma posição: verde (14+), amarelo (8 a 13), vermelho (menos, ou sem registo). */
const levelOf = (apt: number | undefined): Level => (apt !== undefined && apt >= 14 ? "good" : apt !== undefined && apt >= 8 ? "average" : "bad");
const aptitudeFor = (j: LivePlayer, pos: string): number | undefined => j.positions?.find((x) => x.pos === pos)?.aptitude;
type Choice = { type: "playerOut" | "playerIn"; id: string };

/**
 * Popup das substituições (RZ-215): escolhe-se quem sai (em campo) e quem entra (banco), por clique ou a arrastar, e confirma-se
 * tudo de uma vez. O semáforo mostra quão bem cada suplente cobre a posição de cada titular. Uma paragem gasta uma pausa,
 * façam-se uma ou várias trocas; ao intervalo não gasta pausas. Quem sai não volta.
 */
export function SubstitutionsInMatch({ match, busy, error, onConfirm, onClose }: { match: LiveMatch; busy: boolean; error?: string; onConfirm: (substitutions: Pair[]) => void; onClose: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Choice | null>(null);
  const [drag, setDrag] = useState<Choice | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const subs = match.subs;
  const side = match.gamerSide ?? "home";
  const all = match.teams?.[side] ?? [];
  const pitch = all.filter((j) => j.state === "pitch");
  const bench = all.filter((j) => j.state === "bench");
  const remaining = subs ? subs.max - subs.used - pairs.length : 0;
  const name = (id: string) => all.find((j) => j.id === id)?.name ?? id;
  const porId = (id: string) => all.find((j) => j.id === id);
  const usedOut = new Set(pairs.map((p) => p.playerOut));
  const usedIn = new Set(pairs.map((p) => p.playerIn));
  const active = drag ?? selected;
  const activeJ = active ? porId(active.id) : undefined;

  const join = (playerOut: string, playerIn: string) => {
    if (remaining <= 0 || usedOut.has(playerOut) || usedIn.has(playerIn)) return;
    setPairs((p) => [...p, { playerOut, playerIn }]);
    setSelected(null);
    setDrag(null);
  };
  const click = (type: "playerOut" | "playerIn", id: string) => {
    if (selected && selected.type !== type) { join(type === "playerOut" ? id : selected.id, type === "playerIn" ? id : selected.id); return; }
    setSelected(selected?.id === id ? null : { type, id });
  };
  /** Cor do semáforo da linha `j` para o jogador ativo (do outro lado): quão bem o suplente cobre a posição do titular. */
  const trafficLight = (j: LivePlayer, type: "playerOut" | "playerIn"): { level: Level; apt: number | undefined } | undefined => {
    if (!activeJ || !active || active.type === type) return undefined;
    const apt = type === "playerIn" ? aptitudeFor(j, activeJ.position) : aptitudeFor(activeJ, j.position);
    return { level: levelOf(apt), apt };
  };
  const hint = (s: { level: Level; apt: number | undefined } | undefined) => (s ? (s.apt === undefined ? t("match.subs.outOfPosition") : `${s.apt}/20`) : undefined);
  const draggable = (type: "playerOut" | "playerIn", id: string, rowActive: boolean) => ({
    draggable: rowActive,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setDrag({ type, id }); setSelected(null); },
    onDragEnd: () => setDrag(null),
  });
  const droppable = (type: "playerOut" | "playerIn", id: string) => ({
    onDragOver: (e: React.DragEvent) => { if (drag && drag.type !== type) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (drag && drag.type !== type) join(type === "playerOut" ? id : drag.id, type === "playerIn" ? id : drag.id); },
  });

  return (
    <dialog ref={ref} className="popup subs-jogo" aria-labelledby="h-subs" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2 id="h-subs">{t("match.subs.title")}</h2>
      {subs && <p className="subs-resumo"><SubsCounters subs={subs} /></p>}
      {pairs.length > 0 && (
        <ul className="subs-pares" aria-label={t("match.subs.chosen")}>
          {pairs.map((p) => (
            <li key={p.playerOut}>
              <span className="sub-sai">▼ {name(p.playerOut)}</span> <span className="sub-entra">▲ {name(p.playerIn)}</span>
              <button type="button" className="ligacao-botao" onClick={() => setPairs((x) => x.filter((y) => y.playerOut !== p.playerOut))}>{t("match.subs.remove")}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="subs-listas">
        <section aria-label={t("match.subs.onPitch")}>
          <h3>{t("match.subs.playerOut")}</h3>
          <ul>
            {pitch.map((j) => {
              const s = trafficLight(j, "playerOut");
              const blocked = usedOut.has(j.id) || busy || remaining <= 0;
              return (
                <li key={j.id} {...droppable("playerOut", j.id)}>
                  <button type="button" className={`subs-jogador${selected?.id === j.id ? " escolhido" : ""}${s ? ` apt-${s.level}` : ""}`} aria-pressed={selected?.id === j.id} title={hint(s)} disabled={blocked} onClick={() => click("playerOut", j.id)} {...draggable("playerOut", j.id, !blocked)}>
                    <b className="nota-pequena">{j.rating !== undefined ? j.rating.toFixed(1) : "–"}</b>
                    <span className="pos">{abbreviationPosition(t, j.position)}</span>
                    <span className="subs-nome">{j.name}</span>
                    <span className="inds">
                      {j.stars !== undefined && <Stars value={j.stars} />}
                      {j.yellows > 0 && <span className="ind"><EventIcon rowKey="card" colour="yellow" /></span>}
                      {j.injured && <span className="ind"><EventIcon rowKey="injury" /></span>}
                      {s && <i className="semaforo" aria-label={hint(s)} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-label={t("match.bench")}>
          <h3>{t("match.subs.playerIn")}</h3>
          <ul>
            {bench.map((j) => {
              const s = trafficLight(j, "playerIn");
              const blocked = usedIn.has(j.id) || busy || remaining <= 0;
              return (
                <li key={j.id} {...droppable("playerIn", j.id)}>
                  <button type="button" className={`subs-jogador${selected?.id === j.id ? " escolhido" : ""}${s ? ` apt-${s.level}` : ""}`} aria-pressed={selected?.id === j.id} title={hint(s)} disabled={blocked} onClick={() => click("playerIn", j.id)} {...draggable("playerIn", j.id, !blocked)}>
                    <span className="pos">{abbreviationPosition(t, j.position)}</span>
                    <span className="subs-nome">{j.name}</span>
                    <span className="inds">
                      {j.stars !== undefined && <Stars value={j.stars} />}
                      {s && <i className="semaforo" aria-label={hint(s)} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {selected && activeJ && <p className="suave subs-dica">{t(selected.type === "playerOut" ? "match.subs.chooseIn" : "match.subs.chooseOut", { name: activeJ.name })}</p>}
      {error && <p className="erro" role="alert">{error}</p>}
      <p className="acoes">
        <button type="button" className="primario" disabled={pairs.length === 0 || busy} onClick={() => onConfirm(pairs)}>{t("match.subs.confirm")}{pairs.length > 0 ? ` (${pairs.length})` : ""}</button>
      </p>
    </dialog>
  );
}
