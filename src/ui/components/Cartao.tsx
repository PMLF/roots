import type { ReactNode } from "react";

/** Bloco de informação de uma ficha: título e conteúdo. `larga` ocupa a linha toda; `dev` marca informação só de developer. */
export function Cartao({ titulo, children, larga, dev }: { titulo?: ReactNode; children: ReactNode; larga?: boolean; dev?: boolean }) {
  return (
    <section className={`cartao${larga ? " larga" : ""}${dev ? " dev" : ""}`}>
      {titulo !== undefined && <h2>{titulo}</h2>}
      {children}
    </section>
  );
}

/** Lista de pares rótulo/valor, compacta (cartão de cidadão). */
export function Dados({ linhas }: { linhas: { rotulo: string; valor: ReactNode }[] }) {
  return (
    <dl className="dados">
      {linhas.map((l) => (
        <div key={l.rotulo}>
          <dt>{l.rotulo}</dt>
          <dd>{l.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Ficha curta: nome ao lado de um cartão com os dados de identidade. */
export function Topo({ titulo, etiquetas, cartao }: { titulo: string; etiquetas?: ReactNode; cartao?: ReactNode }) {
  return (
    <header className="ficha-topo">
      <div className="ficha-topo-nome">
        <h1>{titulo}</h1>
        {etiquetas && <p className="etiquetas">{etiquetas}</p>}
      </div>
      {cartao && <div className="ficha-topo-cartao">{cartao}</div>}
    </header>
  );
}
