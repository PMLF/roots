"use client";
import type { CompetitionPage } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { PlayersList } from "@/ui/components/competition/Highlights";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition, rankPosition } from "@/ui/i18n/position";
import type { Column } from "@/ui/table/logic";

type Player = CompetitionPage["players"][number];
type TeamRow = CompetitionPage["table"][number];

/** Separador Estatísticas de uma competição: top 10 de cada lista, todas as equipas e todos os jogadores, ordenáveis. */
export function Statistics({ page }: { page: CompetitionPage }) {
  const { t, locale } = useT();
  const h = page.highlights;
  const rating = (v: number) => v.toFixed(2);
  const dec = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const perGame = (v: number, matches: number) => (matches > 0 ? v / matches : 0);

  const teams: Column<TeamRow>[] = [
    { id: "club", title: t("lab.col.club"), value: (r) => r.name },
    { id: "played", title: t("lab.col.matches"), value: (r) => r.played, numeric: true },
    { id: "gf", title: t("lab.col.gm"), value: (r) => r.goalsFor, numeric: true },
    { id: "ga", title: t("lab.col.gs"), value: (r) => r.goalsAgainst, numeric: true },
    { id: "gf-game", title: t("column.matchGoals"), value: (r) => perGame(r.goalsFor, r.played), numeric: true },
    { id: "ga-game", title: t("column.concededPerMatch"), value: (r) => perGame(r.goalsAgainst, r.played), numeric: true },
    { id: "gd", title: t("lab.col.diff"), value: (r) => r.goalDifference, numeric: true },
  ];
  const players: Column<Player>[] = [
    { id: "player", title: t("column.player"), value: (p) => p.name },
    { id: "club", title: t("lab.col.club"), value: (p) => p.clubName },
    { id: "pos", title: t("column.position"), value: (p) => abbreviationPosition(t, p.position), sortValue: (p) => rankPosition(p.position) },
    { id: "age", title: t("column.age"), value: (p) => p.age, numeric: true },
    { id: "games", title: t("column.matches"), value: (p) => p.games, numeric: true },
    { id: "minutes", title: t("column.minutes"), value: (p) => p.minutes, numeric: true },
    { id: "goals", title: t("column.goals"), value: (p) => p.goals, numeric: true },
    { id: "assists", title: t("column.assists"), value: (p) => p.assists, numeric: true },
    { id: "rating", title: t("column.rating"), value: (p) => p.rating ?? "", numeric: true },
    { id: "yellow", title: t("column.yellows"), value: (p) => p.yellow, numeric: true },
    { id: "red", title: t("column.reds"), value: (p) => p.red, numeric: true },
  ];

  return (
    <div className="estatisticas">
      <div className="estatisticas-tops">
        {([
          ["highlights.scorers", h.topScorers, undefined],
          ["highlights.assistants", h.topAssists, undefined],
          ["highlights.bestPlayers", h.bestRated, rating],
          ["highlights.yellows", h.mostYellow, undefined],
          ["highlights.reds", h.mostRed, undefined],
        ] as const).map(([rowKey, items, fmt]) => (
          <Card key={rowKey}>
            <PlayersList title={t(rowKey as Key)} items={[...items]} {...(fmt ? { fmt } : {})} />
          </Card>
        ))}
      </div>
      <Card title={t("statistics.teams")} wide>
        <Table
          id="estatisticas-equipas"
         
          columns={teams}
          lines={page.table}
          rowKey={(r) => r.club}
          cell={{
            club: (r) => <EntityLink k="club" id={r.club}>{r.name}</EntityLink>,
            "gf-game": (r) => dec.format(perGame(r.goalsFor, r.played)),
            "ga-game": (r) => dec.format(perGame(r.goalsAgainst, r.played)),
          }}
          initialOrder={{ column: "gf", direction: "desc" }}
        />
      </Card>
      <Card title={t("statistics.players")} wide>
        {page.players.length === 0 ? (
          <p className="vazio">{t("highlights.noData")}</p>
        ) : (
          <Table
            id="estatisticas-jogadores"
           
            columns={players}
            lines={page.players}
            rowKey={(p) => p.player}
            cell={{
              player: (p) => <EntityLink k="person" id={p.player}>{p.name}</EntityLink>,
              club: (p) => <EntityLink k="club" id={p.club}>{p.clubName}</EntityLink>,
              rating: (p) => (p.rating !== undefined ? rating(p.rating) : "—"),
            }}
            initialOrder={{ column: "goals", direction: "desc" }}
          />
        )}
      </Card>
    </div>
  );
}
