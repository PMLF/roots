"use client";
import { useCallback, useEffect, useState } from "react";
import type { OwnStaff, StaffCandidate } from "@/engine/api/contracts";
import type { ViewPerson } from "@/engine/view/types";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Column } from "@/ui/table/logic";
import { useEngine } from "@/ui/EngineProvider";
import { useCountries } from "@/ui/useCountries";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";

const eur = (locale: string, n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const FUNCTIONS = ["assistant", "scout", "medical", "physio", "community"] as const;

/** Equipa técnica do clube do gamer (RZ-208): despedir quem lá está e contratar livres, com a qualidade estimada. */
export function StaffManager({ club }: { club: string }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const country = useCountries();
  const [roles, setRoles] = useState<ViewPerson[]>([]);
  const [own, setOwn] = useState<Map<string, OwnStaff>>(new Map());
  const [fn, setFn] = useState<(typeof FUNCTIONS)[number]>("assistant");
  const [candidates, setCandidates] = useState<StaffCandidate[] | undefined>(undefined);
  const [confirm, setConfirm] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const load = useCallback(() => {
    if (!engine) return;
    engine.call("clubProfile", { id: club }).then((p) => p && setRoles(p.roles)).catch(() => undefined);
    engine.call("ownStaff", {}).then((l) => setOwn(new Map(l.map((x) => [x.id, x])))).catch(() => undefined);
    engine.call("staffMarket", { fn }).then(setCandidates).catch(() => setCandidates([]));
  }, [engine, club, fn]);
  useEffect(() => { load(); }, [load]);

  const run = async (job: () => Promise<{ ok: boolean; reason?: string }>) => {
    setMessage(undefined);
    const r = await job();
    setConfirm(undefined);
    if (!r.ok) setMessage(t(`staff.reason.${r.reason}` as Key));
    load();
  };

  const columns: Column<ViewPerson>[] = [
    { id: "name", title: t("column.name"), value: (p) => p.sportingName },
    { id: "role", title: t("column.fn"), value: (p) => (p.fn ? t(`fn.${p.fn}` as Key) : "") },
    { id: "age", title: t("column.age"), value: (p) => p.age, numeric: true },
    { id: "country", title: t("column.country"), value: (p) => country(p.nationality) },
    { id: "quality", title: t("staff.quality"), value: (p) => own.get(p.id)?.quality ?? 0, numeric: true },
    { id: "wage", title: t("staff.wage"), value: (p) => own.get(p.id)?.wage ?? 0, numeric: true },
    { id: "trait", title: t("staff.trait"), value: (p) => own.get(p.id)?.trait ?? "" },
    { id: "act", title: "", value: () => "" },
  ];
  const candidateColumns: Column<StaffCandidate>[] = [
    { id: "name", title: t("column.name"), value: (c) => c.name },
    { id: "age", title: t("column.age"), value: (c) => c.age, numeric: true },
    { id: "country", title: t("column.country"), value: (c) => country(c.nationality) },
    { id: "estimate", title: t("staff.estimate"), value: (c) => c.estimate, numeric: true },
    { id: "act", title: "", value: () => "" },
  ];

  return (
    <div className="staff-gestao" data-testid="staff-gestao">
      <Table id="staff-meu" columns={columns} lines={roles} rowKey={(p) => p.id} cell={{
        name: (p) => <EntityLink k="person" id={p.id}>{p.sportingName}</EntityLink>,
        quality: (p) => own.has(p.id) ? own.get(p.id)!.quality : "",
        wage: (p) => own.has(p.id) ? `${eur(locale, own.get(p.id)!.wage)}/${t("person.month")}` : "",
        trait: (p) => { const x = own.get(p.id)?.trait; return x ? t(`staff.trait.${x}` as Key) : ""; },
        act: (p) => p.fn && p.fn !== "coach" && p.fn !== "president" ? (
          confirm === p.id ? (
            <>
              <span className="suave">{t("staff.severance", { value: eur(locale, own.get(p.id)?.severance ?? 0) })}</span>{" "}
              <button type="button" onClick={() => void run(() => engine!.call("dismissStaff", { person: p.id }))} data-testid="staff-despedir-sim">{t("saves.yes")}</button>
              <button type="button" onClick={() => setConfirm(undefined)}>{t("myClub.cancel")}</button>
            </>
          ) : <button type="button" onClick={() => setConfirm(p.id)} data-testid="staff-despedir">{t("staff.dismiss")}</button>
        ) : null,
      }} />
      <h3>{t("staff.hire")}</h3>
      <label>
        <span className="suave">{t("column.fn")}</span>{" "}
        <select value={fn} onChange={(e) => setFn(e.target.value as (typeof FUNCTIONS)[number])} data-testid="staff-funcao">
          {FUNCTIONS.map((f) => <option key={f} value={f}>{t(`fn.${f}` as Key)}</option>)}
        </select>
      </label>
      {message && <p className="erro" role="status">{message}</p>}
      {!candidates ? null : candidates.length === 0 ? <p className="vazio">{t("staff.none")}</p> : (
        <Table id="staff-mercado" columns={candidateColumns} lines={candidates} rowKey={(c) => c.id} cell={{
          name: (c) => <EntityLink k="person" id={c.id}>{c.name}</EntityLink>,
          estimate: (c) => <span title={t("staff.estimateHint")}>≈ {c.estimate}</span>,
          act: (c) => <button type="button" onClick={() => void run(() => engine!.call("hireStaff", { person: c.id }))} data-testid="staff-contratar">{t("staff.hireButton")}</button>,
        }} />
      )}
    </div>
  );
}
