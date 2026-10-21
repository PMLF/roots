"use client";
import { Suspense } from "react";
import { WithClub } from "@/ui/components/WithClub";
import { OwnClubProfile } from "@/ui/components/profiles/OwnClubProfile";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Plantel (RZ-145): a tabela de jogadores do clube do gamer. */
export default function SquadPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("menu.squad")}>{(c) => <OwnClubProfile club={c} squadOnly />}</WithClub></Suspense>;
}
