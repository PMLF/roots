"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { PlanoVista } from "@/engine/api/contratos";
import { Ligacao } from "@/ui/components/Ligacao";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { ComClube } from "@/ui/components/ComClube";
import { EditorTatica } from "@/ui/components/EditorTatica";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMeuClube } from "@/ui/meuClube";
import { useMotor } from "@/ui/MotorProvider";
import { useTempo } from "@/ui/useTempo";

function Conteudo() {
  const { t } = useT();
  const motor = useMotor();
  const router = useRouter();
  const [meu] = useMeuClube();
  const tempo = useTempo();
  const [plano, setPlano] = useState<PlanoVista | null | undefined>(undefined);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("plano", null).then((p) => vivo && setPlano(p)).catch(() => vivo && setPlano(null));
    return () => { vivo = false; };
  }, [motor, tempo.estado?.hoje]);

  const jogo = plano?.proximoJogo;
  const hoje = tempo.estado?.hoje;
  // um jogo já a decorrer: não se prepara outra vez, retoma-se
  useEffect(() => { if (jogo?.emCurso && jogo.data === hoje) router.replace("/match/"); }, [jogo, hoje, router]);

  if (plano === undefined || !hoje) return <p>{t("ficha.aCarregar")}</p>;
  if (!jogo || jogo.data !== hoje) return <p className="vazio">{t("prematch.semJogo")} <Link href="/">{t("jogo.voltar")}</Link></p>;

  const eu = meu ? <AmostraClube id={meu} /> : null;
  const adv = <AmostraClube id={jogo.adversarioId} />;
  const advLink = <Ligacao k="clube" id={jogo.adversarioId} semAmostra>{jogo.adversario}</Ligacao>;
  const meuLink = meu ? <Ligacao k="clube" id={meu} semAmostra>{plano?.clubeNome ?? ""}</Ligacao> : (plano?.clubeNome ?? "");
  return (
    <section className="prematch">
      <header className="prematch-cabecalho">
        <div>
          <p className="prematch-confronto">
            {jogo.emCasa ? <>{eu}{meuLink}</> : <>{adv}{advLink}</>} <span className="suave">{t("inicio.vs")}</span> {jogo.emCasa ? <>{adv}{advLink}</> : <>{eu}{meuLink}</>}
          </p>
          <p className="suave"><Ligacao k="competicao" id={jogo.competicao}>{jogo.competicao}</Ligacao> · {jogo.data}</p>
        </div>
      </header>
      <p className="suave">{t("prematch.aviso")}</p>
      <EditorTatica semProximoJogo />
    </section>
  );
}

/** Ecrã pré-jogo (RZ-169): confirmar ou mudar a tática e o onze e só então começar o jogo. */
export default function PaginaPreJogo() {
  const { t } = useT();
  return <Suspense fallback={null}><ComClube titulo={t("prematch.titulo")}>{() => <Conteudo />}</ComClube></Suspense>;
}
