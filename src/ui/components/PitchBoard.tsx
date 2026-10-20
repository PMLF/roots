"use client";
import type { CSSProperties } from "react";
import type { ViewPlan } from "@/engine/api/contracts";
import type { FormationId } from "@/engine/match/types";
import { backgroundColours, readColours } from "@/ui/colours";
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
  return (
    <div className="campo" role="group" aria-label={t("tactic.pitch")}>
      <svg className="campo-desenho" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="0" y={i * 25} width="100" height="25" className={i % 2 === 0 ? "relva-a" : "relva-b"} />)}
        <g className="linhas">
          <rect x="3" y="3" width="94" height="144" />
          <line x1="3" y1="75" x2="97" y2="75" />
          <circle cx="50" cy="75" r="11" />
          <rect x="22" y="3" width="56" height="22" />
          <rect x="36" y="3" width="28" height="9" />
          <rect x="22" y="125" width="56" height="22" />
          <rect x="36" y="138" width="28" height="9" />
          <path d="M 39 25 A 11 11 0 0 0 61 25" />
          <path d="M 39 125 A 11 11 0 0 1 61 125" />
        </g>
      </svg>
      {plan.lineup.map((slot, i) => {
        const [x, y] = layout[i] ?? [50, 50];
        const info = slot.player ? byId.get(slot.player) : undefined;
        const place = (e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onPlace(id, i); };
        const style = { left: `${x}%`, top: `${y}%` } as CSSProperties;
        if (!slot.player || !info) {
          return (
            <button key={i} type="button" className="lugar lugar-vazio" style={style} onClick={() => selected && onPlace(selected, i)} onDragOver={(e) => e.preventDefault()} onDrop={place} aria-label={t("tactic.emptySlot", { position: t(`position.name.${slot.position}` as never) })}>
              <span>{abbreviationPosition(t, slot.position)}</span>
            </button>
          );
        }
        const state = halo(slot.performance);
        return (
          <div key={i} className={`lugar lugar-${state}${selected === slot.player ? " escolhido" : ""}${info.unavailable ? " indisponivel" : ""}`} style={style} onDragOver={(e) => e.preventDefault()} onDrop={place}>
            <button
              type="button"
              className="lugar-cartao"
              draggable
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", slot.player as string); e.dataTransfer.effectAllowed = "move"; }}
              onClick={() => (selected && selected !== slot.player ? onPlace(selected, i) : onSelect(slot.player as string))}
              aria-pressed={selected === slot.player}
              title={`${info.name} · ${abbreviationPosition(t, slot.position)} · ${Math.round((slot.performance ?? 1) * 100)}%`}
            >
              <span className="lugar-cores" style={{ background }}><b>{abbreviationPosition(t, slot.position)}</b>{info.stars !== undefined && <Stars value={info.stars} />}</span>
              <span className="lugar-nome">{info.name}</span>
            </button>
            <button type="button" className="lugar-tirar" onClick={() => onRemove(slot.player as string)} aria-label={t("tactic.remove", { name: info.name })}>×</button>
          </div>
        );
      })}
    </div>
  );
}
