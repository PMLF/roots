"use client";
import { useState } from "react";
import type { CompetitionPage } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition, rankPosition } from "@/ui/i18n/position";
import type { Column } from "@/ui/table/logic";

type Player = CompetitionPage["players"][number];
type TeamRow = CompetitionPage["table"][number];

const METRICS = {
  goals: (p: Player) => p.goals,
  assists: (p: Player) => p.assists,
  rating: (p: Player) => p.rating ?? 0,
  games: (p: Player) => p.games,
  minutes: (p: Player) => p.minutes,
  yellow: (p: Player) => p.yellow,
  red: (p: Player) => p.red,
} as const;
type Metric = keyof typeof METRICS;

/** Separador Estatísticas de uma competição: top 10 de jogadores numa métrica à escolha e a tabela completa das equipas. */
export function Statistics({ page }: { page: CompetitionPage }) {
  const { t, locale } = useT();
  const [metric, setMetric] = useState<Metric>("goals");
  const dec = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const perGame = (v: number, matches: number) => (matches > 0 ? v / matches : 0);
  const value = METRICS[metric];
  const shown = (p: Player) => (metric === "rating" ? dec.format(value(p)) : String(value(p)));
  const top = [...page.players].filter((p) => value(p) > 0).sort((a, b) => value(b) - value(a) || b.goals - a.goals || a.name.localeCompare(b.name)).slice(0, 10);

  const teams: Column<TeamRow>[] = [
    { id: "club", title: t("lab.col.club"), value: (r) => r.name },
    { id: "played", title: t("lab.col.matches"), value: (r) => r.played, numeric: true },
    { id: "won", title: t("lab.col.wins"), value: (r) => r.won, numeric: true },
    { id: "drawn", title: t("lab.col.draws"), value: (r) => r.drawn, numeric: true },
    { id: "lost", title: t("lab.col.losses"), value: (r) => r.lost, numeric: true },
    { id: "gf", title: t("lab.col.gm"), value: (r) => r.goalsFor, numeric: true },
    { id: "ga", title: t("lab.col.gs"), value: (r) => r.goalsAgainst, numeric: true },
    { id: "gf-game", title: t("column.matchGoals"), value: (r) => perGame(r.goalsFor, r.played), numeric: true },
    { id: "ga-game", title: t("column.concededPerMatch"), value: (r) => perGame(r.goalsAgainst, r.played), numeric: true },
    { id: "gd", title: t("lab.col.diff"), value: (r) => r.goalDifference, numeric: true },
    { id: "points-game", title: t("column.pointsPerMatch"), value: (r) => perGame(r.points, r.played), numeric: true },
  ];
  const top10: Column<Player>[] = [
    { id: "rank", title: "#", value: () => 0 },
    { id: "player", title: t("column.player"), value: (p) => p.name },
    { id: "club", title: t("lab.col.club"), value: (p) => p.clubName },
    { id: "pos", title: t("column.position"), value: (p) => abbreviationPosition(t, p.position), sortValue: (p) => rankPosition(p.position) },
    { id: "age", title: t("column.age"), value: (p) => p.age, numeric: true },
    { id: "games", title: t("column.matches"), value: (p) => p.games, numeric: true },
    { id: "metric", title: t(`statistics.metric.${metric}` as Key), value: (p) => value(p), numeric: true },
  ];

  return (
    <div className="estatisticas">
      <Card title={t("statistics.top10")} wide>
        <div className="cartao-cabecalho">
          <label>
            <span className="so-leitor">{t("statistics.metric")}</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} aria-label={t("statistics.metric")}>
              {(Object.keys(METRICS) as Metric[]).map((m) => <option key={m} value={m}>{t(`statistics.metric.${m}` as Key)}</option>)}
            </select>
          </label>
        </div>
        {top.length === 0 ? (
          <p className="vazio">{t("highlights.noData")}</p>
        ) : (
          <Table
            id={`estatisticas-top10-${metric}`}
            columns={top10}
            lines={top}
            rowKey={(p) => p.player}
            cell={{
              rank: (p) => top.indexOf(p) + 1,
              player: (p) => <EntityLink k="person" id={p.player}>{p.name}</EntityLink>,
              club: (p) => <EntityLink k="club" id={p.club}>{p.clubName}</EntityLink>,
              metric: (p) => <b>{shown(p)}</b>,
            }}
          />
        )}
      </Card>
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
            "points-game": (r) => dec.format(perGame(r.points, r.played)),
          }}
          initialOrder={{ column: "gf", direction: "desc" }}
        />
      </Card>
    </div>
  );
}
