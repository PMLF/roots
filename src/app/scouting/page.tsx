"use client";
import { Suspense } from "react";
import { WithClub } from "@/ui/components/WithClub";
import { Scouting } from "@/ui/components/Scouting";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Scouting (RZ-230): pesquisa de jogadores com o alcance dos olheiros, observações pagas e pesquisas por posição. */
export default function ScoutingPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("menu.scouting")}>{() => <Scouting />}</WithClub></Suspense>;
}
