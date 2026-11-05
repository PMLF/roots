"use client";
import type { CompetitionPage } from "@/engine/api/contracts";
import { Card, Top } from "@/ui/components/Card";
import { Chip } from "@/ui/components/Attributes";
import { HighlightsPanel } from "@/ui/components/competition/Highlights";
import { Statistics } from "@/ui/components/competition/Statistics";
import { History } from "@/ui/components/competition/History";
import { Rounds } from "@/ui/components/competition/Rounds";
import { LeagueTable } from "@/ui/components/competition/LeagueTable";
import { Profile } from "@/ui/components/Profile";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Column } from "@/ui/table/logic";

type ClubRow = CompetitionPage["clubs"][number];

/** Página de uma liga (RZ-145): classificação e destaques logo à entrada, jornadas paginadas, clubes e história. */
export function CompetitionProfile({ d }: { d: CompetitionPage }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const tier = t(`tier.${d.tier}` as Key);

  const clubsColumns: Column<ClubRow>[] = [
    { id: "club", title: t("lab.col.club"), value: (c) => c.name },
    { id: "locality", title: t("column.locality"), value: (c) => c.locality },
    { id: "reputation", title: t("column.rep"), value: (c) => c.reputation, numeric: true },
    { id: "stadium", title: t("column.stadium"), value: (c) => c.capacity, numeric: true },
  ];

  const top = (
    <Top
      title={d.league}
      labels={<><Chip tone="destaque">{tier}</Chip>{d.district && <Chip tone="suave">{d.district}</Chip>}<Chip tone="suave">{t("competitions.clubs", { n: d.clubs.length })}</Chip><Chip tone="suave">{t("competition.round", { n: Math.max(1, d.currentRound) })}</Chip></>}
    />
  );

  const summary = (
    <div className="liga-pagina">
      {d.preview && <p className="aviso-previa">{t("competition.preview")}</p>}
      <HighlightsPanel h={d.highlights} />
      <div className="liga-topo">
        <Card title={t("tab.standings")}>
          <LeagueTable page={d} />
        </Card>
        <Rounds page={d} />
      </div>
    </div>
  );

  return (
    <Profile
      type="competition"
      title={d.league}
      top={top}
      tabs={{
        summary,
        statistics: <Statistics page={d} />,
        clubs: (
          <Table id="competicao-clubes" columns={clubsColumns} lines={d.clubs} rowKey={(c) => c.id} cell={{ club: (c) => <EntityLink k="club" id={c.id}>{c.name}</EntityLink>, reputation: (c) => t(`reputation.level.${c.reputationLevel}` as Key), stadium: (c) => n.format(c.capacity) }} initialOrder={{ column: "reputation", direction: "desc" }} />
        ),
        story: <History competition={d.league} />,
      }}
    />
  );
}
