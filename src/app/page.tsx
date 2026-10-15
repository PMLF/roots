"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CompetitionPage, FichaClubeDados, ResumoMundoCriado } from "@/engine/api/contratos";
import { jogosDoClube } from "@/ui/jogosClube";
import { Ligacao } from "@/ui/components/Ligacao";
import { useMeuClube } from "@/ui/meuClube";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

/** Página «Hoje» (TOM_E_UX §3.8): o que mudou, o que exige decisão, o que vem a seguir. */
export default function Hoje() {
  const { t } = useT();
  const motor = useMotor();
  const [mundo, setMundo] = useState<ResumoMundoCriado | null | undefined>(undefined);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("estadoMundo", null).then((m) => vivo && setMundo(m)).catch(() => vivo && setMundo(null));
    return () => { vivo = false; };
  }, [motor]);

  const [meu] = useMeuClube();
  const [clube, setClube] = useState<{ ficha: FichaClubeDados; liga: CompetitionPage } | undefined>(undefined);
  useEffect(() => {
    if (!motor || !meu || !mundo) { setClube(undefined); return; }
    let vivo = true;
    (async () => {
      const ficha = await motor.chamar("fichaClube", { id: meu });
      const liga = ficha ? await motor.chamar("competitionPage", { league: ficha.liga }) : null;
      if (vivo) setClube(ficha && liga ? { ficha, liga } : undefined);
    })().catch(() => vivo && setClube(undefined));
    return () => { vivo = false; };
  }, [motor, meu, mundo]);
  const proximo = clube ? jogosDoClube(clube.liga, clube.ficha.id).find((j) => !j.bye && j.result === "") : undefined;
  const posicao = clube?.liga.table.find((r) => r.club === clube.ficha.id)?.position;

  return (
    <section>
      <h1>{t("hoje.titulo")}</h1>
      {mundo && (
        <p>
          {clube ? (
            <>
              <b>{t("hoje.oTeuClube")}:</b> <Ligacao k="clube" id={clube.ficha.id}>{clube.ficha.nome}</Ligacao>
              {posicao !== undefined && <span className="suave"> · {t("hoje.posicao", { pos: posicao, liga: clube.ficha.liga })}</span>}
              {proximo && <span className="suave"> · {t("hoje.proximo", { jogo: `${proximo.home ? "" : "@ "}${proximo.opponentName}` })}</span>}
            </>
          ) : (
            <Link href="/club/">{t("hoje.escolherClube")}</Link>
          )}
        </p>
      )}
      {mundo === null && (
        <p data-testid="hoje-sem-mundo">
          {t("hoje.semMundo")} <Link href="/world/">{t("hoje.criarMundo")}</Link>
        </p>
      )}
      {mundo && <p className="suave" data-testid="hoje-mundo">{t("hoje.mundo", { seed: mundo.seed, pessoas: mundo.pessoas })}</p>}
      <div className="hoje-grelha">
        <section className="painel" aria-labelledby="h-mudou">
          <h2 id="h-mudou">{t("hoje.mudou")}</h2>
          <p className="vazio">{t("hoje.mudouVazio")}</p>
        </section>
        <section className="painel" aria-labelledby="h-decisao">
          <h2 id="h-decisao">{t("hoje.decisao")}</h2>
          <p className="vazio">{t("hoje.decisaoVazio")}</p>
        </section>
        <section className="painel" aria-labelledby="h-seguir">
          <h2 id="h-seguir">{t("hoje.seguir")}</h2>
          <p className="vazio">{t("hoje.seguirVazio")}</p>
          <p><button type="button" disabled title={t("menu.brevemente")}>{t("hoje.avancar")}</button></p>
        </section>
      </div>
    </section>
  );
}
