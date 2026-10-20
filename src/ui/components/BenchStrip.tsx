"use client";
import { useState } from "react";
import type { ViewPlan } from "@/engine/api/contracts";
import { BENCH_SIZE } from "@/engine/match/lineup";
import { startPlayerDrag } from "@/ui/components/dragCard";
import { Stars } from "@/ui/components/Stars";
import { backgroundColours, readColours } from "@/ui/colours";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/position";

type Props = {
  plan: ViewPlan;
  selected: string | undefined;
  /** Há um jogador do onze agarrado: quem não o substitui bem fica esmaecido. */
  dimmed: boolean;
  held: string | undefined;
  hints: ReadonlyMap<string, "verde" | "amarelo">;
  onSelect: (player: string) => void;
  onGrab: (player: string) => void;
  /** Largar um jogador numa casa livre do banco (`undefined`) ou por cima de um suplente (troca). */
  onDropOn: (dragged: string, over: string | undefined) => void;
  onRemove: (player: string) => void;
};

/** O banco de suplentes por baixo do campo: sete casas, os cartões arrastam-se para o campo ou para os reservas da lista. */
export function BenchStrip({ plan, selected, dimmed, hints, onSelect, onGrab, onDropOn, onRemove }: Props) {
  const { t } = useT();
  const background = backgroundColours(readColours(plan.clubColours));
  const byId = new Map(plan.squad.map((p) => [p.player, p] as const));
  const [over, setOver] = useState<number | undefined>(undefined);
  return (
    <div className="banco" role="group" aria-label={t("tactic.bench")}>
      {Array.from({ length: BENCH_SIZE }, (_, i) => {
        const id = plan.bench[i];
        const info = id ? byId.get(id) : undefined;
        const target = {
          onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== i) setOver(i); },
          onDragLeave: () => setOver((o) => (o === i ? undefined : o)),
          onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(undefined); const dragged = e.dataTransfer.getData("text/plain"); if (dragged) onDropOn(dragged, id); },
        };
        if (!id || !info) {
          return <div key={i} className={`banco-casa${over === i ? " alvo" : ""}`} {...target} onClick={() => selected && onDropOn(selected, undefined)} aria-label={t("tactic.bench")} />;
        }
        const hint = hints.get(id);
        const classes = `banco-casa banco-cartao${selected === id ? " escolhido" : ""}${info.unavailable ? " indisponivel" : ""}${over === i ? " alvo" : ""}${hint ? ` dica-${hint}` : dimmed ? " esmaecido" : ""}`;
        const label = `${info.name} · ${abbreviationPosition(t, info.positions[0]?.pos ?? "ST")}`;
        return (
          <div
            key={i}
            role="button"
            tabIndex={0}
            className={classes}
            draggable
            title={label}
            onMouseDown={() => onGrab(id)}
            onContextMenu={(e) => { e.preventDefault(); onRemove(id); }}
            onDragStart={(e) => startPlayerDrag(e, id, { name: info.name, position: abbreviationPosition(t, info.positions[0]?.pos ?? "ST"), background })}
            onDragEnd={() => setOver(undefined)}
            onClick={() => (selected && selected !== id ? onDropOn(selected, id) : onSelect(id))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(id); } }}
            aria-pressed={selected === id}
            {...target}
          >
            <span className="banco-pos" style={{ background }}>{abbreviationPosition(t, info.positions[0]?.pos ?? "ST")}</span>
            <span className="banco-nome">{info.name}</span>
            {info.stars !== undefined && <Stars value={info.stars} />}
          </div>
        );
      })}
    </div>
  );
}
