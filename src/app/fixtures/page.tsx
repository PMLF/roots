"use client";
import { Suspense } from "react";
import { ClubMatches } from "@/ui/components/ClubMatches";
import { WithClub } from "@/ui/components/WithClub";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Jogos (RZ-145): calendário e resultados do clube do gamer (relatório de um jogo chega com o ciclo de dias). */
export default function MatchesPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("menu.matches")}>{(c) => <ClubMatches club={c} />}</WithClub></Suspense>;
}
