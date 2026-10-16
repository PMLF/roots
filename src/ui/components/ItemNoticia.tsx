"use client";
import type { NewsItem } from "@/engine/noticias/noticias";
import { EntityLink } from "@/ui/components/Ligacao";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Uma notícia ou mensagem: título, frase de apoio e ligações para as fichas. O texto vem das chaves `noticia.<tipo>.<n>.*`. */
export function NewsItemView({ n, unread, compact, onToggleIsRead }: { n: NewsItem; unread?: boolean; compact?: boolean; /** Na caixa de entrada: marcar como lida ou por ler. */ onToggleIsRead?: () => void }) {
  const { t, locale } = useT();
  const type = n.type === "outcome" ? `resultado.${n.values.resultado}` : n.type === "cidade_evento" ? `cidade.${n.values.evento}` : n.type;
  const values = { ...n.values } as Record<string, string | number>;
  if (n.type === "locality") {
    values.de = t(`estatuto.${values.de}` as Key).toLowerCase();
    values.para = t(`estatuto.${values.para}` as Key).toLowerCase();
  }
  const base = `noticia.${type}.${n.variant}`;
  if (compact) {
    return (
      <article className={`noticia noticia-compacta${unread ? " nao-lida" : ""}`}>
        <h3>{onToggleIsRead ? <button type="button" className={`ponto-alternar${unread ? " por-ler" : ""}`} onClick={onToggleIsRead} title={t(unread ? "caixa.marcarLida" : "caixa.marcarPorLer")} aria-label={t(unread ? "caixa.marcarLida" : "caixa.marcarPorLer")} /> : unread && <span className="ponto" role="img" aria-label={t("caixa.naoLida")} />}{t(`${base}.titulo` as Key, values)}</h3>
        <p className="suave">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${n.date}T00:00:00Z`))}</p>
      </article>
    );
  }
  return (
    <article className={`noticia${unread ? " nao-lida" : ""}${n.ofClubYour ? " do-teu-clube" : ""}`}>
      <h3>{unread && <span className="ponto" role="img" aria-label={t("caixa.naoLida")} />}{t(`${base}.titulo` as Key, values)}</h3>
      <p>{t(`${base}.corpo` as Key, values)}</p>
      <p className="suave noticia-rodape">
        {n.date} · {n.links.map((l, i) => <span key={`${l.k}-${l.id}`}>{i > 0 && " · "}<EntityLink k={l.k} id={l.id}>{l.name}</EntityLink></span>)}
        {onToggleIsRead && <button type="button" className="ligacao-botao" onClick={onToggleIsRead}>{t(unread ? "caixa.marcarLida" : "caixa.marcarPorLer")}</button>}
      </p>
    </article>
  );
}
