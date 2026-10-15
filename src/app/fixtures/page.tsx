"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Cartao } from "@/ui/components/Cartao";
import { ComClube } from "@/ui/components/ComClube";
import { Ligacao } from "@/ui/components/Ligacao";
import { Tabela } from "@/ui/components/Tabela";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";
import { jogosDoClube, type LinhaJogo as Linha } from "@/ui/jogosClube";
import type { Coluna } from "@/ui/tabela/logica";

function Conteudo({ clube }: { clube: string }) {
  const motor = useMotor();
  const { t } = useT();
  const [page, setPage] = useState<CompetitionPage | null | undefined>(undefined);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    (async () => {
      const c = await motor.chamar("fichaClube", { id: clube });
      const p = c ? await motor.chamar("competitionPage", { league: c.liga }) : null;
      if (vivo) setPage(p);
    })().catch(() => vivo && setPage(null));
    return () => { vivo = false; };
  }, [motor, clube]);
  const linhas = useMemo(() => (page ? jogosDoClube(page, clube) : []), [page, clube]);
  const colunas: Coluna<Linha>[] = [
    { id: "round", titulo: t("jogos.jornada"), valor: (l) => l.round, numerica: true },
    { id: "date", titulo: t("jogos.data"), valor: (l) => l.date },
    { id: "venue", titulo: t("jogos.local"), valor: (l) => (l.bye ? "" : l.home ? t("jogos.casa") : t("jogos.fora")) },
    { id: "opponent", titulo: t("jogos.adversario"), valor: (l) => (l.bye ? t("jogos.folga") : l.opponentName) },
    { id: "result", titulo: t("jogos.resultado"), valor: (l) => l.result },
  ];
  if (page === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (page === null) return <p className="erro">{t("ficha.naoEncontrada")}</p>;
  return (
    <>
      {page.preview && <p className="aviso-previa">{t("competicao.previa")}</p>}
      <Cartao titulo={<Ligacao k="competicao" id={page.league}>{page.league}</Ligacao>} larga>
        <Tabela
          id="jogos-clube" nomeFicheiro={`fixtures-${clube}`} colunas={colunas} linhas={linhas} chave={(l) => l.id}
          ordemInicial={{ coluna: "round", direcao: "asc" }}
          celula={{ opponent: (l) => (l.bye ? t("jogos.folga") : <Ligacao k="clube" id={l.opponent}>{l.opponentName}</Ligacao>), result: (l) => l.result || "—" }}
        />
      </Cartao>
    </>
  );
}

/** Jogos (RZ-145): calendário e resultados do clube do gamer (relatório de um jogo chega com o ciclo de dias). */
export default function PaginaJogos() {
  const { t } = useT();
  return <Suspense fallback={null}><ComClube titulo={t("menu.jogos")}>{(c) => <Conteudo clube={c} />}</ComClube></Suspense>;
}
