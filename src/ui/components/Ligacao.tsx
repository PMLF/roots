"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { estaNaSegundaDistrital } from "@/engine/epoca/distritais";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { hrefFicha, type TipoEntidadeFicha } from "@/ui/ligacoes";

/** Qualquer nome de clube, pessoa, cidade ou competição é uma ligação para a sua ficha. */
export function Ligacao({ k, id, children, semAmostra }: { k: TipoEntidadeFicha; id: string; children: ReactNode; semAmostra?: boolean }) {
  // a segunda distrital existe para os clubes mas não no jogo: mostra-se o nome, sem ligação
  if (k === "competicao" && estaNaSegundaDistrital(id)) return <span className="ligacao ligacao-competicao sem-ligacao">{children}</span>;
  return (
    <Link href={hrefFicha(k, id)} className={`ligacao ligacao-${k}`}>
      {k === "clube" && !semAmostra && <AmostraClube id={id} />}
      {children}
    </Link>
  );
}
