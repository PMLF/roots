"use client";
import type { CSSProperties, ReactNode } from "react";
import { predominantColour } from "@/ui/colours";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { useClubsColours } from "@/ui/useClubColours";

/**
 * Cartão alto para o que importa na caixa de entrada (propostas por jogadores, camadas jovens…): faixa e fundo com a cor do clube,
 * título maior, linha de dados (posição, estrelas, idade…) e, se houver, o botão para responder.
 */
export function TallCard({ clubId, title, details, children, actions, unread }: { clubId?: string; title: ReactNode; details?: ReactNode; children?: ReactNode; actions?: ReactNode; unread?: boolean }) {
  const all = useClubsColours();
  const colour = predominantColour(clubId ? all?.get(clubId) : undefined);
  return (
    <article className={`cartao-alto${unread ? " nao-lida" : ""}`} style={colour ? ({ "--cor-clube": colour } as CSSProperties) : undefined}>
      <h3>{clubId && <ClubSwatch id={clubId} />}{title}</h3>
      {details && <p className="cartao-alto-dados">{details}</p>}
      {children}
      {actions && <p className="acoes">{actions}</p>}
    </article>
  );
}
