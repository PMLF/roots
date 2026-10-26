"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Message } from "@/engine/news/news";
import type { CampaignView, OfferView } from "@/engine/api/contracts";
import type { Decision } from "@/engine/news/decisions";
import { CampaignDialog } from "@/ui/components/CampaignDialog";
import { OfferDialog } from "@/ui/components/OfferDialog";
import { NewsItemView } from "@/ui/components/NewsItem";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";

const BY_PAGE = 25;

/** Caixa de entrada (RZ-118): resultados do teu jogo, lesões do plantel, a tua carreira. Cada mensagem pode marcar-se como lida ou por ler; há um botão para marcar todas. */
export default function InboxPage() {
  return <Suspense fallback={null}><Inbox /></Suspense>;
}

function Inbox() {
  const { t, locale } = useT();
  const params = useSearchParams();
  const focus = Number(params.get("foco")) || undefined;
  const wantedOffer = params.get("oferta");
  const engine = useEngine();
  const [messages, setMessages] = useState<Message[] | undefined>(undefined);
  const [unread, setReadItemsNot] = useState(0);
  const [end, setEnd] = useState(false);
  const [unemployed, setUnemployed] = useState(false);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [answering, setAnswering] = useState<OfferView | undefined>(undefined);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const loadDecisions = useCallback(() => { engine?.call("inboxDecisions", null).then(setDecisions).catch(() => undefined); }, [engine]);
  useEffect(loadDecisions, [loadDecisions]);
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const answerPatron = async (ref: string, accept: boolean) => {
    await engine?.call("patronReply", { id: Number(ref), accept });
    window.dispatchEvent(new Event("raizes:caixa"));
    loadDecisions();
  };
  const acceptClub = async (club: string) => {
    try {
      await engine?.call("acceptOffer", { id: club });
      window.dispatchEvent(new Event("raizes:meuClube"));
      window.dispatchEvent(new Event("raizes:tempo"));
      loadDecisions();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const openCampaign = () => { engine?.call("campaign", null).then(setCampaign).catch(() => undefined); };
  const loadOffers = useCallback(() => { engine?.call("transferOffers", null).then(setOffers).catch(() => undefined); }, [engine]);
  useEffect(loadOffers, [loadOffers]);

  const load = useCallback(async (beforeOf?: number) => {
    if (!engine) return;
    const c = await engine.call("inbox", { limit: focus !== undefined && beforeOf === undefined ? 300 : BY_PAGE, ...(beforeOf !== undefined ? { beforeOf } : {}) });
    setMessages((before) => (beforeOf === undefined ? c.messages : [...(before ?? []), ...c.messages]));
    if (beforeOf === undefined) setReadItemsNot(c.unread);
    setEnd(c.messages.length < (focus !== undefined && beforeOf === undefined ? 300 : BY_PAGE));
  }, [engine, focus]);
  useEffect(() => {
    void load().catch(() => setMessages([]));
    engine?.call("offers", null).then((o) => setUnemployed(o.unemployed)).catch(() => undefined);
  }, [load, engine]);

  // «Avançar» leva à mensagem por ler mais antiga: mostra-a e destaca-a; ou abre a proposta que falta responder
  useEffect(() => {
    if (focus === undefined || !messages) return;
    document.getElementById(`msg-${focus}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus, messages]);
  useEffect(() => {
    if (!wantedOffer) return;
    const o = offers.find((x) => x.person === wantedOffer);
    if (o) setAnswering(o);
  }, [wantedOffer, offers]);

  const score = async () => {
    await engine?.call("markInboxRead", null);
    window.dispatchEvent(new Event("raizes:caixa"));
    setMessages((m) => m?.map((x) => ({ ...x, isRead: true })));
    setReadItemsNot(0);
  };
  const toggle = async (m: Message) => {
    const isRead = !m.isRead;
    await engine?.call("markMessage", { id: m.id, isRead });
    window.dispatchEvent(new Event("raizes:caixa"));
    setMessages((l) => l?.map((x) => (x.id === m.id ? { ...x, isRead } : x)));
    setReadItemsNot((n) => Math.max(0, n + (isRead ? -1 : 1)));
  };

  return (
    <section className="pagina-noticias">
      <h1>{t("inbox.title")}</h1>
      <div className="acoes">
        <b>{t("inbox.unread", { n: unread })}</b>
        <button type="button" onClick={() => void score()} disabled={unread === 0}>{t("inbox.markAllRead")}</button>
        {unemployed && <Link href="/">{t("inbox.seeOffers")}</Link>}
      </div>
      {messages === undefined ? <p>{t("profile.loading")}</p> : messages.length === 0 ? <p className="vazio">{t("inbox.empty")}</p> : (
        <div className="noticias">
          {messages.map((m) => {
            const open = m.type === "transfer_offer" || m.type === "loan_offer" || m.type === "youth_offer" ? offers.find((o) => m.links.some((l) => l.k === "person" && l.id === o.person)) : undefined;
            const dec = decisions[m.id];
            const pending = dec?.state === "pending";
            const status = dec ? (
              <span className={`estado-decisao estado-${dec.state}${dec.answer ? ` resposta-${dec.answer}` : ""}`} data-testid={`decisao-${dec.state}`}>
                {dec.state === "pending" ? (dec.until ? t("decision.pendingUntil", { date: day(dec.until) }) : t("decision.pending")) : dec.state === "expired" ? t("decision.expired") : t(`decision.${dec.answer ?? "accepted"}` as Key)}
              </span>
            ) : undefined;
            const actions = !pending || !dec ? undefined : dec.kind === "patron" ? (
              <>
                <button type="button" className="primario" onClick={() => void answerPatron(dec.ref, true)} data-testid="mecenas-aceitar">{t("decision.accept")}</button>
                <button type="button" onClick={() => void answerPatron(dec.ref, false)} data-testid="mecenas-recusar">{t("decision.decline")}</button>
              </>
            ) : dec.kind === "campaign" ? (
              <button type="button" className="primario" onClick={openCampaign}>{t("decision.decide")}</button>
            ) : dec.kind === "clubOffer" ? (
              <>
                <button type="button" className="primario" onClick={() => void acceptClub(dec.ref)}>{t("decision.accept")}</button>
                <Link href={`/contract/?club=${encodeURIComponent(dec.ref)}`} className="ligacao-botao">{t("decision.negotiate")}</Link>
              </>
            ) : open ? <button type="button" className="primario" onClick={() => setAnswering(open)}>{t("offer.answer")}</button> : undefined;
            return <div key={m.id} id={`msg-${m.id}`} className={m.id === focus ? "mensagem-foco" : undefined}><NewsItemView n={m} unread={!m.isRead} onToggleIsRead={() => void toggle(m)} {...(status ? { status } : {})} {...(actions ? { action: actions } : {})} /></div>;
          })}
          {answering && <OfferDialog offer={answering} onClose={() => { setAnswering(undefined); loadOffers(); loadDecisions(); }} onAnswered={loadOffers} />}
          {campaign && <CampaignDialog campaign={campaign} onClose={() => { setCampaign(null); loadDecisions(); }} onAnswered={() => { window.dispatchEvent(new Event("raizes:caixa")); loadDecisions(); }} />}
          {error && <p className="erro">{error}</p>}
          {!end && <button type="button" onClick={() => void load(messages.at(-1)!.id)}>{t("inbox.oldest")}</button>}
        </div>
      )}
    </section>
  );
}
