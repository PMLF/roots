import type { ReactNode } from "react";

export type LinhaAtributo = {
  id: string;
  nome: string;
  /** Texto: «14», «≈ 12-15» ou «?». */
  texto: string;
  /** Valor numérico para a cor (centro da estimativa); sem ele, «?». */
  numero?: number;
  estado: "exato" | "estimado" | "desatualizado" | "desconhecido";
  dica?: string;
};
export type GrupoAtributos = { id: string; titulo: string; linhas: LinhaAtributo[] };

/** Faixas de 1 a 20 como no FM: baixo → excelente. */
const banda = (n?: number) => (n === undefined ? 0 : n <= 6 ? 1 : n <= 10 ? 2 : n <= 13 ? 3 : n <= 16 ? 4 : 5);

/** Atributos de 1 a 20 por grupo. O que não se conhece mostra «?»; o que se conhece só em parte, o intervalo. */
export function Atributos({ grupos }: { grupos: GrupoAtributos[] }) {
  return (
    <div className="atributos">
      {grupos.map((g) => (
        <div key={g.id} className="atributos-grupo">
          <h3>{g.titulo}</h3>
          <ul>
            {g.linhas.map((l) => (
              <li key={l.id} title={l.dica}>
                <span>{l.nome}</span>
                <b className={`attr attr-${l.estado}`} data-banda={banda(l.numero)}>{l.texto}</b>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Chip({ children, tom }: { children: ReactNode; tom?: "destaque" | "suave" | "aviso" }) {
  return <span className={`chip${tom ? ` chip-${tom}` : ""}`}>{children}</span>;
}
