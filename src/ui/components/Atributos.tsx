import type { ReactNode } from "react";

export type AttributeLine = {
  id: string;
  name: string;
  /** Texto: «14», «≈ 12-15» ou «?». */
  text: string;
  /** Valor numérico para a cor (centro da estimativa); sem ele, «?». */
  number?: number;
  state: "exact" | "estimado" | "outdated" | "unknown";
  hint?: string;
};
export type AttributesGroup = { id: string; title: string; lines: AttributeLine[] };

/** Faixas de 1 a 20 como no FM: baixo → excelente. */
const band = (n?: number) => (n === undefined ? 0 : n <= 6 ? 1 : n <= 10 ? 2 : n <= 13 ? 3 : n <= 16 ? 4 : 5);

/** Atributos de 1 a 20 por grupo. O que não se conhece mostra «?»; o que se conhece só em parte, o intervalo. */
export function Attributes({ groups }: { groups: AttributesGroup[] }) {
  return (
    <div className="atributos">
      {groups.map((g) => (
        <div key={g.id} className="atributos-grupo">
          <h3>{g.title}</h3>
          <ul>
            {g.lines.map((l) => (
              <li key={l.id} title={l.hint}>
                <span>{l.name}</span>
                <b className={`attr attr-${l.state}`} data-banda={band(l.number)}>{l.text}</b>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "destaque" | "suave" | "aviso" }) {
  return <span className={`chip${tone ? ` chip-${tone}` : ""}`}>{children}</span>;
}
