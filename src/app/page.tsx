"use client";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import { MotorCliente } from "@/ui/engineClient";
import type { Parametros } from "@/engine/config/parametros";
import { derivados } from "@/engine/config/parametros";

type Estado =
  | { fase: "espera" }
  | { fase: "ligado"; versao: string; esquema: number; ms: number; parametros: Parametros }
  | { fase: "erro"; erro: string };

export default function Inicio() {
  const { t, locale } = useT();
  const [estado, setEstado] = useState<Estado>({ fase: "espera" });

  useEffect(() => {
    const motor = new MotorCliente();
    const inicio = performance.now();
    let vivo = true;
    (async () => {
      try {
        const [v, parametros] = await Promise.all([motor.chamar("versao", null), motor.chamar("parametros", null)]);
        await motor.chamar("ping", { eco: "olá" });
        if (vivo) setEstado({ fase: "ligado", versao: v.motor, esquema: v.esquema, ms: Math.round(performance.now() - inicio), parametros });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", erro: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; motor.terminar(); };
  }, []);

  const euro = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  return (
    <section>
      <h1>{t("inicio.titulo")}</h1>
      <h2>{t("inicio.motor")}</h2>
      {estado.fase === "espera" && <p data-testid="motor-estado">{t("inicio.motorAEspera")}</p>}
      {estado.fase === "erro" && <p data-testid="motor-estado" className="erro">{t("inicio.motorErro", { erro: estado.erro })}</p>}
      {estado.fase === "ligado" && (
        <>
          <p data-testid="motor-estado">{t("inicio.motorLigado", { versao: estado.versao, esquema: estado.esquema, ms: estado.ms })}</p>
          <h2>{t("inicio.regras")}</h2>
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("inicio.premioClube")}</th><td>{euro.format(estado.parametros.premios.clube)}</td></tr>
              <tr><th scope="row">{t("inicio.premioCidade")}</th><td>{euro.format(estado.parametros.premios.cidade)}</td></tr>
              <tr><th scope="row">{t("inicio.promovidos")}</th><td>{derivados(estado.parametros).promovidosAoCp}</td></tr>
              <tr><th scope="row">{t("inicio.distritais")}</th><td>{estado.parametros.distritais.alvo} / {estado.parametros.distritais.min} / {estado.parametros.distritais.max}</td></tr>
              <tr><th scope="row">&nbsp;</th><td>{t("inicio.autosave", { dias: estado.parametros.saves.autosaveDias })}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
