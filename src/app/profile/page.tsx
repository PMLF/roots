"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ClubProfileData, CompetitionPage, CupView, EuropeView, CityProfileData, LocalityProfileData, PersonProfileData } from "@/engine/api/contracts";
import { ClubProfile } from "@/ui/components/profiles/ClubProfile";
import { CupProfile } from "@/ui/components/profiles/CupProfile";
import { EuropeProfile } from "@/ui/components/profiles/EuropeProfile";
import { CompetitionProfile } from "@/ui/components/profiles/CompetitionProfile";
import { LocalityProfile } from "@/ui/components/profiles/LocalityProfile";
import { PersonProfile } from "@/ui/components/profiles/PersonProfile";
import { useT } from "@/ui/i18n/LocaleProvider";
import { profileHref, readProfile } from "@/ui/links";
import { useSeeAll } from "@/ui/dev";
import { useEngine } from "@/ui/EngineProvider";

type State =
  | { phase: "loading" }
  | { phase: "not-found" }
  | { phase: "error"; error: string }
  | { phase: "club"; d: ClubProfileData }
  | { phase: "person"; d: PersonProfileData }
  | { phase: "locality"; d: LocalityProfileData; city: CityProfileData | null }
  | { phase: "competition"; d: CompetitionPage }
  | { phase: "cup"; d: CupView }
  | { phase: "europe"; d: EuropeView };

function Content() {
  const { t } = useT();
  const engine = useEngine();
  const params = useSearchParams();
  const router = useRouter();
  const target = readProfile(params);
  const tabParam = params.get("tab");
  const [state, setState] = useState<State>({ phase: "loading" });
  const [seeAll] = useSeeAll();
  const k = target?.k;
  const id = target?.id;

  useEffect(() => {
    if (!engine || !k || !id) return;
    let live = true;
    setState({ phase: "loading" });
    (async () => {
      try {
        if (k === "club") {
          const d = await engine.call("clubProfile", { id, seeAll });
          if (live) setState(d ? { phase: "club", d } : { phase: "not-found" });
        } else if (k === "person") {
          const d = await engine.call("personProfile", { id, seeAll });
          if (live) setState(d ? { phase: "person", d } : { phase: "not-found" });
        } else if (k === "locality") {
          const d = await engine.call("localityProfile", { id });
          const city = d ? await engine.call("cityProfile", { id: d.city.id }) : null;
          if (live) setState(d ? { phase: "locality", d, city } : { phase: "not-found" });
        } else if (k === "city") {
          // uma só página de lugar (RZ-238): o concelho abre a ficha da sua sede, mantendo o separador
          const d = await engine.call("cityProfile", { id });
          if (d) router.replace(`${profileHref("locality", d.seat.id)}${tabParam ? `&tab=${encodeURIComponent(tabParam)}` : ""}`);
          else if (live) setState({ phase: "not-found" });
        } else if (k === "competition") {
          const d = await engine.call("competitionPage", { league: id });
          if (d) { if (live) setState({ phase: "competition", d }); }
          else {
            const cup = await engine.call("cupView", { competition: id });
            if (cup) { if (live) setState({ phase: "cup", d: cup }); }
            else {
              const eu = await engine.call("europeView", { competition: id });
              if (live) setState(eu ? { phase: "europe", d: eu } : { phase: "not-found" });
            }
          }
        }
      } catch (e) {
        if (live) setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [engine, k, id, seeAll, router, tabParam]);

  if (!target) return <p className="erro">{t("profile.invalida")}</p>;
  switch (state.phase) {
    case "loading": return <p data-testid="ficha-estado">{t("profile.loading")}</p>;
    case "not-found": return <p data-testid="ficha-estado" className="erro">{t("profile.notFound")}</p>;
    case "error": return <p className="erro">{state.error}</p>;
    case "club": return <ClubProfile d={state.d} seeAll={seeAll} />;
    case "person": return <PersonProfile d={state.d} seeAll={seeAll} />;
    case "locality": return <LocalityProfile d={state.d} city={state.city} />;
    case "competition": return <CompetitionProfile d={state.d} />;
    case "cup": return <CupProfile d={state.d} />;
    case "europe": return <EuropeProfile d={state.d} />;
  }
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
