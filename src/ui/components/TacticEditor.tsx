"use client";
import { useCallback, useEffect, useState } from "react";
import type { ViewPlan } from "@/engine/api/contracts";
import { BENCH_SIZE, moveToBench, moveToReserve, moveToSlot, remapLineup, type Board } from "@/engine/match/lineup";
import type { Style, FormationId, Tactic } from "@/engine/match/types";
import { Card } from "@/ui/components/Card";
import { EntityLink } from "@/ui/components/Link";
import { PitchBoard } from "@/ui/components/PitchBoard";
import { Stars } from "@/ui/components/Stars";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/position";
import { useEngine } from "@/ui/EngineProvider";

type Squad = ViewPlan["squad"][number];
type Zone = "starting" | "bench" | "reserves";

const STYLES: Style[] = ["beautiful", "balanced", "direct", "counterAttack"];
const LEVELS = [1, 2, 3, 4, 5] as const;
const FIELDS_LEVEL = ["intensity", "line", "tempo", "fairPlay"] as const;
const ORDER = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"];
const byPosition = (a: Squad, b: Squad) => ORDER.indexOf(a.positions[0]?.pos ?? "ST") - ORDER.indexOf(b.positions[0]?.pos ?? "ST") || (b.stars ?? 0) - (a.stars ?? 0) || a.name.localeCompare(b.name, "pt");
const energy = (form: number) => Math.max(0, Math.min(100, Math.round(((form - 0.85) / 0.15) * 100)));

/** Editor da tática e do onze do clube do gamer (RZ-158, RZ-248): campo em vetor, arrastar e largar, banco e reservas. Usado na página «Tática» e no ecrã pré-jogo (RZ-169). */
export function TacticEditor({ withoutNextMatch = false }: { withoutNextMatch?: boolean }) {
  const { t } = useT();
  const engine = useEngine();
  const [plan, setPlan] = useState<ViewPlan | null | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("plan", null).then((p) => live && setPlan(p)).catch(() => live && setPlan(null));
    return () => { live = false; };
  }, [engine]);
  useEffect(() => {
    const show = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener("raizes:onze-invalido", show);
    return () => window.removeEventListener("raizes:onze-invalido", show);
  }, []);

  const save = useCallback(async (tactic: Tactic, board: Board, formationPositions: ViewPlan["formationPositions"]) => {
    if (!engine) return;
    try {
      const lineup = board.slots.flatMap((player, i) => (player ? [{ player, position: formationPositions[tactic.formation][i]! }] : []));
      const p = await engine.call("savePlan", { tactic, lineup, bench: board.bench });
      setPlan(p);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [engine]);

  if (plan === undefined) return <p>{t("profile.loading")}</p>;
  if (plan === null) return <p className="vazio">{t("myClub.empty")}</p>;

  const board: Board = { slots: plan.lineup.map((o) => o.player), bench: plan.bench };
  const commit = (next: Board | undefined, tactic: Tactic = plan.tactic) => {
    if (!next) { setError(t("tactic.benchFull", { n: BENCH_SIZE })); return; }
    setSelected(undefined);
    void save(tactic, next, plan.formationPositions);
  };
  const changeFormation = (formation: FormationId) => {
    const kept = remapLineup(plan.lineup.flatMap((o) => (o.player ? [{ player: o.player, position: o.position }] : [])), formation);
    const slots: (string | undefined)[] = Array.from({ length: 11 }, () => undefined);
    const free = plan.formationPositions[formation].map((pos, i) => ({ pos, i }));
    for (const s of kept) { const k = free.findIndex((f) => f.pos === s.position); slots[free[k]!.i] = s.player; free.splice(k, 1); }
    commit({ slots, bench: plan.bench }, { ...plan.tactic, formation });
  };
  const place = (player: string, slot: number) => commit(moveToSlot(board, player, slot));
  const toZone = (player: string, zone: Zone) => commit(zone === "bench" ? moveToBench(board, player) : moveToReserve(board, player));

  const start = new Map(plan.lineup.flatMap((o, i) => (o.player ? [[o.player, i] as const] : [])));
  const rows: Record<Zone, Squad[]> = {
    starting: plan.squad.filter((p) => start.has(p.player)).sort((a, b) => (start.get(a.player) ?? 0) - (start.get(b.player) ?? 0)),
    bench: plan.bench.flatMap((id) => plan.squad.find((p) => p.player === id) ?? []),
    reserves: plan.squad.filter((p) => !start.has(p.player) && !plan.bench.includes(p.player)).sort(byPosition),
  };
  const slotOf = (id: string) => plan.lineup[start.get(id) ?? -1];
  const missing = plan.lineup.filter((o) => !o.player).length;
  const outOfPosition = plan.lineup.filter((o) => o.outOfPosition);
  const tired = plan.lineup.filter((o) => o.player && (plan.squad.find((p) => p.player === o.player)?.form ?? 1) < 0.97);

  const section = (zone: Zone, title: string, hint: string) => (
    <tbody
      key={zone}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id && zone !== "starting") toZone(id, zone); }}
    >
      <tr className="tabela-secao">
        <th colSpan={9}>
          {title} <small className="suave">{hint}</small>
          {selected && zone !== "starting" && !rows[zone].some((p) => p.player === selected) && <button type="button" className="ligacao-botao" onClick={() => toZone(selected, zone)}>{t("tactic.moveHere")}</button>}
        </th>
      </tr>
      {rows[zone].length === 0 && <tr><td colSpan={9} className="vazio">{t(`tactic.empty.${zone}` as Key)}</td></tr>}
      {rows[zone].map((p) => {
        const slot = slotOf(p.player);
        return (
          <tr
            key={p.player}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.player); e.dataTransfer.effectAllowed = "move"; }}
            onClick={() => setSelected(selected === p.player ? undefined : p.player)}
            className={`${selected === p.player ? "escolhido" : ""}${p.unavailable ? " indisponivel" : ""}`}
            aria-selected={selected === p.player}
          >
            <td><EntityLink k="person" id={p.player}>{p.name}</EntityLink></td>
            <td>{slot ? abbreviationPosition(t, slot.position) : p.positions.slice(0, 2).map((x) => abbreviationPosition(t, x.pos)).join("/")}</td>
            <td className="num">{p.matches}</td>
            <td className="num" title={t("tactic.avgLast5")}>{p.avgLast5 !== undefined ? p.avgLast5.toFixed(1).replace(".", ",") : "—"}</td>
            <td className={`num${energy(p.form) < 50 ? " erro" : ""}`} title={t("tactic.form")}>{energy(p.form)}%</td>
            <td>{p.stars !== undefined ? <Stars value={p.stars} /> : "?"}</td>
            <td className="num">{p.age}</td>
            <td className="num">{p.goals}</td>
            <td>{p.unavailable ? <span className="erro">{t(`tactic.${p.unavailable}` as Key)}</span> : null}</td>
          </tr>
        );
      })}
    </tbody>
  );

  return (
    <div className="cartoes">
      {!withoutNextMatch && plan.nextMatch && (
        <Card title={t("tactic.nextMatch")} wide>
          <p>
            <b>{plan.nextMatch.atHome ? "" : "@ "}{plan.nextMatch.opponent}</b> <span className="suave">· {plan.nextMatch.date} · {plan.nextMatch.competition}</span>
            {plan.nextMatch.confirmed && <span className="suave"> · {t("tactic.confirmed")}</span>}
          </p>
        </Card>
      )}
      <Card title={t("tactic.title")}>
        <div className="formulario">
          <label>{t("lab.formation")}{" "}
            <select value={plan.tactic.formation} onChange={(e) => changeFormation(e.target.value as FormationId)}>
              {plan.formations.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label>{t("lab.style")}{" "}
            <select value={plan.tactic.style} onChange={(e) => commit(board, { ...plan.tactic, style: e.target.value as Style })}>
              {STYLES.map((s) => <option key={s} value={s}>{t(`lab.style.${s}` as Key)}</option>)}
            </select>
          </label>
          {FIELDS_LEVEL.map((k) => (
            <label key={k}>{t(`tactic.${k}` as Key)}{" "}
              <select value={plan.tactic[k]} onChange={(e) => commit(board, { ...plan.tactic, [k]: Number(e.target.value) as 1 })}>
                {LEVELS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="suave">{t("tactic.formationWarning")}</p>
      </Card>
      <div className="tatica-grelha">
        <Card title={t("tactic.pitch")}>
          <PitchBoard formation={plan.tactic.formation} plan={plan} selected={selected} onSelect={(id) => setSelected(selected === id ? undefined : id)} onPlace={place} onRemove={(id) => toZone(id, "reserves")} />
          <ul className="legenda-zonas">
            <li><span className="halo-amostra verde" aria-hidden="true" /> {t("tactic.halo.verde")}</li>
            <li><span className="halo-amostra amarelo" aria-hidden="true" /> {t("tactic.halo.amarelo")}</li>
            <li><span className="halo-amostra vermelho" aria-hidden="true" /> {t("tactic.halo.vermelho")}</li>
          </ul>
        </Card>
        <Card title={t("tactic.lineup")}>
          <p className="suave">{t("tactic.dragHint")}</p>
          {missing > 0 && <p className="erro" role="status">{t("tactic.missing", { n: missing })}</p>}
          {plan.ready.reason === "unavailable" && <p className="erro" role="status">{t("tactic.unavailableWarning", { names: (plan.ready.names ?? []).join(", ") })}</p>}
          <div className="tabela-rolar">
            <table className="tabela densa tabela-onze">
              <thead>
                <tr>
                  <th>{t("tactic.col.name")}</th><th>{t("tactic.col.pos")}</th><th className="num">{t("tactic.col.games")}</th><th className="num">{t("tactic.col.last5")}</th><th className="num">{t("tactic.col.energy")}</th><th>{t("tactic.col.level")}</th><th className="num">{t("tactic.col.age")}</th><th className="num">{t("tactic.col.goals")}</th><th />
                </tr>
              </thead>
              {section("starting", t("tactic.starting", { n: 11 - missing }), "")}
              {section("bench", t("tactic.bench"), `${plan.bench.length}/${BENCH_SIZE}`)}
              {section("reserves", t("tactic.reserves"), `${rows.reserves.length}`)}
            </table>
          </div>
          {outOfPosition.length > 0 && <p className="erro" role="status">{t("tactic.outOfPositionWarning", { names: outOfPosition.map((o) => `${o.name} (${abbreviationPosition(t, o.position)}, ${Math.round((o.performance ?? 1) * 100)}%)`).join(", ") })}</p>}
          {tired.length > 0 && <p className="suave" role="status">{t("tactic.tiredWarning", { names: tired.map((o) => o.name).join(", ") })}</p>}
          {error && <p className="erro" role="alert">{error}</p>}
        </Card>
      </div>
    </div>
  );
}
