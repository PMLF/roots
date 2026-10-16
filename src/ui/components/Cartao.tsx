import type { ReactNode } from "react";

/** Bloco de informação de uma ficha: título e conteúdo. `larga` ocupa a linha toda; `dev` marca informação só de developer. */
export function Card({ title, children, wide, dev }: { title?: ReactNode; children: ReactNode; wide?: boolean; dev?: boolean }) {
  return (
    <section className={`cartao${wide ? " larga" : ""}${dev ? " dev" : ""}`}>
      {title !== undefined && <h2>{title}</h2>}
      {children}
    </section>
  );
}

/** Lista de pares rótulo/valor, compacta (cartão de cidadão). */
export function Data({ lines }: { lines: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="dados">
      {lines.map((l) => (
        <div key={l.label}>
          <dt>{l.label}</dt>
          <dd>{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Ficha curta: nome ao lado de um cartão com os dados de identidade. */
export function Top({ title, labels, card, crest }: { title: string; labels?: ReactNode; card?: ReactNode; crest?: ReactNode }) {
  return (
    <header className="ficha-topo">
      <div className="ficha-topo-nome">
        <h1>{crest}{title}</h1>
        {labels && <p className="etiquetas">{labels}</p>}
      </div>
      {card && <div className="ficha-topo-cartao">{card}</div>}
    </header>
  );
}
