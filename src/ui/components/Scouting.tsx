"use client";
import { useCallback, useEffect, useState } from "react";
import type { ScoutRow, ScoutingData } from "@/engine/api/contracts";
import { POSITIONS } from "@/engine/world/types";
import { Card, Data } from "@/ui/components/Card";
import { Icon } from "@/ui/components/Icon";
import { BusyDialog, ObserveDialog, RequestDialog } from "@/ui/components/ScoutDialogs";
import { BidDialog } from "@/ui/components/BidDialog";
import { Flag } from "@/ui/components/Flag";
import { EntityLink } from "@/ui/components/Link";
import { Stars } from "@/ui/components/Stars";
import { Table } from "@/ui/components/Table";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition, namePosition } from "@/ui/i18n/position";
import type { Column } from "@/ui/table/logic";

type Origin = "all" | "domestic" | "foreign" | "free";

export function Scouting() {
  const { t, locale } = useT();
  const engine = useEngine();
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
  const [d, setD] = useState<ScoutingData | undefined>(undefined);
  const [pos, setPos] = useState("");
  const [origin, setOrigin] = useState<Origin>("all");
  const [onlyKnown, setOnlyKnown] = useState(false);
  const [target, setTarget] = useState<ScoutRow | undefined>(undefined);
  const [showBusy, setShowBusy] = useState(false);
  const [bidTarget, setBidTarget] = useState<ScoutRow | undefined>(undefined);
  const [showRequest, setShowRequest] = useState(false);
  const load = useCallback(() => { engine?.call("scouting", null).then(setD); }, [engine]);
  useEffect(load, [load]);
  if (!d) return <p>{t("profile.loading")}</p>;

  const rows = d.rows.filter((r) =>
    (!pos || r.position === pos) &&
    (origin === "all" || (origin === "free" ? !r.club : origin === "foreign" ? r.club?.foreign === true : r.club !== undefined && !r.club.foreign)) &&
    (!onlyKnown || r.knowledge !== "none"));
  const free = d.orders.filter((o) => !o.done).length < d.capacity;

  const columns: Column<ScoutRow>[] = [
    { id: "name", title: t("column.name"), value: (r) => r.name },
    { id: "age", title: t("column.age"), value: (r) => r.age, numeric: true },
    { id: "pos", title: t("column.position"), value: (r) => r.position },
    { id: "country", title: t("column.country"), value: (r) => r.nationality },
    { id: "club", title: t("column.club"), value: (r) => r.club?.name ?? t("state.free") },
    { id: "stars", title: t("column.level"), value: (r) => r.rating?.stars ?? 0, numeric: true },
    { id: "potential", title: t("column.potential"), value: (r) => r.rating?.potential?.high ?? 0, numeric: true },
    { id: "contract", title: t("person.contractUntil"), value: (r) => r.contractEnd ?? "" },
    { id: "action", title: "", value: () => "" },
  ];
  const toolbar = (
    <>
      <label className="vista-plantel"><span className="so-leitor">{t("column.position")}</span>
        <select value={pos} onChange={(e) => setPos(e.target.value)} aria-label={t("column.position")}>
          <option value="">{t("scouting.allPositions")}</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{namePosition(t, p)}</option>)}
        </select>
      </label>
      <label className="vista-plantel"><span className="so-leitor">{t("scouting.origin")}</span>
        <select value={origin} onChange={(e) => setOrigin(e.target.value as Origin)} aria-label={t("scouting.origin")}>
          {(["all", "domestic", "foreign", "free"] as const).map((o) => <option key={o} value={o}>{t(`scouting.origin.${o}` as Key)}</option>)}
        </select>
      </label>
      <label><input type="checkbox" checked={onlyKnown} onChange={(e) => setOnlyKnown(e.target.checked)} /> {t("scouting.onlyObserved")}</label>
    </>
  );

  return (
    <div className="cartoes">
      <Card title={t("scouting.scouts")} wide>
        <div className="cartao-cabecalho">
          {d.scoutList.length === 0 ? <p className="suave">{t("scouting.noScouts")}</p> : (
            <ul className="lista-olheiros">
              {d.scoutList.map((sc) => <li key={sc.id}><Icon name="person" /> <EntityLink k="person" id={sc.id}>{sc.name}</EntityLink></li>)}
            </ul>
          )}
          <button type="button" className="primario" onClick={() => (free ? setShowRequest(true) : setShowBusy(true))}>{t("scouting.request")}</button>
        </div>
        <Data lines={[
          { label: t("scouting.transferBudget"), value: money.format(d.budget.transfers) },
          { label: t("scouting.wageMargin"), value: money.format(d.budget.wageMargin) },
        ]} />
        {d.orders.length > 0 && (
          <>
            <h3>{t("scouting.ordersTitle")}</h3>
            <ul className="lista-simples">
              {d.orders.map((o) => (
                <li key={o.id}>
                  <b>{t(`scouting.kind.${o.kind}` as Key)}</b>
                  <span className="suave"> · {o.person ? <EntityLink k="person" id={o.person.id}>{o.person.name}</EntityLink> : namePosition(t, o.position ?? "")} · {o.done ? (o.results !== undefined ? t("scouting.found", { n: o.results }) : t("scouting.done")) : t("scouting.until", { date: o.end })}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card title={t("scouting.players", { n: rows.length })} wide>
        <Table
          id="scouting" columns={columns} lines={rows} rowKey={(r) => r.id} toolbar={toolbar} initialOrder={{ column: "stars", direction: "desc" }}
          cell={{
            name: (r) => <><EntityLink k="person" id={r.id}>{r.name}</EntityLink>{r.found && <small className="suave"> · {t("scouting.fromSearch")}</small>}</>,
            pos: (r) => <abbr title={namePosition(t, r.position)}>{abbreviationPosition(t, r.position)}</abbr>,
            country: (r) => <Flag id={r.nationality} />,
            club: (r) => (r.club ? (r.club.foreign ? r.club.name : <EntityLink k="club" id={r.club.id}>{r.club.name}</EntityLink>) : <span className="suave">{t("state.free")}</span>),
            stars: (r) => (r.rating ? <Stars value={r.rating.stars} /> : <span className="suave">?</span>),
            potential: (r) => (r.rating?.potential ? <Stars range={r.rating.potential} /> : <span className="suave">?</span>),
            contract: (r) => r.contractEnd ?? "—",
            action: (r) => (
              <span className="acoes-linha">
                {r.busy ? <span className="suave">{t("scouting.observing")}</span> : <button type="button" className="secundario" disabled={r.knowledge === "month"} onClick={() => (free ? setTarget(r) : setShowBusy(true))}>{t("scouting.observe")}</button>}
                <button type="button" className="secundario" onClick={() => setBidTarget(r)}>{t("bid.make")}</button>
              </span>
            ),
          }}
        />
      </Card>
      {showRequest && <RequestDialog data={d} onClose={() => setShowRequest(false)} onDone={load} />}
      {showBusy && <BusyDialog capacity={d.capacity} running={d.orders.filter((o) => !o.done).length} onClose={() => setShowBusy(false)} />}
      {bidTarget && <BidDialog person={bidTarget.id} name={bidTarget.name} onClose={() => { setBidTarget(undefined); load(); }} />}
      {target && <ObserveDialog row={target} data={d} onClose={() => setTarget(undefined)} onDone={load} />}
    </div>
  );
}
