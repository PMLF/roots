"use client";
import { Suspense } from "react";
import { WithClub } from "@/ui/components/WithClub";
import { LocalityProfile } from "@/ui/components/profiles/LocalityProfile";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngineLoad } from "@/ui/useEngineLoad";

function Content({ club }: { club: string }) {
  const { t } = useT();
  const d = useEngineLoad(async (engine) => {
    const c = await engine.call("clubProfile", { id: club });
    const loc = c ? await engine.call("localityProfile", { id: c.locality.id }) : null;
    const city = loc ? await engine.call("cityProfile", { id: loc.city.id }) : null;
    return loc ? { loc, city } : null;
  }, [club]);
  if (d === undefined) return <p>{t("profile.loading")}</p>;
  if (d === null) return <p className="erro">{t("profile.notFound")}</p>;
  return <LocalityProfile d={d.loc} city={d.city} />;
}

/** Local (RZ-238): a localidade do clube do gamer, com o concelho como contexto. As das outras cidades abrem pelas ligações (`/profile/?type=city`). */
export default function CityPage() {
  return <Suspense fallback={null}><WithClub title="">{(c) => <Content club={c} />}</WithClub></Suspense>;
}
