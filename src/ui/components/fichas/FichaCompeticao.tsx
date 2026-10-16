"use client";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Card, Data, Top } from "@/ui/components/Cartao";
import { Chip } from "@/ui/components/Atributos";
import { HighlightsPanel } from "@/ui/components/competicao/Destaques";
import { Statistics } from "@/ui/components/competicao/Estatisticas";
import { Rounds } from "@/ui/components/competicao/Jornadas";
import { LeagueTable } from "@/ui/components/competicao/TabelaLiga";
import { Profile } from "@/ui/components/Ficha";
import { EntityLink } from "@/ui/components/Ligacao";
import { Table } from "@/ui/components/Tabela";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Column } from "@/ui/tabela/logica";

type ClubRow = CompetitionPage["clubs"][number];

/** Página de uma liga (RZ-145): classificação e destaques logo à entrada, jornadas paginadas, clubes e história. */
export function CompetitionProfile({ d }: { d: CompetitionPage }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const tier = t(`escalao.${d.tier}` as Key);

  const clubsColumns: Column<ClubRow>[] = [
    { id: "club", title: t("lab.col.clube"), value: (c) => c.name },
    { id: "locality", title: t("coluna.localidade"), value: (c) => c.locality },
    { id: "reputation", title: t("coluna.rep"), value: (c) => c.reputation, numeric: true },
    { id: "stadium", title: t("coluna.estadio"), value: (c) => c.capacity, numeric: true },
  ];

  const top = (
    <Top
      title={d.league}
      labels={<><Chip tone="destaque">{tier}</Chip>{d.district && <Chip tone="suave">{d.district}</Chip>}<Chip tone="suave">{t("competicoes.clubes", { n: d.clubs.length })}</Chip><Chip tone="suave">{t("competicao.jogos")}: {d.gamesPlayed}/{d.gamesTotal}</Chip></>}
    />
  );

  const summary = (
    <div className="liga-pagina">
      {d.preview && <p className="aviso-previa">{t("competicao.previa")}</p>}
      <HighlightsPanel h={d.highlights} />
      <div className="liga-topo">
        <Card title={t("separador.classificacao")}>
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
          <Table id="competicao-clubes" fileName={`clubs-${d.league}`} columns={clubsColumns} lines={d.clubs} rowKey={(c) => c.id} cell={{ club: (c) => <EntityLink k="club" id={c.id}>{c.name}</EntityLink>, stadium: (c) => n.format(c.capacity) }} initialOrder={{ column: "reputation", direction: "desc" }} />
        ),
        story: (
          <Card title={t("separador.historia")}>
            <Data lines={[]} />
            <p className="vazio">{t("competicao.semHistoria")}</p>
          </Card>
        ),
      }}
    />
  );
}
