"use client";
import { useEffect, useRef, useState } from "react";
import type { ScoutOrderOutput, ScoutRow, ScoutingData } from "@/engine/api/contracts";
import { CloseButton } from "@/ui/components/CloseButton";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Popup para pedir ao olheiro uma observação de um jogador: uma semana (estimativas e pistas) ou um mês (tudo). */
export function ObserveDialog({ row, data, onClose, onDone }: { row: ScoutRow; data: ScoutingData; onClose: () => void; onDone: () => void }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const ref = useRef<HTMLDialogElement>(null);
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [kind, setKind] = useState<"week" | "month">(row.knowledge === "week" ? "month" : "week");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const mult = row.club?.foreign ? data.cost.foreignMultiplier : 1;
  const cost = { week: data.cost.week * mult, month: data.cost.month * mult };
  const submit = async () => {
    if (!engine) return;
    setBusy(true);
    const r: ScoutOrderOutput = await engine.call("scoutOrder", { kind, person: row.id });
    setBusy(false);
    if (r.ok) { onDone(); ref.current?.close(); } else setError(t(`scouting.error.${r.reason}` as Key));
  };
  return (
    <dialog ref={ref} className="popup" aria-labelledby="h-observe" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="popup-corpo">
        <CloseButton onClose={() => ref.current?.close()} />
        <h2 id="h-observe">{t("scouting.observeTitle", { name: row.name })}</h2>
        <form className="formulario" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {(["week", "month"] as const).map((k) => (
            <label key={k} className="opcao-linha">
              <input type="radio" name="observe" checked={kind === k} onChange={() => setKind(k)} />
              <span><b>{t(`scouting.observe.${k}` as Key)}</b> · {eur.format(cost[k])}<br /><small className="suave">{t(`scouting.observe.${k}.help` as Key)}</small></span>
            </label>
          ))}
          {error && <p className="erro" role="alert">{error}</p>}
          <div className="acoes-popup">
            <button type="submit" disabled={busy}>{t("scouting.order")}</button>
            <button type="button" className="secundario" onClick={() => ref.current?.close()}>{t("renewals.close")}</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

/** Aviso quando não cabe mais nenhuma ordem: todos os olheiros estão ocupados (ou o clube não tem olheiros). */
export function BusyDialog({ capacity, running, onClose }: { capacity: number; running: number; onClose: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="popup" aria-labelledby="h-busy" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="popup-corpo">
        <CloseButton onClose={() => ref.current?.close()} />
        <h2 id="h-busy">{t(capacity === 0 ? "scouting.noScoutTitle" : "scouting.busyTitle")}</h2>
        <p>{capacity === 0 ? t("scouting.error.noScout") : t("scouting.busyBody", { n: running })}</p>
        <div className="acoes-popup"><button type="button" onClick={() => ref.current?.close()}>{t("renewals.close")}</button></div>
      </div>
    </dialog>
  );
}


/** Observar um jogador a partir de fora da página de scouting (por exemplo no plantel de outro clube): avisa se os olheiros estão ocupados. */
export function ObservePlayer({ person, name, onClose }: { person: string; name: string; onClose: () => void }) {
  const engine = useEngine();
  const [data, setData] = useState<ScoutingData | undefined>(undefined);
  useEffect(() => { engine?.call("scouting", null).then(setData).catch(() => onClose()); }, [engine, onClose]);
  if (!data) return null;
  const running = data.orders.filter((o) => !o.done).length;
  if (running >= data.capacity) return <BusyDialog capacity={data.capacity} running={running} onClose={onClose} />;
  const known = data.rows.find((r) => r.id === person);
  const row: ScoutRow = known ?? ({ id: person, name, knowledge: "none", position: "", nationality: "", age: 0 } as unknown as ScoutRow);
  return <ObserveDialog row={row} data={data} onClose={onClose} onDone={onClose} />;
}
