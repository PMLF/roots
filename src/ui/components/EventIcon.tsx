import type { LiveLine } from "@/engine/season/liveMatch";

/**
 * Ícones dos lances do jogo (24×24). Cada lance tem forma e cor próprias para se distinguir de relance; a cor vem de classes
 * `.ev-*` (nunca só a cor: a forma também muda). Decorativos: o texto do lance ao lado diz o que aconteceu.
 */
const BALL = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8.200l3.500 2.500-1.300 4.100H9.800L8.500 10.700zM12 8.200V4M15.500 10.700l3.800-1.200M14.200 14.800l2.300 3.200M9.800 14.800 7.500 18M8.500 10.700 4.700 9.500";

type Form = { d: string; full?: boolean; extra?: string };
const FORMS: Record<string, Form> = {
  goal: { d: BALL },
  penalty: { d: "M3 20V8h18v12M3 8l2-3h14l2 3", extra: "M12 16m-1.800 0a1.800 1.800 0 1 0 3.600 0 1.800 1.800 0 1 0-3.600 0" },
  "shot-goal": { d: BALL },
  "shot-saved": { d: "M8 12V6.500a1.500 1.500 0 0 1 3 0V11M11 11V5a1.500 1.500 0 0 1 3 0v6M14 11V6a1.500 1.500 0 0 1 3 0v7.500c0 4-2 7-6 7s-5-2-6-4l-1.500-3a1.500 1.500 0 0 1 2.500-1.500L8 14" },
  "shot-away": { d: "M5 19 19 5M10 5h9v9" },
  "shot-blocked": { d: "M12 3 19 6v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z" },
  corner: { d: "M6 21V4M6 4h11l-3 4 3 4H6" },
  card: { d: "M8 4h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", full: true },
  injury: { d: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z", full: true },
  substitution: { d: "M8 20V5M4 9l4-4 4 4M16 4v15M12 15l4 4 4-4" },
  start: { d: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.500 1.500M9.500 2.500h5" },
  halfTime: { d: "M8 5v14M16 5v14" },
  end: { d: "M5 21V4M5 4h13l-3 4.500 3 4.500H5" },
};

export function iconKey(l: LiveLine): string {
  if (l.type === "shot") return `shot-${l.outcome ?? "away"}`;
  return l.type;
}

export function EventIcon({ rowKey, colour }: { rowKey: string; colour?: "yellow" | "red" }) {
  const f = FORMS[rowKey] ?? FORMS["end"]!;
  return (
    <svg className={`ev-icone ev-${rowKey}${colour ? ` ev-${colour}` : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={f.d} className={f.full ? "ev-cheio" : undefined} />
      {f.extra && <path d={f.extra} className="ev-cheio" />}
    </svg>
  );
}
