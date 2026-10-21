"use client";
import { Suspense } from "react";
import { WithClub } from "@/ui/components/WithClub";
import { CityProfile } from "@/ui/components/profiles/CityProfile";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngineLoad } from "@/ui/useEngineLoad";

function Content({ club }: { club: string }) {
  const { t } = useT();
  const d = useEngineLoad(async (engine) => {
    const c = await engine.call("clubProfile", { id: club });
    return c ? engine.call("cityProfile", { id: c.city.id }) : null;
  }, [club]);
  if (d === undefined) return <p>{t("profile.loading")}</p>;
  if (d === null) return <p className="erro">{t("profile.notFound")}</p>;
  return <CityProfile d={d} />;
}

/** Cidade (RZ-133): o concelho do clube do gamer. As das outras cidades abrem pelas ligações (`/profile/?type=city`). */
export default function CityPage() {
  return <Suspense fallback={null}><WithClub title="">{(c) => <Content club={c} />}</WithClub></Suspense>;
}
