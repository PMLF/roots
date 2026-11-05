import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";

export type AttributeLine = {
  id: string;
  name: string;
  /** Texto: «14», «≈ 12-15» ou «?». */
  text: string;
  /** Valor numérico para a cor (centro da estimativa); sem ele, «?». */
  number?: number;
  state: "exact" | "estimated" | "outdated" | "unknown";
  hint?: string;
};
export type AttributesGroup = { id: string; title: string; lines: AttributeLine[] };

/** Faixas de 1 a 20 como no FM: baixo → excelente. */
const band = (n?: number) => (n === undefined ? 0 : n <= 6 ? 1 : n <= 10 ? 2 : n <= 13 ? 3 : n <= 16 ? 4 : 5);

const HIGHLIGHTS = 4;

/**
 * Atributos de 1 a 20 por grupo. O que não se conhece mostra «?»; o que se conhece só em parte, o intervalo.
 * No telemóvel (RZ-226) vê-se primeiro um resumo (os melhores e os piores) e os grupos ficam recolhidos; em desktop estão abertos.
 */
export function Attributes({ groups }: { groups: AttributesGroup[] }) {
  const { t } = useT();
  const root = useRef<HTMLDivElement>(null);
  // abertos por omissão em ecrãs largos, recolhidos em ecrãs estreitos (só na primeira vez)
  useEffect(() => {
    const open = window.matchMedia("(min-width: 901px)").matches;
    root.current?.querySelectorAll("details").forEach((d) => { d.open = open; });
  }, []);
  const known = groups.flatMap((g) => g.lines).filter((l) => l.number !== undefined);
  const sorted = [...known].sort((a, b) => (b.number as number) - (a.number as number));
  const best = sorted.slice(0, HIGHLIGHTS);
  const worst = sorted.length >= HIGHLIGHTS * 2 ? sorted.slice(-HIGHLIGHTS).reverse() : [];
  const line = (l: AttributeLine) => (
    <li key={l.id} title={l.hint}>
      <span>{l.name}</span>
      <b className={`attr attr-${l.state}`} data-banda={band(l.number)}>{l.text}</b>
    </li>
  );
  return (
    <div ref={root}>
      {best.length > 0 && (
        <div className="atributos atributos-resumo">
          <div className="atributos-grupo">
            <h3>{t("attributes.best")}</h3>
            <ul>{best.map(line)}</ul>
          </div>
          {worst.length > 0 && (
            <div className="atributos-grupo">
              <h3>{t("attributes.worst")}</h3>
              <ul>{worst.map(line)}</ul>
            </div>
          )}
        </div>
      )}
      <div className="atributos">
        {groups.map((g) => (
          <details key={g.id} className="atributos-grupo" open>
            <summary><h3>{g.title}</h3></summary>
            <ul>{g.lines.map(line)}</ul>
          </details>
        ))}
      </div>
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "destaque" | "suave" | "aviso" | "mercado" | "vida" }) {
  return <span className={`chip${tone ? ` chip-${tone}` : ""}`}>{children}</span>;
}
