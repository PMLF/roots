"use client";
import { useCallback, useEffect, useState } from "react";
import { read, save } from "@/ui/storage";

/**
 * Lembrete de cópia de segurança (RZ-501): os saves vivem no armazenamento do browser, que pode ser apagado (sobretudo no
 * Safari). Se há mundo e passaram `REMIND_AFTER_DAYS` dias sem exportar um save, pede para exportar; «Mais tarde» adia.
 * É uma conveniência por pessoa: vive no localStorage e nunca no save.
 */
const REMIND_AFTER_DAYS = 14;
const SNOOZE_DAYS = 7;
const DAY_MS = 86_400_000;
const LAST = "raizes.backup.lastExport";
const SINCE = "raizes.backup.since";
const SNOOZE = "raizes.backup.snoozeUntil";
const isNumber = (v: unknown): v is number => typeof v === "number";

/** Chamar quando o gamer exporta um save. */
export function markExported(): void {
  save(LAST, Date.now());
}

export function useBackupReminder(hasWorld: boolean): { due: boolean; snooze: () => void } {
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!hasWorld) return;
    const now = Date.now();
    let since = read(SINCE, isNumber);
    if (since === undefined) { since = now; save(SINCE, now); }
    const last = Math.max(read(LAST, isNumber) ?? 0, since);
    setDue(now - last > REMIND_AFTER_DAYS * DAY_MS && now > (read(SNOOZE, isNumber) ?? 0));
  }, [hasWorld]);
  const snooze = useCallback(() => { save(SNOOZE, Date.now() + SNOOZE_DAYS * DAY_MS); setDue(false); }, []);
  return { due, snooze };
}
