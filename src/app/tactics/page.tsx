"use client";
import { Suspense } from "react";
import { WithClub } from "@/ui/components/ComClube";
import { TacticEditor } from "@/ui/components/EditorTatica";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Tática (RZ-158): formação, estilo, níveis e onze do clube do gamer; pode alterar-se a qualquer momento. */
export default function TacticPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("menu.tatica")}>{() => <TacticEditor />}</WithClub></Suspense>;
}
