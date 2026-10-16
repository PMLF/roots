"use client";
import type { NewsItem } from "@/engine/news/news";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Uma notícia ou mensagem: título, frase de apoio e ligações para as fichas. O texto vem das chaves `newsItem.<type>.<n>.*`. */
export function NewsItemView({ n, unread, compact, onToggleIsRead }: { n: NewsItem; unread?: boolean; compact?: boolean; /** Na caixa de entrada: marcar como lida ou por ler. */ onToggleIsRead?: () => void }) {
  const { t, locale } = useT();
  const type = n.type === "outcome" ? `outcome.${n.values.outcome}` : n.type === "city_event" ? `city.${n.values.event}` : n.type;
  const values = { ...n.values } as Record<string, string | number>;
  if (n.type === "locality") {
    values.from = t(`status.${values.from}` as Key).toLowerCase();
    values.to = t(`status.${values.to}` as Key).toLowerCase();
  }
  const base = `newsItem.${type}.${n.variant}`;
  if (compact) {
    return (
      <article className={`noticia noticia-compacta${unread ? " nao-lida" : ""}`}>
        <h3>{onToggleIsRead ? <button type="button" className={`ponto-alternar${unread ? " por-ler" : ""}`} onClick={onToggleIsRead} title={t(unread ? "inbox.markRead" : "inbox.markUnread")} aria-label={t(unread ? "inbox.markRead" : "inbox.markUnread")} /> : unread && <span className="ponto" role="img" aria-label={t("inbox.unread")} />}{t(`${base}.title` as Key, values)}</h3>
        <p className="suave">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${n.date}T00:00:00Z`))}</p>
      </article>
    );
  }
  return (
    <article className={`noticia${unread ? " nao-lida" : ""}${n.ofClubYour ? " do-teu-clube" : ""}`}>
      <h3>{unread && <span className="ponto" role="img" aria-label={t("inbox.unread")} />}{t(`${base}.title` as Key, values)}</h3>
      <p>{t(`${base}.body` as Key, values)}</p>
      <p className="suave noticia-rodape">
        {n.date} · {n.links.map((l, i) => <span key={`${l.k}-${l.id}`}>{i > 0 && " · "}<EntityLink k={l.k} id={l.id}>{l.name}</EntityLink></span>)}
        {onToggleIsRead && <button type="button" className="ligacao-botao" onClick={onToggleIsRead}>{t(unread ? "inbox.markRead" : "inbox.markUnread")}</button>}
      </p>
    </article>
  );
}
