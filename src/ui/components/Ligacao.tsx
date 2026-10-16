"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { isInSecondDistrict } from "@/engine/epoca/distritais";
import { ClubSwatch } from "@/ui/components/AmostraClube";
import { profileHref, type ProfileEntityType } from "@/ui/ligacoes";

/** Qualquer nome de clube, pessoa, cidade ou competição é uma ligação para a sua ficha. */
export function EntityLink({ k, id, children, withoutSwatch }: { k: ProfileEntityType; id: string; children: ReactNode; withoutSwatch?: boolean }) {
  // a segunda distrital existe para os clubes mas não no jogo: mostra-se o nome, sem ligação
  if (k === "competition" && isInSecondDistrict(id)) return <span className="ligacao ligacao-competicao sem-ligacao">{children}</span>;
  return (
    <Link href={profileHref(k, id)} className={`ligacao ligacao-${k}`}>
      {k === "club" && !withoutSwatch && <ClubSwatch id={id} />}
      {children}
    </Link>
  );
}
