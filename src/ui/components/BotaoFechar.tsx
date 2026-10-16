"use client";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Cruz no canto de cima à direita dos popups que se fecham sem mais. */
export function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className="popup-fechar" aria-label={t("jogo.taticaFechar")} title={t("jogo.taticaFechar")} onClick={onClose}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    </button>
  );
}
