"use client";
import { useId } from "react";
import { AREAS, type Area, type FormationId, type Level, type Tactic } from "@/engine/match/types";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Scale = "intensity" | "mentality" | "fairPlay" | "urgency" | "directness" | "shooting" | "line";
/** Pela ordem em que aparecem: o primeiro nível é o extremo da esquerda, o quinto o da direita. */
export const SCALES: readonly Scale[] = ["mentality", "intensity", "directness", "line", "shooting", "urgency", "fairPlay"];
const LEVELS: readonly Level[] = [1, 2, 3, 4, 5];

type Props = {
  tactic: Tactic;
  onChange: (t: Tactic) => void;
  disabled?: boolean;
  /** Mostra a escolha da formação (por omissão só as opções). */
  formations?: readonly FormationId[];
  onFormation?: (f: FormationId) => void;
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

/** As opções da tática (RZ-249): formação, sete escalas de cinco níveis e a área a explorar. Usado na página, no jogo e no laboratório. */
export function TacticControls({ tactic, onChange, disabled = false, formations, onFormation }: Props) {
  const { t } = useT();
  const areaId = useId();
  return (
    <div className="opcoes-tatica">
      {formations && onFormation && (
        <label className="opcao-tatica opcao-formacao">
          <span className="opcao-tatica-nome">{t("lab.formation")}</span>
          <select value={tactic.formation} disabled={disabled} onChange={(e) => onFormation(e.target.value as FormationId)}>
            {formations.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      )}
      {SCALES.map((k) => <ScaleControl key={k} name={k} value={tactic[k]} disabled={disabled} onPick={(l) => onChange({ ...tactic, [k]: l })} />)}
      <div className="opcao-tatica opcao-area" role="radiogroup" aria-labelledby={areaId}>
        <div className="opcao-tatica-topo"><span id={areaId} className="opcao-tatica-nome">{t("tactic.opt.area")}</span></div>
        <div className="opcao-tatica-areas">
          {AREAS.map((a: Area) => (
            <button key={a} type="button" role="radio" aria-checked={tactic.area === a} disabled={disabled} className={`area${tactic.area === a ? " atual" : ""}`} onClick={() => onChange({ ...tactic, area: a })}>
              {t(`tactic.opt.area.${a}` as Key)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
