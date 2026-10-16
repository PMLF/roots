"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { hrefFicha, type TipoEntidadeFicha } from "@/ui/ligacoes";

/** Qualquer nome de clube, pessoa, cidade ou competição é uma ligação para a sua ficha. */
export function Ligacao({ k, id, children, semAmostra }: { k: TipoEntidadeFicha; id: string; children: ReactNode; semAmostra?: boolean }) {
  return (
    <Link href={hrefFicha(k, id)} className={`ligacao ligacao-${k}`}>
      {k === "clube" && !semAmostra && <AmostraClube id={id} />}
      {children}
    </Link>
  );
}
