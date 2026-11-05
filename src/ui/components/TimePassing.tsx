"use client";
import { useEffect, useState } from "react";
import type { NewsItem } from "@/engine/news/news";
import { NewsItemView } from "@/ui/components/NewsItem";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";

/**
 * Tempo a passar: véu sobre o ecrã todo que bloqueia cliques e teclas enquanto o avanço decorre, com uma caixa ao centro a dizer que o jogo
 * está a carregar e, por baixo, a notícia mais recente. A caixa só aparece passado um instante, para os avanços rápidos não piscarem.
 */
export function TimePassing({ active }: { active: boolean }) {
  const { t } = useT();
  const engine = useEngine();
  const [recent, setRecent] = useState<NewsItem | undefined>(undefined);

  useEffect(() => {
    if (!active || !engine) return;
    let live = true;
    engine.call("news", { scope: "relevant", limit: 1 }).then((r) => { if (live) setRecent(r[0]); }).catch(() => undefined);
    // enquanto passa o tempo nada recebe teclas (Tab, Enter, Espaço…), para não haver ações a meio do avanço
    const block = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener("keydown", block, true);
    return () => { live = false; window.removeEventListener("keydown", block, true); };
  }, [active, engine]);

  return (
    <div className={`tempo-passa${active ? " ativo" : ""}`} role={active ? "alertdialog" : undefined} aria-modal={active || undefined} aria-busy={active || undefined} aria-hidden={active ? undefined : true} aria-label={t("advance.loading")} data-testid="time-passing">
      {active && (
        <div className="tempo-caixa">
          <b><span className="rodar" aria-hidden="true" />{t("advance.loading")}</b>
          <p className="suave">{t("advance.loadingHint")}</p>
          {recent && (
            <div className="tempo-noticia">
              <small className="suave">{t("advance.recentNews")}</small>
              <NewsItemView n={recent} compact />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
