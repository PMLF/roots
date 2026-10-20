"use client";
import { useEffect, useState } from "react";
import type { ClubCompetition } from "@/engine/api/contracts";
import { Card, Data } from "@/ui/components/Card";
import { useRoundName } from "@/ui/components/competition/CupRounds";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";

/** Competições em que o clube joga esta época: posição na liga, fase nas taças (RZ-244). */
export function ClubCompetitions({ club }: { club: string }) {
  const { t } = useT();
  const engine = useEngine();
  const roundName = useRoundName();
  const [list, setList] = useState<ClubCompetition[] | null>(null);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("clubCompetitions", { club }).then((x) => live && setList(x)).catch(() => undefined);
    return () => { live = false; };
  }, [engine, club]);
  if (!list || list.length === 0) return null;
  const value = (c: ClubCompetition) => {
    if (c.kind === "league") return c.position ? <b>{t("club.place", { n: c.position })}{c.of ? <small className="suave"> / {c.of}</small> : null}</b> : "—";
    if (c.status === "champion") return <b>{t("clubCompetitions.champion")}</b>;
    if (c.status === "runnerUp") return <b>{t("clubCompetitions.runnerUp")}</b>;
    if (c.position && c.status === "out" && !c.round) return <span className="suave">{t("clubCompetitions.outLeaguePhase", { n: c.position })}</span>;
    if (c.position && c.status === "alive" && !c.round) return <b>{t("clubCompetitions.leaguePhase", { n: c.position, of: c.of ?? 36 })}</b>;
    if (c.status === "waiting" || !c.round) return <span className="suave">{t("clubCompetitions.waiting")}</span>;
    const name = roundName({ key: c.round.key, n: c.round.n });
    return c.status === "out" ? <span className="suave">{t("clubCompetitions.out", { round: name })}</span> : <b>{name}</b>;
  };
  return (
    <Card title={t("card.competitions")}>
      <Data lines={list.map((c) => ({ label: c.competition, value: value(c) }))} />
    </Card>
  );
}
