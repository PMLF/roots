"use client";
import { EntityLink } from "@/ui/components/Ligacao";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/posicao";
import type { ClientEngine } from "@/ui/engineClient";
import type { SummaryClub, WorldProgress, CreatedWorldSummary } from "@/engine/api/contratos";
import type { ViewPerson } from "@/engine/vista/tipos";

type State =
  | { phase: "initial" }
  | { phase: "a-criar"; progress?: WorldProgress }
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
    setState({ phase: "a-criar" });
    try {
      const seedValue = restart ? newSeed() : seed;
      if (restart) { setSeed(seedValue); setSquad([]); }
      const summary = await engine.call(restart ? "restartWorld" : "createWorld", { seed: seedValue }, (progress) => setState({ phase: "a-criar", progress }));
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

  const p = state.phase === "a-criar" ? state.progress : undefined;
  const phaseText = (phase: string) =>
    ({ clubs: t("mundo.fase.clubes"), cities: t("mundo.fase.cidades"), others: t("mundo.fase.outros"), free: t("mundo.fase.livres"), validate: t("mundo.fase.validar"), save: t("mundo.fase.guardar") })[phase] ?? t("mundo.aCriar");
  return (
    <section>
      <h2>{t("mundo.titulo")}</h2>
      <p>
        <label>
          {t("mundo.seed")}{" "}
          <input value={seed} onChange={(e) => setSeed(e.target.value)} disabled={state.phase !== "initial" && state.phase !== "error"} data-testid="mundo-seed" />
        </label>{" "}
        <button onClick={() => setSeed(newSeed())} disabled={state.phase !== "initial" && state.phase !== "error"} data-testid="mundo-nova-semente">{t("mundo.novaSemente")}</button>{" "}
        <button onClick={() => create()} disabled={(state.phase !== "initial" && state.phase !== "error") || seed.trim() === ""} data-testid="mundo-criar">{t("mundo.criar")}</button>
      </p>
      {state.phase === "a-criar" && (
        <p data-testid="mundo-progresso">
          {p ? phaseText(p.phase) : t("mundo.aCriar")}{" "}
          <progress max={p?.total ?? 1} value={p?.done ?? 0} />
        </p>
      )}
      {state.phase === "error" && <p className="erro" data-testid="mundo-estado">{t("mundo.erro", { error: state.error })}</p>}
      {state.phase === "ready" && (
        <>
          <p data-testid="mundo-estado" data-pessoas={state.summary.people}>
            {state.summary.alreadyExisted
              ? t("mundo.jaExistia", { seed: state.summary.seed, people: state.summary.people, players: state.summary.players })
              : t("mundo.criado", { seed: state.summary.seed, clubs: state.summary.clubs, people: state.summary.people, players: state.summary.players, seconds: (state.summary.ms / 1000).toFixed(1) })}
            {state.summary.warnings.length > 0 && <> {t("mundo.avisos", { n: state.summary.warnings.length })}</>}
          </p>
          <p>
            {!confirming ? (
              <button onClick={() => setConfirming(true)} data-testid="mundo-reiniciar">{t("mundo.reiniciar")}</button>
            ) : (
              <>
                <span className="erro">{t("mundo.reiniciarAviso")}</span>{" "}
                <button onClick={() => create(true)} data-testid="mundo-reiniciar-confirmar">{t("mundo.reiniciarConfirmar")}</button>{" "}
                <button onClick={() => setConfirming(false)}>{t("mundo.reiniciarCancelar")}</button>
              </>
            )}
          </p>
          <h3>{t("mundo.plantel")}</h3>
          <p>
            <label>
              {t("mundo.clube")}{" "}
              <select value={club} onChange={(e) => setClub(e.target.value)} data-testid="mundo-clube">
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.league})</option>)}
              </select>
            </label>
          </p>
          <table className="tabela" data-testid="mundo-plantel">
            <thead><tr><th>{t("mundo.colNome")}</th><th>{t("mundo.colIdade")}</th><th>{t("mundo.colPos")}</th><th>{t("mundo.colPais")}</th></tr></thead>
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
