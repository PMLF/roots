"use client";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";
import { World } from "@/ui/components/World";
import type { Params } from "@/engine/config/parameters";
import type { DbDiagnostics } from "@/engine/api/contracts";
import { derived } from "@/engine/config/parameters";

type State =
  | { phase: "wait" }
  | { phase: "connected"; version: string; schema: number; ms: number; parameters: Params }
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
        if (live) setState({ phase: "connected", version: v.engine, schema: v.schema, ms: Math.round(performance.now() - start), parameters });
      } catch (e) {
        if (live) setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [engine]);

  const euro = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  return (
    <section>
      <h1>{t("menu.world")}</h1>
      <h2>{t("start.engine")}</h2>
      {state.phase === "wait" && <p data-testid="motor-estado">{t("start.engineWaiting")}</p>}
      {state.phase === "error" && <p data-testid="motor-estado" className="erro">{t("start.engineError", { error: state.error })}</p>}
      {state.phase === "connected" && (
        <>
          <p data-testid="motor-estado">{t("start.engineConnected", { version: state.version, schema: state.schema, ms: state.ms })}</p>
          <h2>{t("start.db")}</h2>
          {db.phase === "wait" && <p data-testid="bd-estado">{t("start.dbWaiting")}</p>}
          {db.phase === "error" && <p data-testid="bd-estado" className="erro">{t("start.dbError", { error: db.error })}</p>}
          {db.phase === "ok" && (
            <p data-testid="bd-estado" data-backend={db.d.backend} data-aberturas={db.d.openings}>
              {db.d.persistent
                ? t("start.dbOpfs", { sqlite: db.d.sqlite, schema: db.d.schema, openings: db.d.openings, events: db.d.events })
                : t("start.dbMemory", { sqlite: db.d.sqlite, schema: db.d.schema, reason: db.d.memoryReason ?? "?" })}
            </p>
          )}
          {engine && <World engine={engine} />}
          <h2>{t("start.rules")}</h2>
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("start.clubPrize")}</th><td>{euro.format(state.parameters.prizes.club)}</td></tr>
              <tr><th scope="row">{t("start.cityPrize")}</th><td>{euro.format(state.parameters.prizes.city)}</td></tr>
              <tr><th scope="row">{t("start.promoted")}</th><td>{derived(state.parameters).promotedAtCp}</td></tr>
              <tr><th scope="row">{t("start.districtLeagues")}</th><td>{state.parameters.districtLeagues.target} / {state.parameters.districtLeagues.min} / {state.parameters.districtLeagues.max}</td></tr>
              <tr><th scope="row">&nbsp;</th><td>{t("start.autosave", { days: state.parameters.saves.daysAutosave })}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
