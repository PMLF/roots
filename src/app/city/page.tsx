"use client";
import { Suspense, useEffect, useState } from "react";
import type { CityProfileData } from "@/engine/api/contratos";
import { WithClub } from "@/ui/components/ComClube";
import { CityProfile } from "@/ui/components/fichas/FichaCidade";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/MotorProvider";

function Content({ club }: { club: string }) {
  const engine = useEngine();
  const { t } = useT();
  const [d, setD] = useState<CityProfileData | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    (async () => {
      const c = await engine.call("clubProfile", { id: club });
      const city = c ? await engine.call("cityProfile", { id: c.city.id }) : null;
      if (live) setD(city);
    })().catch(() => live && setD(null));
    return () => { live = false; };
  }, [engine, club]);
  if (d === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (d === null) return <p className="erro">{t("ficha.naoEncontrada")}</p>;
  return <CityProfile d={d} />;
}

/** Cidade (RZ-133): o concelho do clube do gamer. As das outras cidades abrem pelas ligações (`/profile/?type=city`). */
export default function CityPage() {
  return <Suspense fallback={null}><WithClub title="">{(c) => <Content club={c} />}</WithClub></Suspense>;
}
