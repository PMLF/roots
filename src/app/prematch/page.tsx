"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { PlanoVista } from "@/engine/api/contratos";
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
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [aIniciar, setAIniciar] = useState(false);

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

  const ir = async () => {
    if (!motor || aIniciar) return;
    setAIniciar(true);
    try {
      await motor.chamar("iniciarJogo", { jogo: jogo.id });
      window.dispatchEvent(new Event("raizes:tempo"));
      router.push(`/match/?id=${encodeURIComponent(jogo.id)}&arrancar=1`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setAIniciar(false);
    }
  };
  const eu = meu ? <AmostraClube id={meu} /> : null;
  const adv = <AmostraClube id={jogo.adversarioId} />;
  return (
    <section className="prematch">
      <header className="prematch-cabecalho">
        <div>
          <p className="prematch-confronto">
            {jogo.emCasa ? <>{eu}{plano?.clubeNome ?? ""}</> : <>{adv}{jogo.adversario}</>} <span className="suave">{t("inicio.vs")}</span> {jogo.emCasa ? <>{adv}{jogo.adversario}</> : <>{eu}{plano?.clubeNome ?? ""}</>}
          </p>
          <p className="suave">{jogo.competicao} · {jogo.data}</p>
        </div>
        <div className="prematch-acao">
          <button type="button" className="primario" onClick={() => void ir()} disabled={aIniciar} data-testid="prematch-ir">{t("prematch.ir")}</button>
          {erro && <p className="erro" role="alert">{erro}</p>}
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
