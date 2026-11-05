"use client";
import type { EuropeView } from "@/engine/api/contracts";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Key } from "@/ui/i18n";
import { useOwnClub } from "@/ui/myClub";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Column } from "@/ui/table/logic";

type Row = EuropeView["table"][number] & { position: number };

/** Tabela única da fase de liga: oitavos diretos, play-off e eliminados com cores. `compact` reduz as colunas (cartões). */
export function EuropeTable({ view, compact = false }: { view: EuropeView; compact?: boolean }) {
  const { t } = useT();
  const [mine] = useOwnClub();
  const lines: Row[] = view.table.map((r, i) => ({ ...r, position: i + 1 }));
  const all: Column<Row>[] = [
    { id: "pos", title: t("lab.col.pos"), value: (l) => l.position, numeric: true },
    { id: "club", title: t("lab.col.club"), value: (l) => l.name },
    { id: "played", title: t("lab.col.matches"), value: (l) => l.played, numeric: true },
    { id: "won", title: t("lab.col.v"), value: (l) => l.won, numeric: true },
    { id: "drawn", title: t("lab.col.e"), value: (l) => l.drawn, numeric: true },
    { id: "lost", title: t("lab.col.d"), value: (l) => l.lost, numeric: true },
    { id: "gf", title: t("lab.col.gm"), value: (l) => l.goalsFor, numeric: true },
    { id: "ga", title: t("lab.col.gs"), value: (l) => l.goalsAgainst, numeric: true },
    { id: "gd", title: t("lab.col.diff"), value: (l) => l.goalsFor - l.goalsAgainst, numeric: true },
    { id: "pts", title: t("lab.col.pts"), value: (l) => l.points, numeric: true },
  ];
  const columns = compact ? all.filter((c) => ["pos", "club", "played", "gd", "pts"].includes(c.id)) : all;
  return (
    <>
      <Table
        id={compact ? "europa-compacta" : "europa"}
        simple
        columns={columns}
        lines={lines}
        rowKey={(l) => l.club}
        cell={{ club: (l) => <EntityLink k="club" id={l.club}>{l.name}</EntityLink> }}
        initialOrder={{ column: "pos", direction: "asc" }}
        lineClass={(l) => [`zona zona-${l.zone}`, l.club === mine ? "meu-clube" : ""].filter(Boolean).join(" ")}
      />
      <ul className="legenda-zonas">
        {(["direct", "playoff", "out"] as const).map((z) => (
          <li key={z}><span className={`zona-amostra zona-${z}`} aria-hidden="true" /> {t(`zone.${z}` as Key)}</li>
        ))}
      </ul>
    </>
  );
}
