"use client";
import { Suspense, useEffect, useState } from "react";
import type { ClubProfileData } from "@/engine/api/contratos";
import { WithClub } from "@/ui/components/ComClube";
import { ClubProfile } from "@/ui/components/fichas/FichaClube";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useSeeAll } from "@/ui/dev";
import { useEngine } from "@/ui/MotorProvider";

function Content({ club }: { club: string }) {
  const engine = useEngine();
  const { t } = useT();
  const [seeAll] = useSeeAll();
  const [d, setD] = useState<ClubProfileData | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("clubProfile", { id: club, seeAll }).then((r) => live && setD(r)).catch(() => live && setD(null));
    return () => { live = false; };
  }, [engine, club, seeAll]);
  if (d === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (d === null) return <p className="erro">{t("ficha.naoEncontrada")}</p>;
  return <ClubProfile d={d} seeAll={seeAll} />;
}

/** Clube (RZ-145): a ficha do clube do gamer. */
export default function ClubPage() {
  return <Suspense fallback={null}><WithClub title="">{(c) => <Content club={c} />}</WithClub></Suspense>;
}
