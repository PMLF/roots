"use client";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Card } from "@/ui/components/Cartao";
import { PlayersList } from "@/ui/components/competicao/Destaques";
import { EntityLink } from "@/ui/components/Ligacao";
import { Table } from "@/ui/components/Tabela";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/posicao";
import type { Column } from "@/ui/tabela/logica";

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
    { id: "club", title: t("lab.col.clube"), value: (r) => r.name },
    { id: "played", title: t("lab.col.jogos"), value: (r) => r.played, numeric: true },
    { id: "gf", title: t("lab.col.gm"), value: (r) => r.goalsFor, numeric: true },
    { id: "ga", title: t("lab.col.gs"), value: (r) => r.goalsAgainst, numeric: true },
    { id: "gf-game", title: t("coluna.golosJogo"), value: (r) => perGame(r.goalsFor, r.played), numeric: true },
    { id: "ga-game", title: t("coluna.sofridosJogo"), value: (r) => perGame(r.goalsAgainst, r.played), numeric: true },
    { id: "gd", title: t("lab.col.dif"), value: (r) => r.goalDifference, numeric: true },
  ];
  const players: Column<Player>[] = [
    { id: "player", title: t("coluna.jogador"), value: (p) => p.name },
    { id: "club", title: t("lab.col.clube"), value: (p) => p.clubName },
    { id: "pos", title: t("coluna.posicao"), value: (p) => abbreviationPosition(t, p.position) },
    { id: "age", title: t("coluna.idade"), value: (p) => p.age, numeric: true },
    { id: "games", title: t("coluna.jogos"), value: (p) => p.games, numeric: true },
    { id: "minutes", title: t("coluna.minutos"), value: (p) => p.minutes, numeric: true },
    { id: "goals", title: t("coluna.golos"), value: (p) => p.goals, numeric: true },
    { id: "assists", title: t("coluna.assistencias"), value: (p) => p.assists, numeric: true },
    { id: "rating", title: t("coluna.nota"), value: (p) => p.rating ?? "", numeric: true },
    { id: "yellow", title: t("coluna.amarelos"), value: (p) => p.yellow, numeric: true },
    { id: "red", title: t("coluna.vermelhos"), value: (p) => p.red, numeric: true },
  ];

  return (
    <div className="estatisticas">
      <div className="estatisticas-tops">
        {([
          ["destaques.marcadores", h.topScorers, undefined],
          ["destaques.assistentes", h.topAssists, undefined],
          ["destaques.melhoresJogadores", h.bestRated, rating],
          ["destaques.amarelos", h.mostYellow, undefined],
          ["destaques.vermelhos", h.mostRed, undefined],
        ] as const).map(([rowKey, items, fmt]) => (
          <Card key={rowKey}>
            <PlayersList title={t(rowKey as Key)} items={[...items]} {...(fmt ? { fmt } : {})} />
          </Card>
        ))}
      </div>
      <Card title={t("estatisticas.equipas")} wide>
        <Table
          id="estatisticas-equipas"
          fileName={`teams-${page.league}`}
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
      <Card title={t("estatisticas.jogadores")} wide>
        {page.players.length === 0 ? (
          <p className="vazio">{t("destaques.semDados")}</p>
        ) : (
          <Table
            id="estatisticas-jogadores"
            fileName={`players-${page.league}`}
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
