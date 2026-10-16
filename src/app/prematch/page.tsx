"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ViewPlan } from "@/engine/api/contratos";
import { EntityLink } from "@/ui/components/Ligacao";
import { ClubSwatch } from "@/ui/components/AmostraClube";
import { WithClub } from "@/ui/components/ComClube";
import { TacticEditor } from "@/ui/components/EditorTatica";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useOwnClub } from "@/ui/meuClube";
import { useEngine } from "@/ui/MotorProvider";
import { useTime } from "@/ui/useTempo";

function Content() {
  const { t } = useT();
  const engine = useEngine();
  const router = useRouter();
  const [mine] = useOwnClub();
  const time = useTime();
  const [plan, setPlan] = useState<ViewPlan | null | undefined>(undefined);

  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("plan", null).then((p) => live && setPlan(p)).catch(() => live && setPlan(null));
    return () => { live = false; };
  }, [engine, time.state?.today]);

  const match = plan?.nextMatch;
  const today = time.state?.today;
  // um jogo já a decorrer: não se prepara outra vez, retoma-se
  useEffect(() => { if (match?.ongoing && match.date === today) router.replace("/match/"); }, [match, today, router]);

  if (plan === undefined || !today) return <p>{t("ficha.aCarregar")}</p>;
  if (!match || match.date !== today) return <p className="vazio">{t("prematch.semJogo")} <Link href="/">{t("jogo.voltar")}</Link></p>;

  const eu = mine ? <ClubSwatch id={mine} /> : null;
  const opp = <ClubSwatch id={match.opponentId} />;
  const linkOpp = <EntityLink k="club" id={match.opponentId} withoutSwatch>{match.opponent}</EntityLink>;
  const ownLink = mine ? <EntityLink k="club" id={mine} withoutSwatch>{plan?.clubName ?? ""}</EntityLink> : (plan?.clubName ?? "");
  return (
    <section className="prematch">
      <header className="prematch-cabecalho">
        <div>
          <p className="prematch-confronto">
            {match.atHome ? <>{eu}{ownLink}</> : <>{opp}{linkOpp}</>} <span className="suave">{t("inicio.vs")}</span> {match.atHome ? <>{opp}{linkOpp}</> : <>{eu}{ownLink}</>}
          </p>
          <p className="suave"><EntityLink k="competition" id={match.competition}>{match.competition}</EntityLink> · {match.date}</p>
        </div>
      </header>
      <p className="suave">{t("prematch.aviso")}</p>
      <TacticEditor withoutNextMatch />
    </section>
  );
}

/** Ecrã pré-jogo (RZ-169): confirmar ou mudar a tática e o onze e só então começar o jogo. */
export default function PrematchPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("prematch.titulo")}>{() => <Content />}</WithClub></Suspense>;
}
