"use client";
import { useCallback, useEffect, useState } from "react";
import type { NewsScope, NewsItem } from "@/engine/noticias/noticias";
import { NewsItemView } from "@/ui/components/ItemNoticia";
import { save, read } from "@/ui/armazenamento";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/MotorProvider";

const BY_PAGE = 20;
const SCOPES: NewsScope[] = ["club", "league", "world"];
const KEY = "raizes.news.scope";
const isScope = (v: unknown): v is NewsScope => v === "club" || v === "league" || v === "world";

/** Notícias (RZ-118): o que se passa com o teu clube, na tua liga e no mundo, tiradas do histórico. */
export default function NewsPage() {
  const { t } = useT();
  const engine = useEngine();
  const [scope, setScope] = useState<NewsScope>("league");
  const [list, setList] = useState<NewsItem[] | undefined>(undefined);
  const [end, setEnd] = useState(false);
  useEffect(() => { const g = read(KEY, isScope); if (g) setScope(g); }, []);

  const load = useCallback(async (beforeOf?: number) => {
    if (!engine) return;
    const fresh = await engine.call("news", { scope, limit: BY_PAGE, ...(beforeOf !== undefined ? { beforeOf } : {}) });
    setList((before) => (beforeOf === undefined ? fresh : [...(before ?? []), ...fresh]));
    setEnd(fresh.length < BY_PAGE);
  }, [engine, scope]);
  useEffect(() => {
    setList(undefined);
    void load().catch(() => setList([]));
    const reload = () => { void load().catch(() => undefined); };
    window.addEventListener("raizes:tempo", reload);
    return () => window.removeEventListener("raizes:tempo", reload);
  }, [load]);

  return (
    <section className="pagina-noticias">
      <h1>{t("noticias.titulo")}</h1>
      <div className="acoes" role="tablist" aria-label={t("noticias.titulo")}>
        {SCOPES.map((e) => (
          <button key={e} type="button" role="tab" aria-selected={scope === e} className={scope === e ? "active" : undefined} onClick={() => { setScope(e); save(KEY, e); }}>{t(`noticias.escopo.${e}` as Key)}</button>
        ))}
      </div>
      {list === undefined ? <p>{t("ficha.aCarregar")}</p> : list.length === 0 ? <p className="vazio">{t("noticias.vazio")}</p> : (
        <div className="noticias">
          {list.map((n) => <NewsItemView key={n.id} n={n} />)}
          {end ? <p className="suave">{t("noticias.semMais")}</p> : <button type="button" onClick={() => void load(list.at(-1)!.id)}>{t("noticias.maisAntigas")}</button>}
        </div>
      )}
    </section>
  );
}
