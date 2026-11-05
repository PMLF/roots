"use client";
import type { HistoryRow } from "@/engine/api/contracts";
import { seasonName } from "@/engine/calendar/seasonName";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Column } from "@/ui/table/logic";

const isSeasonal = (r: HistoryRow) => r.profession === "player" || r.profession === "goalkeeper" || r.profession === "staff";
const place = (r: HistoryRow) => ("club" in r ? r.club : "place" in r ? r.place : undefined);

/**
 * Tabela «História» (RZ-229): uma só tabela com a coluna «Profissão». As colunas dependem das profissões que a pessoa teve;
 * «Ano» (autarca, empresário) e «Época» (jogador, pessoal de clube) fundem-se em «Ano/Época»; «Clube» e «Localidade» em «Clube/Localidade».
 */
export function PersonHistoryTable({ rows, initialYear }: { rows: HistoryRow[]; initialYear: number }) {
  const { t, locale } = useT();
  const has = (...p: HistoryRow["profession"][]) => rows.some((r) => p.includes(r.profession));
  const seasonal = rows.some(isSeasonal);
  const yearly = rows.some((r) => !isSeasonal(r));
  const clubs = rows.some((r) => "club" in r);
  const places = rows.some((r) => "place" in r);
  const number = new Intl.NumberFormat(locale);
  const signed = new Intl.NumberFormat(locale, { signDisplay: "exceptZero" });
  const rating = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const professionName = (r: HistoryRow) => (r.profession === "staff" ? t(`fn.${r.fn}` as Key) : t(`profession.${r.profession}` as Key));
  const label = (r: HistoryRow) => (isSeasonal(r) ? seasonName(r.season, initialYear) : String(initialYear + r.season - 1));
  const columns: Column<HistoryRow>[] = [
    { id: "profession", title: t("history.profession"), value: professionName },
    { id: "when", title: t(seasonal && yearly ? "history.yearSeason" : yearly ? "history.year" : "column.season"), value: label, sortValue: (r) => r.season },
    ...(clubs || places ? [{ id: "place", title: t(clubs && places ? "history.clubLocality" : places ? "history.locality" : "column.club"), value: (r: HistoryRow) => place(r)?.name ?? "" }] : []),
    ...(has("player", "goalkeeper") ? [{ id: "matches", title: t("stat.matches"), value: (r: HistoryRow) => ("matches" in r ? r.matches : 0), numeric: true }] : []),
    ...(has("goalkeeper") ? [{ id: "cleanSheets", title: t("history.cleanSheets"), value: (r: HistoryRow) => ("cleanSheets" in r ? r.cleanSheets : 0), numeric: true }] : []),
    ...(has("player") ? [{ id: "goals", title: t("stat.goals"), value: (r: HistoryRow) => ("goals" in r ? r.goals : 0), numeric: true }] : []),
    ...(has("player", "goalkeeper") ? [
      { id: "assists", title: t("stat.assists"), value: (r: HistoryRow) => ("assists" in r ? r.assists : 0), numeric: true },
      { id: "rating", title: t("history.rating"), value: (r: HistoryRow) => ("avgRating" in r ? (r.avgRating ?? 0) : 0), numeric: true },
    ] : []),
    ...(has("mayor") ? [{ id: "population", title: t("history.populationChange"), value: (r: HistoryRow) => (r.profession === "mayor" ? (r.populationChange ?? 0) : 0), numeric: true }] : []),
    ...(has("businessperson") ? [
      { id: "company", title: t("history.company"), value: (r: HistoryRow) => (r.profession === "businessperson" ? r.company : "") },
      { id: "employees", title: t("history.employees"), value: (r: HistoryRow) => (r.profession === "businessperson" ? r.employees : 0), numeric: true },
      { id: "sponsored", title: t("history.sponsored"), value: (r: HistoryRow) => (r.profession === "businessperson" ? r.sponsored.map((s) => s.name).join(", ") : "") },
    ] : []),
    ...(has("staff") ? [
      { id: "wins", title: t("history.wins"), value: (r: HistoryRow) => (r.profession === "staff" ? r.wins : 0), numeric: true },
      { id: "draws", title: t("history.draws"), value: (r: HistoryRow) => (r.profession === "staff" ? r.draws : 0), numeric: true },
      { id: "losses", title: t("history.losses"), value: (r: HistoryRow) => (r.profession === "staff" ? r.losses : 0), numeric: true },
    ] : []),
  ];
  const dash = "—";
  return (
    <Table
      id="pessoa-historia" simple columns={columns} lines={rows} rowKey={(r) => `${r.profession}-${r.season}-${place(r)?.id ?? ""}-${"company" in r ? r.company : ""}`}
      initialOrder={{ column: "when", direction: "desc" }}
      cell={{
        place: (r) => { const p = place(r); return p ? <EntityLink k={p.k} id={p.id}>{p.name}</EntityLink> : dash; },
        matches: (r) => ("matches" in r ? r.matches : dash),
        cleanSheets: (r) => ("cleanSheets" in r && r.profession === "goalkeeper" ? r.cleanSheets : dash),
        goals: (r) => (r.profession === "player" ? r.goals : dash),
        assists: (r) => ("assists" in r ? r.assists : dash),
        rating: (r) => ("avgRating" in r && r.avgRating !== undefined ? rating.format(r.avgRating) : dash),
        population: (r) => (r.profession === "mayor" && r.populationChange !== undefined ? signed.format(r.populationChange) : dash),
        company: (r) => (r.profession === "businessperson" ? r.company : dash),
        employees: (r) => (r.profession === "businessperson" ? number.format(r.employees) : dash),
        sponsored: (r) => (r.profession === "businessperson" ? (r.sponsored.length > 0 ? r.sponsored.map((s, i) => <span key={s.id}>{i > 0 && ", "}<EntityLink k="club" id={s.id}>{s.name}</EntityLink></span>) : dash) : dash),
        wins: (r) => (r.profession === "staff" ? r.wins : dash),
        draws: (r) => (r.profession === "staff" ? r.draws : dash),
        losses: (r) => (r.profession === "staff" ? r.losses : dash),
      }}
    />
  );
}
