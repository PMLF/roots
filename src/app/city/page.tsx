"use client";
import { Suspense, useEffect, useState } from "react";
import type { FichaLocalidadeDados } from "@/engine/api/contratos";
import { ComClube } from "@/ui/components/ComClube";
import { FichaLocalidade } from "@/ui/components/fichas/FichaLocalidade";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

function Conteudo({ clube }: { clube: string }) {
  const motor = useMotor();
  const { t } = useT();
  const [d, setD] = useState<FichaLocalidadeDados | null | undefined>(undefined);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    (async () => {
      const c = await motor.chamar("fichaClube", { id: clube });
      const l = c ? await motor.chamar("fichaLocalidade", { id: c.localidade.id }) : null;
      if (vivo) setD(l);
    })().catch(() => vivo && setD(null));
    return () => { vivo = false; };
  }, [motor, clube]);
  if (d === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (d === null) return <p className="erro">{t("ficha.naoEncontrada")}</p>;
  return <FichaLocalidade d={d} />;
}

/** Cidade (RZ-145): a localidade do clube do gamer (a ficha do concelho chega com RZ-133). */
export default function PaginaCidade() {
  return <Suspense fallback={null}><ComClube titulo="">{(c) => <Conteudo clube={c} />}</ComClube></Suspense>;
}
