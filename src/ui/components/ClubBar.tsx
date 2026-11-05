"use client";
import { useEffect, useState } from "react";
import type { CityProfileData, ClubProfileData } from "@/engine/api/contracts";
import { useEngine } from "@/ui/EngineProvider";
import type { useTime } from "@/ui/useTime";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Time = ReturnType<typeof useTime>;

/** O que o gamer quer ter sempre à vista sobre o seu clube e a sua cidade: próximo jogo, lugar na liga, caixa, margem salarial, lesionados e apoio da Câmara. */
export function ClubBar({ club, time }: { club: string | undefined; time: Time }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const [d, setD] = useState<ClubProfileData | null | undefined>(undefined);
  const [city, setCity] = useState<CityProfileData | null | undefined>(undefined);
  const today = time.state?.today;
  useEffect(() => {
    if (!engine || !club) return;
    let live = true;
    engine.call("clubProfile", { id: club }).then(async (r) => {
      if (!live) return;
      setD(r);
      const c = r ? await engine.call("cityProfile", { id: r.city.id }) : null;
      if (live) setCity(c);
    }).catch(() => live && setD(null));
    return () => { live = false; };
  }, [engine, club, today]);
  if (!club || !d) return null;

  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const next = time.nextMatch;
  const team = d.season?.team;
  const budget = d.finances.budget;
  const left = budget ? budget.wageBillMax - budget.currentBill : undefined;
  const injured = d.squad.filter((p) => d.extraSquad[p.id]?.injured).length;
  const support = city?.mayor?.sportSupport;
  const item = (label: string, value: string, tone?: "erro") => <span key={label}>{label}: <b className={tone}>{value}</b></span>;
  return (
    <>
      {next && item(t("bar.next"), `${next.atHome ? "" : "@ "}${next.opponent} · ${day.format(new Date(`${next.date}T00:00:00Z`))}`)}
      {team && item(t("bar.league"), `${team.position}º · ${team.points} ${t("bar.points")}`)}
      {d.finances.balance !== undefined && item(t("bar.cash"), money.format(d.finances.balance), d.finances.balance < 0 ? "erro" : undefined)}
      {left !== undefined && item(t("bar.wageRoom"), money.format(left), left < 0 ? "erro" : undefined)}
      {item(t("bar.injured"), String(injured))}
      {support !== undefined && item(t("bar.council"), t(`city.level.${support}` as Key))}
    </>
  );
}
