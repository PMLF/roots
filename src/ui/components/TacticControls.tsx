"use client";
import { useId } from "react";
import type { Area, FormationId, Level, Tactic } from "@/engine/match/types";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Scale = "intensity" | "mentality" | "fairPlay" | "timeWasting" | "directness" | "shooting" | "line";
/** Pela ordem em que aparecem: o primeiro nível é o extremo da esquerda, o quinto o da direita. */
const SCALES: readonly Scale[] = ["mentality", "intensity", "directness", "line", "shooting", "timeWasting", "fairPlay"];
const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];

type Props = {
  tactic: Tactic;
  onChange: (t: Tactic) => void;
  disabled?: boolean;
  /** Mostra a escolha da formação (por omissão só as opções). */
  formations?: readonly FormationId[];
  onFormation?: (f: FormationId) => void;
  /** Explicação curta que aparece ao passar no seletor da formação. */
  formationHint?: string;
};

/** Uma opção de cinco níveis: título, nível escolhido, cinco passos e os dois extremos. */
function ScaleControl({ name, value, onPick, disabled }: { name: Scale; value: Level; onPick: (l: Level) => void; disabled: boolean }) {
  const { t } = useT();
  const id = useId();
  const label = (l: number) => t(`tactic.opt.${name}.${l}` as Key);
  return (
    <div className="opcao-tatica" role="radiogroup" aria-labelledby={id}>
      <div className="opcao-tatica-topo">
        <span id={id} className="opcao-tatica-nome">{t(`tactic.opt.${name}` as Key)}</span>
        <span className="opcao-tatica-valor" aria-live="polite">{label(value)}</span>
      </div>
      <div className="opcao-tatica-passos">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={value === l}
            aria-label={label(l)}
            title={label(l)}
            disabled={disabled}
            className={`passo${l <= value ? " cheio" : ""}${value === l ? " atual" : ""}`}
            onClick={() => onPick(l)}
          />
        ))}
      </div>
      <div className="opcao-tatica-extremos" aria-hidden="true">
        <span title={label(1)}>{label(1)}</span>
        <span title={label(5)}>{label(5)}</span>
      </div>
    </div>
  );
}

type Zone = "left" | "centre" | "right";
const ZONES: readonly Zone[] = ["left", "centre", "right"];
const zonesOf = (a: Area): ReadonlySet<Zone> => new Set<Zone>(a === "wings" ? ["left", "right"] : a === "left" ? ["left"] : a === "right" ? ["right"] : a === "centre" ? ["centre"] : []);
const areaOf = (z: ReadonlySet<Zone>): Area => (z.size === 0 ? "any" : z.has("centre") ? "centre" : z.has("left") && z.has("right") ? "wings" : z.has("left") ? "left" : "right");
/** Clicar numa zona liga-a/desliga-a; sem nenhuma a equipa joga em todo o lado; o meio e as alas excluem-se. */
function toggleZone(area: Area, zone: Zone): Area {
  const z = new Set(zonesOf(area));
  if (z.has(zone)) z.delete(zone);
  else if (zone === "centre") { z.clear(); z.add("centre"); }
  else { z.delete("centre"); z.add(zone); }
  return areaOf(z);
}

/** A área a explorar num mini meio campo: três zonas (ala esquerda, meio, ala direita) que se ligam e desligam. */
function AreaControl({ tactic, onChange, disabled }: { tactic: Tactic; onChange: (t: Tactic) => void; disabled: boolean }) {
  const { t } = useT();
  const id = useId();
  const on = zonesOf(tactic.area);
  return (
    <div className="opcao-tatica opcao-area" role="group" aria-labelledby={id}>
      <div className="opcao-tatica-topo">
        <span id={id} className="opcao-tatica-nome">{t("tactic.opt.area")}</span>
        <span className="opcao-tatica-valor" aria-live="polite">{t(`tactic.opt.area.${tactic.area}` as Key)}</span>
      </div>
      <div className="mini-campo">
        {ZONES.map((z) => (
          <button key={z} type="button" aria-pressed={on.has(z)} disabled={disabled} title={t(`tactic.zone.${z}` as Key)} aria-label={t(`tactic.zone.${z}` as Key)} className={`zona zona-${z}${on.has(z) ? " ligada" : ""}`} onClick={() => onChange({ ...tactic, area: toggleZone(tactic.area, z) })} />
        ))}
        <svg className="mini-campo-linhas" viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><rect x="0.500" y="0.500" width="99" height="43" /><path d="M29.400 0v44M70.600 0v44" /><circle cx="50" cy="0.500" r="9" /><rect x="30" y="0.500" width="40" height="12" /></svg>
      </div>
      <div className="opcao-tatica-extremos" aria-hidden="true"><span>{t("tactic.opt.area.left")}</span><span>{t("tactic.opt.area.right")}</span></div>
    </div>
  );
}

/** As opções da tática (RZ-249): formação (opcional) e oito opções em duas filas de quatro: sete escalas de cinco níveis e a área a explorar. Usado na página, no jogo e no laboratório. */
export function TacticControls({ tactic, onChange, disabled = false, formations, onFormation, formationHint }: Props) {
  const { t } = useT();
  return (
    <div className="opcoes-tatica">
      {formations && onFormation && (
        <label className="opcao-tatica opcao-formacao" title={formationHint}>
          <span className="opcao-tatica-nome">{t("lab.formation")}</span>
          <select value={tactic.formation} disabled={disabled} onChange={(e) => onFormation(e.target.value as FormationId)}>
            {formations.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      )}
      <div className="opcoes-tatica-grelha">
        {SCALES.map((k) => <ScaleControl key={k} name={k} value={tactic[k]} disabled={disabled} onPick={(l) => onChange({ ...tactic, [k]: l })} />)}
        <AreaControl tactic={tactic} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}
