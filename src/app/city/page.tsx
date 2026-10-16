"use client";
import { Suspense, useEffect, useState } from "react";
import type { FichaCidadeDados } from "@/engine/api/contratos";
import { ComClube } from "@/ui/components/ComClube";
import { FichaCidade } from "@/ui/components/fichas/FichaCidade";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

function Conteudo({ clube }: { clube: string }) {
  const motor = useMotor();
  const { t } = useT();
  const [d, setD] = useState<FichaCidadeDados | null | undefined>(undefined);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    (async () => {
      const c = await motor.chamar("fichaClube", { id: clube });
      const cidade = c ? await motor.chamar("fichaCidade", { id: c.cidade.id }) : null;
      if (vivo) setD(cidade);
    })().catch(() => vivo && setD(null));
    return () => { vivo = false; };
  }, [motor, clube]);
  if (d === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (d === null) return <p className="erro">{t("ficha.naoEncontrada")}</p>;
  return <FichaCidade d={d} />;
}

/** Cidade (RZ-133): o concelho do clube do gamer. As das outras cidades abrem pelas ligações (`/profile/?type=city`). */
export default function PaginaCidade() {
  return <Suspense fallback={null}><ComClube titulo="">{(c) => <Conteudo clube={c} />}</ComClube></Suspense>;
}
