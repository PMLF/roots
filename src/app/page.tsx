"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ResumoMundoCriado } from "@/engine/api/contratos";
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

  return (
    <section>
      <h1>{t("hoje.titulo")}</h1>
      {mundo === null && (
        <p data-testid="hoje-sem-mundo">
          {t("hoje.semMundo")} <Link href="/mundo/">{t("hoje.criarMundo")}</Link>
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
