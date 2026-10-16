"use client";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/MotorProvider";
import { World } from "@/ui/components/Mundo";
import type { Params } from "@/engine/config/parametros";
import type { DbDiagnostics } from "@/engine/api/contratos";
import { derived } from "@/engine/config/parametros";

type State =
  | { phase: "wait" }
  | { phase: "ligado"; version: string; schema: number; ms: number; parameters: Params }
  | { phase: "error"; error: string };

export default function WorldPage() {
  const { t, locale } = useT();
  const [state, setState] = useState<State>({ phase: "wait" });
  const engine = useEngine();
  const [db, setDb] = useState<{ phase: "wait" } | { phase: "ok"; d: DbDiagnostics } | { phase: "error"; error: string }>({ phase: "wait" });

  useEffect(() => {
    if (!engine) return;
    const start = performance.now();
    let live = true;
    (async () => {
      try {
        const [v, parameters] = await Promise.all([engine.call("version", null), engine.call("parameters", null)]);
        await engine.call("ping", { echo: "olá" });
        engine
          .call("db", null)
          .then((d) => live && setDb({ phase: "ok", d }))
          .catch((e) => live && setDb({ phase: "error", error: e instanceof Error ? e.message : String(e) }));
        if (live) setState({ phase: "ligado", version: v.engine, schema: v.schema, ms: Math.round(performance.now() - start), parameters });
      } catch (e) {
        if (live) setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [engine]);

  const euro = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  return (
    <section>
      <h1>{t("menu.mundo")}</h1>
      <h2>{t("inicio.motor")}</h2>
      {state.phase === "wait" && <p data-testid="motor-estado">{t("inicio.motorAEspera")}</p>}
      {state.phase === "error" && <p data-testid="motor-estado" className="erro">{t("inicio.motorErro", { error: state.error })}</p>}
      {state.phase === "ligado" && (
        <>
          <p data-testid="motor-estado">{t("inicio.motorLigado", { version: state.version, schema: state.schema, ms: state.ms })}</p>
          <h2>{t("inicio.bd")}</h2>
          {db.phase === "wait" && <p data-testid="bd-estado">{t("inicio.bdAEspera")}</p>}
          {db.phase === "error" && <p data-testid="bd-estado" className="erro">{t("inicio.bdErro", { error: db.error })}</p>}
          {db.phase === "ok" && (
            <p data-testid="bd-estado" data-backend={db.d.backend} data-aberturas={db.d.openings}>
              {db.d.persistent
                ? t("inicio.bdOpfs", { sqlite: db.d.sqlite, schema: db.d.schema, openings: db.d.openings, events: db.d.events })
                : t("inicio.bdMemoria", { sqlite: db.d.sqlite, schema: db.d.schema, reason: db.d.memoryReason ?? "?" })}
            </p>
          )}
          {engine && <World engine={engine} />}
          <h2>{t("inicio.regras")}</h2>
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("inicio.premioClube")}</th><td>{euro.format(state.parameters.prizes.club)}</td></tr>
              <tr><th scope="row">{t("inicio.premioCidade")}</th><td>{euro.format(state.parameters.prizes.city)}</td></tr>
              <tr><th scope="row">{t("inicio.promovidos")}</th><td>{derived(state.parameters).promotedAtCp}</td></tr>
              <tr><th scope="row">{t("inicio.distritais")}</th><td>{state.parameters.districtLeagues.target} / {state.parameters.districtLeagues.min} / {state.parameters.districtLeagues.max}</td></tr>
              <tr><th scope="row">&nbsp;</th><td>{t("inicio.autosave", { days: state.parameters.saves.daysAutosave })}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
