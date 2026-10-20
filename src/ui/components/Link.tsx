"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { isInSecondDistrict } from "@/engine/season/districts";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { profileHref, type ProfileEntityType } from "@/ui/links";

/** Qualquer nome de clube, pessoa, cidade ou competição é uma ligação para a sua ficha. */
export function EntityLink({ k, id, children, withoutSwatch }: { k: ProfileEntityType; id: string; children: ReactNode; withoutSwatch?: boolean }) {
  // a segunda distrital existe para os clubes mas não no jogo: mostra-se o nome, sem ligação
  if (k === "competition" && isInSecondDistrict(id)) return <span className="ligacao ligacao-competicao sem-ligacao">{children}</span>;
  // clubes estrangeiros (competições europeias) não têm ficha
  if (k === "club" && id.startsWith("x-")) return <span className="ligacao ligacao-clube sem-ligacao">{!withoutSwatch && <ClubSwatch id={id} />}{children}</span>;
  return (
    <Link href={profileHref(k, id)} className={`ligacao ligacao-${k}`}>
      {k === "club" && !withoutSwatch && <ClubSwatch id={id} />}
      {children}
    </Link>
  );
}
