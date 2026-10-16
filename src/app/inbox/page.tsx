"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Message } from "@/engine/news/news";
import { NewsItemView } from "@/ui/components/NewsItem";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";

const BY_PAGE = 25;

/** Caixa de entrada (RZ-118): resultados do teu jogo, lesões do plantel, a tua carreira. Cada mensagem pode marcar-se como lida ou por ler; há um botão para marcar todas. */
export default function InboxPage() {
  const { t } = useT();
  const engine = useEngine();
  const [messages, setMessages] = useState<Message[] | undefined>(undefined);
  const [unread, setReadItemsNot] = useState(0);
  const [end, setEnd] = useState(false);
  const [unemployed, setUnemployed] = useState(false);

  const load = useCallback(async (beforeOf?: number) => {
    if (!engine) return;
    const c = await engine.call("inbox", { limit: BY_PAGE, ...(beforeOf !== undefined ? { beforeOf } : {}) });
    setMessages((before) => (beforeOf === undefined ? c.messages : [...(before ?? []), ...c.messages]));
    if (beforeOf === undefined) setReadItemsNot(c.unread);
    setEnd(c.messages.length < BY_PAGE);
  }, [engine]);
  useEffect(() => {
    void load().catch(() => setMessages([]));
    engine?.call("offers", null).then((o) => setUnemployed(o.unemployed)).catch(() => undefined);
  }, [load, engine]);

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
          {messages.map((m) => <NewsItemView key={m.id} n={m} unread={!m.isRead} onToggleIsRead={() => void toggle(m)} />)}
          {!end && <button type="button" onClick={() => void load(messages.at(-1)!.id)}>{t("inbox.oldest")}</button>}
        </div>
      )}
    </section>
  );
}
