"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { hrefFicha, type TipoEntidadeFicha } from "@/ui/ligacoes";

/** Qualquer nome de clube, pessoa, cidade ou competição é uma ligação para a sua ficha. */
export function Ligacao({ k, id, children }: { k: TipoEntidadeFicha; id: string; children: ReactNode }) {
  return (
    <Link href={hrefFicha(k, id)} className={`ligacao ligacao-${k}`}>
      {k === "clube" && <AmostraClube id={id} />}
      {children}
    </Link>
  );
}
