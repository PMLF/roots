"use client";
import { Suspense, useEffect, useState } from "react";
import type { FichaClubeDados } from "@/engine/api/contratos";
import { ComClube } from "@/ui/components/ComClube";
import { FichaClube } from "@/ui/components/fichas/FichaClube";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useVerTudo } from "@/ui/dev";
import { useMotor } from "@/ui/MotorProvider";

function Conteudo({ clube }: { clube: string }) {
  const motor = useMotor();
  const { t } = useT();
  const [verTudo] = useVerTudo();
  const [d, setD] = useState<FichaClubeDados | null | undefined>(undefined);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("fichaClube", { id: clube, verTudo }).then((r) => vivo && setD(r)).catch(() => vivo && setD(null));
    return () => { vivo = false; };
  }, [motor, clube, verTudo]);
  if (d === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (d === null) return <p className="erro">{t("ficha.naoEncontrada")}</p>;
  return <FichaClube d={d} verTudo={verTudo} soPlantel />;
}

/** Plantel (RZ-145): a tabela de jogadores do clube do gamer. */
export default function PaginaPlantel() {
  const { t } = useT();
  return <Suspense fallback={null}><ComClube titulo={t("menu.plantel")}>{(c) => <Conteudo clube={c} />}</ComClube></Suspense>;
}
