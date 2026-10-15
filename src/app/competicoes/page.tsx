"use client";
import { useEffect, useState } from "react";
import type { CompeticaoResumo } from "@/engine/api/contratos";
import { Cartao } from "@/ui/components/Cartao";
import { Ligacao } from "@/ui/components/Ligacao";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

const ORDEM = ["primeiraLiga", "segundaLiga", "terceiraLiga", "cp", "distrital"] as const;

/** Lista das ligas e séries do mundo por escalão (RZ-145); cada uma abre a sua ficha. */
export default function PaginaCompeticoes() {
  const { t } = useT();
  const motor = useMotor();
  const [lista, setLista] = useState<CompeticaoResumo[] | null | undefined>(undefined);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("competicoes", null) : null)).then((c) => vivo && setLista(c)).catch(() => vivo && setLista(null));
    return () => { vivo = false; };
  }, [motor]);

  return (
    <section>
      <h1>{t("competicoes.titulo")}</h1>
      <p className="suave">{t("competicoes.intro")}</p>
      {lista === null && <p className="vazio">{t("hoje.semMundo")}</p>}
      {lista && (
        <div className="cartoes">
          {ORDEM.map((e) => {
            const ligas = lista.filter((c) => c.escalao === e);
            if (ligas.length === 0) return null;
            return (
              <Cartao key={e} titulo={t(`escalao.${e}` as Chave)} larga={e === "distrital"}>
                <ul className={e === "distrital" ? "ligacoes colunas" : "ligacoes"}>
                  {ligas.map((c) => (
                    <li key={c.liga}>
                      <Ligacao k="competicao" id={c.liga}>{c.liga}</Ligacao> <span className="suave">· {t("competicoes.clubes", { n: c.clubes })}</span>
                    </li>
                  ))}
                </ul>
              </Cartao>
            );
          })}
        </div>
      )}
    </section>
  );
}
