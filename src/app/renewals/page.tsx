"use client";
import { Suspense } from "react";
import { WithClub } from "@/ui/components/WithClub";
import { Renewals } from "@/ui/components/Renewals";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Renovações (RZ-165): contratos do teu clube que acabam esta época. */
export default function RenewalsPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("menu.renewals")}>{() => <Renewals />}</WithClub></Suspense>;
}
