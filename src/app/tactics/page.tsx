"use client";
import { Suspense } from "react";
import { ComClube } from "@/ui/components/ComClube";
import { EditorTatica } from "@/ui/components/EditorTatica";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Tática (RZ-158): formação, estilo, níveis e onze do clube do gamer; pode alterar-se a qualquer momento. */
export default function PaginaTatica() {
  const { t } = useT();
  return <Suspense fallback={null}><ComClube titulo={t("menu.tatica")}>{() => <EditorTatica />}</ComClube></Suspense>;
}
