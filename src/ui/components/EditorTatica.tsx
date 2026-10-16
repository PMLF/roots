"use client";
import { useCallback, useEffect, useState } from "react";
import type { ViewPlan } from "@/engine/api/contratos";
import type { Style, FormationId, Tactic } from "@/engine/jogo/tipos";
import { Card } from "@/ui/components/Cartao";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/posicao";
import { useEngine } from "@/ui/MotorProvider";

const STYLES: Style[] = ["beautiful", "balanced", "direct", "counterAttack"];
const LEVELS = [1, 2, 3, 4, 5] as const;
const FIELDS_LEVEL = ["intensity", "line", "tempo", "fairPlay"] as const;

/** Editor da tática e do onze do clube do gamer (RZ-158). Usado na página «Tática» e no ecrã pré-jogo (RZ-169). */
export function TacticEditor({ withoutNextMatch = false }: { withoutNextMatch?: boolean }) {
  const { t } = useT();
  const engine = useEngine();
  const [plan, setPlan] = useState<ViewPlan | null | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("plan", null).then((p) => live && setPlan(p)).catch(() => live && setPlan(null));
    return () => { live = false; };
  }, [engine]);

  const save = useCallback(async (tactic: Tactic, lineup: { player: string; position: string }[] | null) => {
    if (!engine) return;
    try {
      const p = await engine.call("savePlan", { tactic, lineup: lineup as never });
      setPlan(p);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [engine]);

  if (plan === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (plan === null) return <p className="vazio">{t("meuClube.vazio")}</p>;

  const currentLineup = plan.lineup.map((o) => ({ player: o.player, position: o.position }));
  const swap = (i: number, player: string) => {
    const fresh = currentLineup.map((o) => ({ ...o }));
    const j = fresh.findIndex((o) => o.player === player);
    if (j >= 0 && j !== i) fresh[j] = { player: fresh[i]!.player, position: fresh[j]!.position }; // quem já está noutra posição troca
    fresh[i] = { player, position: fresh[i]!.position };
    void save(plan.tactic, fresh);
  };
  const state = (id: string) => plan.squad.find((p) => p.player === id);
  const aptitude = (id: string, pos: string) => state(id)?.positions.find((p) => p.pos === pos)?.aptitude;
  const mark = (id: string) => {
    const e = state(id);
    return e?.unavailable ? ` — ${t(`tatica.${e.unavailable}` as Key)}` : e && e.form < 0.97 ? ` — ${t("tatica.cansado")}` : "";
  };
  const outOfPosition = plan.lineup.filter((o) => o.outOfPosition);
  const tired = plan.lineup.filter((o) => (state(o.player)?.form ?? 1) < 0.97);

  return (
    <div className="cartoes">
      {!withoutNextMatch && plan.nextMatch && (
        <Card title={t("tatica.proximoJogo")} wide>
          <p>
            <b>{plan.nextMatch.atHome ? "" : "@ "}{plan.nextMatch.opponent}</b> <span className="suave">· {plan.nextMatch.date} · {plan.nextMatch.competition}</span>
            {plan.nextMatch.confirmed && <span className="suave"> · {t("tatica.confirmado")}</span>}
          </p>
        </Card>
      )}
      <Card title={t("tatica.titulo")}>
        <div className="formulario">
          <label>{t("lab.formacao")}{" "}
            <select value={plan.tactic.formation} onChange={(e) => void save({ ...plan.tactic, formation: e.target.value as FormationId }, null)}>
              {plan.formations.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label>{t("lab.estilo")}{" "}
            <select value={plan.tactic.style} onChange={(e) => void save({ ...plan.tactic, style: e.target.value as Style }, plan.automatic ? null : currentLineup)}>
              {STYLES.map((s) => <option key={s} value={s}>{t(`lab.estilo.${s}` as Key)}</option>)}
            </select>
          </label>
          {FIELDS_LEVEL.map((k) => (
            <label key={k}>{t(`tatica.${k}` as Key)}{" "}
              <select value={plan.tactic[k]} onChange={(e) => void save({ ...plan.tactic, [k]: Number(e.target.value) as 1 }, plan.automatic ? null : currentLineup)}>
                {LEVELS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="suave">{t("tatica.formacaoAviso")}</p>
      </Card>
      <Card title={t("tatica.onze")}>
        {plan.automatic && <p className="suave">{t("tatica.automatico")}</p>}
        <table className="tabela densa">
          <tbody>
            {plan.lineup.map((o, i) => (
              <tr key={`${o.position}-${i}`}>
                <td>{abbreviationPosition(t, o.position)}</td>
                <td>
                  <select value={o.player} onChange={(e) => swap(i, e.target.value)} aria-label={t(`posicao.nome.${o.position}` as Key)}>
                    {plan.squad.map((p) => <option key={p.player} value={p.player}>{p.name}{mark(p.player)}</option>)}
                  </select>
                </td>
                <td className="num suave" title={t("tatica.aptidao")}>{aptitude(o.player, o.position) ?? "—"}</td>
                <td className={`num${o.outOfPosition ? " erro" : " suave"}`} title={t("tatica.rendimento")}>{Math.round(o.performance * 100)}%</td>
                <td className={`num${(state(o.player)?.form ?? 1) < 0.97 ? " erro" : " suave"}`} title={t("tatica.forma")}>{Math.round((state(o.player)?.form ?? 1) * 100)}%</td>
                <td>{state(o.player)?.unavailable ? <span className="erro">{t(`tatica.${state(o.player)!.unavailable}` as Key)}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {outOfPosition.length > 0 && <p className="erro" role="status">{t("tatica.avisoForaPosicao", { names: outOfPosition.map((o) => `${o.name} (${abbreviationPosition(t, o.position)}, ${Math.round(o.performance * 100)}%)`).join(", ") })}</p>}
        {tired.length > 0 && <p className="suave" role="status">{t("tatica.avisoCansados", { names: tired.map((o) => o.name).join(", ") })}</p>}
        <p className="acoes"><button type="button" disabled={plan.automatic} onClick={() => void save(plan.tactic, null)}>{t("tatica.onzeAutomatico")}</button></p>
        {error && <p className="erro">{error}</p>}
      </Card>
    </div>
  );
}
