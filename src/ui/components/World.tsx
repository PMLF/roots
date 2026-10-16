"use client";
import { EntityLink } from "@/ui/components/Link";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/position";
import type { ClientEngine } from "@/ui/engineClient";
import type { SummaryClub, WorldProgress, CreatedWorldSummary } from "@/engine/api/contracts";
import type { ViewPerson } from "@/engine/view/types";

type State =
  | { phase: "initial" }
  | { phase: "creating"; progress?: WorldProgress }
  | { phase: "ready"; summary: CreatedWorldSummary }
  | { phase: "error"; error: string };

/** Semente nova para cada save: cada save é um mundo único. */
const newSeed = () => {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(7, "0")).join("").slice(0, 10);
};

/** Criação do mundo (RZ-103) com progresso, e plantel público de um clube lido pela Vista. */
export function World({ engine }: { engine: ClientEngine }) {
  const { t } = useT();
  const [seed, setSeed] = useState(newSeed);
  const [state, setState] = useState<State>({ phase: "initial" });
  const [clubs, setClubs] = useState<SummaryClub[]>([]);
  const [club, setClub] = useState("");
  const [squad, setSquad] = useState<ViewPerson[]>([]);

  // Ao abrir, só olha: se o save já tem mundo mostra-o; o mundo só se gera quando se carrega em "Criar".
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const existing = await engine.call("worldState", null);
        if (!existing || !live) return;
        const list = await engine.call("clubs", null);
        if (!live) return;
        setClubs(list);
        setClub(list[0]?.id ?? "");
        setState({ phase: "ready", summary: existing });
      } catch (e) {
        if (live) setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [engine]);

  const [confirming, setConfirming] = useState(false);
  const create = async (restart = false) => {
    setConfirming(false);
    setState({ phase: "creating" });
    try {
      const seedValue = restart ? newSeed() : seed;
      if (restart) { setSeed(seedValue); setSquad([]); }
      const summary = await engine.call(restart ? "restartWorld" : "createWorld", { seed: seedValue }, (progress) => setState({ phase: "creating", progress }));
      const list = await engine.call("clubs", null);
      setClubs(list);
      setClub((c) => (restart ? list[0]?.id : c) || list[0]?.id || "");
      setState({ phase: "ready", summary });
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    if (state.phase !== "ready" || !club) return;
    let live = true;
    engine.call("squad", { club }).then((p) => live && setSquad(p)).catch(() => live && setSquad([]));
    return () => { live = false; };
  }, [state.phase, club, engine]);

  const p = state.phase === "creating" ? state.progress : undefined;
  const phaseText = (phase: string) =>
    ({ clubs: t("world.phase.clubs"), cities: t("world.phase.cities"), others: t("world.phase.others"), free: t("world.phase.free"), validate: t("world.phase.validate"), save: t("world.phase.save") })[phase] ?? t("world.creating");
  return (
    <section>
      <h2>{t("world.title")}</h2>
      <p>
        <label>
          {t("world.seed")}{" "}
          <input value={seed} onChange={(e) => setSeed(e.target.value)} disabled={state.phase !== "initial" && state.phase !== "error"} data-testid="mundo-seed" />
        </label>{" "}
        <button onClick={() => setSeed(newSeed())} disabled={state.phase !== "initial" && state.phase !== "error"} data-testid="mundo-nova-semente">{t("world.newSeed")}</button>{" "}
        <button onClick={() => create()} disabled={(state.phase !== "initial" && state.phase !== "error") || seed.trim() === ""} data-testid="mundo-criar">{t("world.create")}</button>
      </p>
      {state.phase === "creating" && (
        <p data-testid="mundo-progresso">
          {p ? phaseText(p.phase) : t("world.creating")}{" "}
          <progress max={p?.total ?? 1} value={p?.done ?? 0} />
        </p>
      )}
      {state.phase === "error" && <p className="erro" data-testid="mundo-estado">{t("world.error", { error: state.error })}</p>}
      {state.phase === "ready" && (
        <>
          <p data-testid="mundo-estado" data-pessoas={state.summary.people}>
            {state.summary.alreadyExisted
              ? t("world.alreadyExisted", { seed: state.summary.seed, people: state.summary.people, players: state.summary.players })
              : t("world.created", { seed: state.summary.seed, clubs: state.summary.clubs, people: state.summary.people, players: state.summary.players, seconds: (state.summary.ms / 1000).toFixed(1) })}
            {state.summary.warnings.length > 0 && <> {t("world.warnings", { n: state.summary.warnings.length })}</>}
          </p>
          <p>
            {!confirming ? (
              <button onClick={() => setConfirming(true)} data-testid="mundo-reiniciar">{t("world.restart")}</button>
            ) : (
              <>
                <span className="erro">{t("world.restartWarning")}</span>{" "}
                <button onClick={() => create(true)} data-testid="mundo-reiniciar-confirmar">{t("world.restartConfirm")}</button>{" "}
                <button onClick={() => setConfirming(false)}>{t("world.restartCancel")}</button>
              </>
            )}
          </p>
          <h3>{t("world.squad")}</h3>
          <p>
            <label>
              {t("world.club")}{" "}
              <select value={club} onChange={(e) => setClub(e.target.value)} data-testid="mundo-clube">
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.league})</option>)}
              </select>
            </label>
          </p>
          <table className="tabela" data-testid="mundo-plantel">
            <thead><tr><th>{t("world.colName")}</th><th>{t("world.colAge")}</th><th>{t("world.colPos")}</th><th>{t("world.colCountry")}</th></tr></thead>
            <tbody>
              {squad.map((j) => (
                <tr key={j.id}><td><EntityLink k="person" id={j.id}>{j.sportingName}</EntityLink></td><td>{j.age}</td><td>{abbreviationPosition(t, j.player?.position ?? "")}</td><td>{j.nationality}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
