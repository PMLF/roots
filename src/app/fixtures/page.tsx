"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Card } from "@/ui/components/Cartao";
import { WithClub } from "@/ui/components/ComClube";
import { EntityLink } from "@/ui/components/Ligacao";
import { Table } from "@/ui/components/Tabela";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/MotorProvider";
import { clubMatches, type MatchLine as Line } from "@/ui/jogosClube";
import type { Column } from "@/ui/tabela/logica";

function Content({ club }: { club: string }) {
  const engine = useEngine();
  const { t } = useT();
  const [page, setPage] = useState<CompetitionPage | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    (async () => {
      const c = await engine.call("clubProfile", { id: club });
      const p = c ? await engine.call("competitionPage", { league: c.league }) : null;
      if (live) setPage(p);
    })().catch(() => live && setPage(null));
    return () => { live = false; };
  }, [engine, club]);
  const lines = useMemo(() => (page ? clubMatches(page, club) : []), [page, club]);
  const columns: Column<Line>[] = [
    { id: "round", title: t("jogos.jornada"), value: (l) => l.round, numeric: true },
    { id: "date", title: t("jogos.data"), value: (l) => l.date },
    { id: "venue", title: t("jogos.local"), value: (l) => (l.bye ? "" : l.home ? t("jogos.casa") : t("jogos.fora")) },
    { id: "opponent", title: t("jogos.adversario"), value: (l) => (l.bye ? t("jogos.folga") : l.opponentName) },
    { id: "result", title: t("jogos.resultado"), value: (l) => l.result },
  ];
  if (page === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (page === null) return <p className="erro">{t("ficha.naoEncontrada")}</p>;
  return (
    <>
      {page.preview && <p className="aviso-previa">{t("competicao.previa")}</p>}
      <Card title={<EntityLink k="competition" id={page.league}>{page.league}</EntityLink>} wide>
        <Table
          id="jogos-clube" fileName={`fixtures-${club}`} columns={columns} lines={lines} rowKey={(l) => l.id}
          initialOrder={{ column: "round", direction: "asc" }}
          cell={{ opponent: (l) => (l.bye ? t("jogos.folga") : <EntityLink k="club" id={l.opponent}>{l.opponentName}</EntityLink>), result: (l) => l.result || "—" }}
        />
      </Card>
    </>
  );
}

/** Jogos (RZ-145): calendário e resultados do clube do gamer (relatório de um jogo chega com o ciclo de dias). */
export default function MatchesPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("menu.jogos")}>{(c) => <Content club={c} />}</WithClub></Suspense>;
}
