"use client";
import { useCallback, useEffect, useState } from "react";
import type { LocalTalentData, ScoutRow, ScoutingData } from "@/engine/api/contracts";
import { BidDialog } from "@/ui/components/BidDialog";
import { Card } from "@/ui/components/Card";
import { Flag } from "@/ui/components/Flag";
import { EntityLink } from "@/ui/components/Link";
import { BusyDialog, ObserveDialog } from "@/ui/components/ScoutDialogs";
import { Stars } from "@/ui/components/Stars";
import { Table } from "@/ui/components/Table";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition, namePosition } from "@/ui/i18n/position";
import type { Column } from "@/ui/table/logic";

/**
 * Separador «Talento local» da cidade (RZ-234): os jovens do concelho que ainda não assinaram por nenhum clube e, separados,
 * os da terra que já jogam em clubes (com o clube, seja o do gamer ou não). Estrelas só depois de observados.
 */
export function LocalTalent({ city }: { city: string }) {
  const { t } = useT();
  const engine = useEngine();
  const [d, setD] = useState<LocalTalentData | null | undefined>(undefined);
  const [scouting, setScouting] = useState<ScoutingData | undefined>(undefined);
  const [observe, setObserve] = useState<ScoutRow | undefined>(undefined);
  const [bid, setBid] = useState<ScoutRow | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    engine?.call("localTalent", { city }).then(setD);
    engine?.call("scouting", null).then(setScouting);
  }, [engine, city]);
  useEffect(load, [load]);
  if (d === undefined) return <p>{t("profile.loading")}</p>;
  if (d === null) return <p className="vazio">{t("city.talent.none")}</p>;

  const free = scouting ? scouting.orders.filter((o) => !o.done).length < scouting.capacity : false;
  const columns = (withClub: boolean): Column<ScoutRow>[] => [
    { id: "name", title: t("column.name"), value: (r) => r.name },
    { id: "age", title: t("column.age"), value: (r) => r.age, numeric: true },
    { id: "pos", title: t("column.position"), value: (r) => r.position },
    ...(withClub ? [{ id: "club", title: t("column.club"), value: (r: ScoutRow) => r.club?.name ?? "" }] : []),
    { id: "stars", title: t("column.level"), value: (r) => r.rating?.stars ?? 0, numeric: true },
    { id: "potential", title: t("column.potential"), value: (r) => r.rating?.potential?.high ?? 0, numeric: true },
    { id: "action", title: "", value: () => "" },
  ];
  const cell = {
    name: (r: ScoutRow) => <><EntityLink k="person" id={r.id}>{r.name}</EntityLink> <Flag id={r.nationality} /></>,
    pos: (r: ScoutRow) => <abbr title={namePosition(t, r.position)}>{abbreviationPosition(t, r.position)}</abbr>,
    club: (r: ScoutRow) => (r.club ? <><EntityLink k="club" id={r.club.id}>{r.club.name}</EntityLink>{r.club.id === d.mine && <small className="suave"> · {t("city.talent.yours")}</small>}</> : null),
    stars: (r: ScoutRow) => (r.rating ? <Stars value={r.rating.stars} /> : <span className="suave">?</span>),
    potential: (r: ScoutRow) => (r.rating?.potential ? <Stars range={r.rating.potential} /> : <span className="suave">?</span>),
    action: (r: ScoutRow) => (
      <span className="acoes-linha">
        {r.busy ? <span className="suave">{t("scouting.observing")}</span> : <button type="button" className="secundario" disabled={!scouting || r.knowledge === "month"} onClick={() => (free ? setObserve(r) : setBusy(true))}>{t("scouting.observe")}</button>}
        {r.club?.id !== d.mine && <button type="button" className="secundario" onClick={() => setBid(r)}>{t("bid.make")}</button>}
      </span>
    ),
  };
  return (
    <div className="cartoes">
      <Card title={t("city.talent.unsigned", { n: d.unsigned.length })} wide>
        {d.unsigned.length === 0 ? <p className="vazio">{t("city.talent.noUnsigned")}</p> : (
          <Table id="talento-sem-clube" columns={columns(false)} lines={d.unsigned} rowKey={(r) => r.id} initialOrder={{ column: "stars", direction: "desc" }} cell={cell} />
        )}
      </Card>
      <Card title={t("city.talent.atClubs", { n: d.atClubs.length })} wide>
        {d.atClubs.length === 0 ? <p className="vazio">{t("city.talent.noneAtClubs")}</p> : (
          <Table id="talento-em-clubes" columns={columns(true)} lines={d.atClubs} rowKey={(r) => r.id} initialOrder={{ column: "age", direction: "asc" }} cell={cell} />
        )}
      </Card>
      {busy && scouting && <BusyDialog capacity={scouting.capacity} running={scouting.orders.filter((o) => !o.done).length} onClose={() => setBusy(false)} />}
      {observe && scouting && <ObserveDialog row={observe} data={scouting} onClose={() => setObserve(undefined)} onDone={load} />}
      {bid && <BidDialog person={bid.id} name={bid.name} onClose={() => { setBid(undefined); load(); }} />}
    </div>
  );
}
