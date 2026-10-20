"use client";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { ViewPlan } from "@/engine/api/contracts";
import type { FormationId } from "@/engine/match/types";
import { backgroundColours, readColours } from "@/ui/colours";
import { PitchSurface } from "@/ui/components/PitchSurface";
import { startPlayerDrag } from "@/ui/components/dragCard";
import { PITCH_LAYOUT } from "@/ui/components/pitchLayout";
import { Stars } from "@/ui/components/Stars";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/position";

type Props = {
  formation: FormationId;
  plan: ViewPlan;
  selected: string | undefined;
  onSelect: (player: string) => void;
  onPlace: (player: string, slot: number) => void;
  onRemove: (player: string) => void;
};

/** Cor do halo conforme o rendimento na posição: verde (natural), amarelo (a rever), vermelho (fora de posição). */
const halo = (performance: number | undefined): "verde" | "amarelo" | "vermelho" => (performance === undefined || performance >= 0.95 ? "verde" : performance >= 0.8 ? "amarelo" : "vermelho");

/** Campo de futebol em vetor com os 11 lugares da formação; os cartões arrastam-se (ou escolhem-se e tocam-se no lugar). */
export function PitchBoard({ formation, plan, selected, onSelect, onPlace, onRemove }: Props) {
  const { t } = useT();
  const layout = PITCH_LAYOUT[formation];
  const background = backgroundColours(readColours(plan.clubColours));
  const byId = new Map(plan.squad.map((p) => [p.player, p] as const));
  const [over, setOver] = useState<number | undefined>(undefined);
  const activate = (e: KeyboardEvent, action: () => void) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); action(); } };
  return (
    <div className="campo" role="group" aria-label={t("tactic.pitch")}>
      <PitchSurface />
      {plan.lineup.map((slot, i) => {
        const [x, y] = layout[i] ?? [50, 50];
        const info = slot.player ? byId.get(slot.player) : undefined;
        const place = (e: React.DragEvent) => { e.preventDefault(); setOver(undefined); const id = e.dataTransfer.getData("text/plain"); if (id) onPlace(id, i); };
        const target = { onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== i) setOver(i); }, onDragLeave: () => setOver((o) => (o === i ? undefined : o)), onDrop: place };
        const style = { left: `${x}%`, top: `${y}%` } as CSSProperties;
        if (!slot.player || !info) {
          return (
            <button key={i} type="button" className={`lugar lugar-vazio${over === i ? " alvo" : ""}`} style={style} onClick={() => selected && onPlace(selected, i)} {...target} aria-label={t("tactic.emptySlot", { position: t(`position.name.${slot.position}` as never) })}>
              <span>{abbreviationPosition(t, slot.position)}</span>
            </button>
          );
        }
        const state = halo(slot.performance);
        return (
          <div key={i} className={`lugar lugar-${state}${selected === slot.player ? " escolhido" : ""}${info.unavailable ? " indisponivel" : ""}${over === i ? " alvo" : ""}`} style={style} {...target}>
            {/* div e não botão: o Firefox não deixa arrastar botões */}
            <div
              role="button"
              tabIndex={0}
              className="lugar-cartao"
              draggable
              onDragStart={(e) => startPlayerDrag(e, slot.player as string, { name: info.name, position: abbreviationPosition(t, slot.position), background })}
              onDragEnd={() => setOver(undefined)}
              onClick={() => (selected && selected !== slot.player ? onPlace(selected, i) : onSelect(slot.player as string))}
              onKeyDown={(e) => activate(e, () => (selected && selected !== slot.player ? onPlace(selected, i) : onSelect(slot.player as string)))}
              aria-pressed={selected === slot.player}
              title={`${info.name} · ${abbreviationPosition(t, slot.position)} · ${Math.round((slot.performance ?? 1) * 100)}%`}
            >
              <span className="lugar-cores" style={{ background }}><b>{abbreviationPosition(t, slot.position)}</b>{info.stars !== undefined && <Stars value={info.stars} />}</span>
              <span className="lugar-nome">{info.name}</span>
            </div>
            <button type="button" className="lugar-tirar" onClick={() => onRemove(slot.player as string)} aria-label={t("tactic.remove", { name: info.name })}>×</button>
          </div>
        );
      })}
    </div>
  );
}
