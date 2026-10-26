"use client";
import type { NewsItem } from "@/engine/news/news";
import Link from "next/link";
import type { ReactNode } from "react";
import { EntityLink } from "@/ui/components/Link";
import { Icon } from "@/ui/components/Icon";
import type { Key } from "@/ui/i18n";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { TallCard } from "@/ui/components/TallCard";
import { useOwnClub } from "@/ui/myClub";
import { useT } from "@/ui/i18n/LocaleProvider";
import { councilSpeech } from "@/ui/councilSpeech";
import { profileHref, TAB_URL } from "@/ui/links";

/** Uma notícia ou mensagem: título, frase de apoio e ligações para as fichas. O texto vem das chaves `newsItem.<type>.<n>.*`. */
export function NewsItemView({ n, unread, compact, onToggleIsRead, action, status }: { n: NewsItem; /** Botões para responder (proposta em aberto). */ action?: ReactNode; /** Estado da mensagem que pede decisão: por responder, respondida, expirada (RZ-164). */ status?: ReactNode; unread?: boolean; compact?: boolean; /** Na caixa de entrada: marcar como lida ou por ler. */ onToggleIsRead?: () => void }) {
  const { t, locale } = useT();
  const [mine] = useOwnClub();
  const type = n.type === "outcome" ? `outcome.${n.values.outcome}` : n.type === "city_event" ? `city.${n.values.event}` : n.type;
  const values = { ...n.values } as Record<string, string | number>;
  if (n.type === "locality") {
    values.from = t(`status.${values.from}` as Key).toLowerCase();
    values.to = t(`status.${values.to}` as Key).toLowerCase();
  }
  if (typeof values.fee === "number") values.fee = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(values.fee);
  const tone = n.type === "bid_agreed" ? "ok" : n.type === "bid_rejected" ? "erro" : undefined;
  if (n.type === "europe_phase") values.zoneText = t(`newsItem.europe_phase.zone.${values.zone}` as Key);
  if (n.type === "europe_qualifier") values.outcomeText = t(values.won === 1 ? "newsItem.europe_qualifier.won" : "newsItem.europe_qualifier.lost", { opponent: String(values.opponent) });
  if (n.type === "council_reply") {
    const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
    values.speech = councilSpeech(t, { approved: values.outcome === "yes", reason: String(values.reason), tone: String(values.tone), kind: String(values.kind), amount: Number(values.amount) }, money);
  }
  if (n.type === "election_result") {
    values.reelected = t(`newsItem.election_result.reelected.${values.reelected}` as Key);
    values.backed = t(`newsItem.election_result.backed.${values.backed}` as Key);
  }
  if (n.type === "patron_offer") values.naming = values.counterpart === "naming" ? t("newsItem.patron_offer.naming") : "";
  if (n.type === "election_campaign") values.date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${values.date}T00:00:00Z`));
  const toSquad = n.type === "youth_intake";
  const toScouting = n.type === "scout_search" || n.type === "scout_report";
  const base = `newsItem.${type}.${n.variant}`;
  // acontecimentos importantes do teu clube: cartão alto com as cores do clube (RZ-247)
  const europe = n.type === "europe_qualified" || n.type === "europe_draw" || n.type === "europe_phase" || n.type === "europe_qualifier";
  if (n.type === "youth_intake" || n.type === "local_talent" || n.type === "transfer_offer" || n.type === "loan_offer" || n.type === "youth_offer" || (europe && n.ofClubYour)) {
    const clubId = n.type === "transfer_offer" || n.type === "loan_offer" || n.type === "youth_offer" || europe ? n.links.find((l) => l.k === "club")?.id : mine;
    return (
      <TallCard clubId={clubId} unread={unread} title={t(`${base}.title` as Key, values)}
        details={<>{n.date}{status}{n.links.filter((l) => l.k === "person").slice(0, 3).map((l) => <span key={l.id}> · <EntityLink k="person" id={l.id}>{l.name}</EntityLink></span>)}</>}
        actions={<>
          {action}
          {toSquad && <Link href="/squad/" className="ligacao-botao">{t("youth.viewSquad")}</Link>}
          {n.type === "local_talent" && n.links[0] && <Link href={`${profileHref("city", n.links[0].id)}&tab=${TAB_URL.talent}`} className="ligacao-botao">{t("youth.viewTalent")}</Link>}
          {onToggleIsRead && <button type="button" className="ligacao-botao" onClick={onToggleIsRead}>{t(unread ? "inbox.markRead" : "inbox.markUnread")}</button>}
        </>}>
        <p>{t(`${base}.body` as Key, values)}</p>
      </TallCard>
    );
  }
  // cores dos clubes a que a notícia se refere (no máximo dois), para identificar de relance
  const swatches = [...new Set(n.links.filter((l) => l.k === "club").map((l) => l.id))].slice(0, 2).map((id) => <ClubSwatch key={id} id={id} />);
  if (compact) {
    return (
      <article className={`noticia noticia-compacta${unread ? " nao-lida" : ""}`}>
        <h3>{onToggleIsRead ? <button type="button" className={`ponto-alternar${unread ? " por-ler" : ""}`} onClick={onToggleIsRead} title={t(unread ? "inbox.markRead" : "inbox.markUnread")} aria-label={t(unread ? "inbox.markRead" : "inbox.markUnread")} /> : unread && <span className="ponto" role="img" aria-label={t("inbox.unreadItem")} />}{swatches}{toSquad ? <Link href="/squad/">{t(`${base}.title` as Key, values)}</Link> : toScouting ? <Link href="/scouting/">{t(`${base}.title` as Key, values)}</Link> : t(`${base}.title` as Key, values)}</h3>
        <p className="suave">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${n.date}T00:00:00Z`))}{n.links.filter((l) => l.k === "person").map((l) => <span key={l.id}> · <EntityLink k="person" id={l.id}>{l.name}</EntityLink></span>)}</p>
      </article>
    );
  }
  return (
    <article className={`noticia${unread ? " nao-lida" : ""}${n.ofClubYour ? " do-teu-clube" : ""}${tone ? ` noticia-${tone}` : ""}`}>
      <h3>{unread && <span className="ponto" role="img" aria-label={t("inbox.unreadItem")} />}{tone && <span className={`selo-resultado ${tone}`}><Icon name={tone === "ok" ? "check" : "close"} /></span>}{swatches}{t(`${base}.title` as Key, values)}</h3>
      <p>{t(`${base}.body` as Key, values)}</p>
      {(status || action) && <p className="noticia-decisao">{status}{action}</p>}
      {toScouting && <p><Link href="/scouting/" className="ligacao-botao">{t("scouting.viewFound")}</Link></p>}
      {toSquad && <p><Link href="/squad/" className="ligacao-botao">{t("youth.viewSquad")}</Link></p>}
      <p className="suave noticia-rodape">
        {n.date} · {n.links.map((l, i) => <span key={`${l.k}-${l.id}`}>{i > 0 && " · "}<EntityLink k={l.k} id={l.id}>{l.name}</EntityLink></span>)}
        {onToggleIsRead && <button type="button" className="ligacao-botao" onClick={onToggleIsRead}>{t(unread ? "inbox.markRead" : "inbox.markUnread")}</button>}
      </p>
    </article>
  );
}
