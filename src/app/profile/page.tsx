"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ClubProfileData, CompetitionPage, CityProfileData, LocalityProfileData, PersonProfileData } from "@/engine/api/contratos";
import { CityProfile } from "@/ui/components/fichas/FichaCidade";
import { ClubProfile } from "@/ui/components/fichas/FichaClube";
import { CompetitionProfile } from "@/ui/components/fichas/FichaCompeticao";
import { LocalityProfile } from "@/ui/components/fichas/FichaLocalidade";
import { PersonProfile } from "@/ui/components/fichas/FichaPessoa";
import { useT } from "@/ui/i18n/LocaleProvider";
import { readProfile } from "@/ui/ligacoes";
import { useSeeAll } from "@/ui/dev";
import { useEngine } from "@/ui/MotorProvider";

type State =
  | { phase: "a-carregar" }
  | { phase: "nao-encontrada" }
  | { phase: "error"; error: string }
  | { phase: "club"; d: ClubProfileData }
  | { phase: "person"; d: PersonProfileData }
  | { phase: "locality"; d: LocalityProfileData }
  | { phase: "city"; d: CityProfileData }
  | { phase: "competition"; d: CompetitionPage };

function Content() {
  const { t } = useT();
  const engine = useEngine();
  const target = readProfile(useSearchParams());
  const [state, setState] = useState<State>({ phase: "a-carregar" });
  const [seeAll] = useSeeAll();
  const k = target?.k;
  const id = target?.id;

  useEffect(() => {
    if (!engine || !k || !id) return;
    let live = true;
    setState({ phase: "a-carregar" });
    (async () => {
      try {
        if (k === "club") {
          const d = await engine.call("clubProfile", { id, seeAll });
          if (live) setState(d ? { phase: "club", d } : { phase: "nao-encontrada" });
        } else if (k === "person") {
          const d = await engine.call("personProfile", { id, seeAll });
          if (live) setState(d ? { phase: "person", d } : { phase: "nao-encontrada" });
        } else if (k === "locality") {
          const d = await engine.call("localityProfile", { id });
          if (live) setState(d ? { phase: "locality", d } : { phase: "nao-encontrada" });
        } else if (k === "city") {
          const d = await engine.call("cityProfile", { id });
          if (live) setState(d ? { phase: "city", d } : { phase: "nao-encontrada" });
        } else if (k === "competition") {
          const d = await engine.call("competitionPage", { league: id });
          if (live) setState(d ? { phase: "competition", d } : { phase: "nao-encontrada" });
        }
      } catch (e) {
        if (live) setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [engine, k, id, seeAll]);

  if (!target) return <p className="erro">{t("ficha.invalida")}</p>;
  switch (state.phase) {
    case "a-carregar": return <p data-testid="ficha-estado">{t("ficha.aCarregar")}</p>;
    case "nao-encontrada": return <p data-testid="ficha-estado" className="erro">{t("ficha.naoEncontrada")}</p>;
    case "error": return <p className="erro">{state.error}</p>;
    case "club": return <ClubProfile d={state.d} seeAll={seeAll} />;
    case "person": return <PersonProfile d={state.d} seeAll={seeAll} />;
    case "locality": return <LocalityProfile d={state.d} />;
    case "city": return <CityProfile d={state.d} />;
    case "competition": return <CompetitionProfile d={state.d} />;
  }
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}
