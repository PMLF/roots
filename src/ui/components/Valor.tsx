"use client";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { ValorMostrado } from "@/ui/valor";

/** Exato, estimado (≈) e desatualizado têm aspeto diferente e dizem-no a quem usa leitor de ecrã. */
export function Valor({ v }: { v: ValorMostrado }) {
  const { t } = useT();
  const nota = v.estado === "desatualizado" ? t("valor.vistoHa", { epocas: v.epocasDesde ?? 0 }) : v.estado === "estimado" ? t("valor.estimado") : undefined;
  return (
    <span className={`valor valor-${v.estado}`} title={nota}>
      {v.texto}
      {v.estado === "desatualizado" && <small className="valor-nota"> · {nota}</small>}
    </span>
  );
}
