"use client";
import { useEffect, useState } from "react";
import type { Message as InboxMessage } from "@/engine/news/news";
import { useEngine } from "@/ui/EngineProvider";

const EVENTS = ["raizes:tempo", "raizes:mundo", "raizes:meuClube", "raizes:caixa"];

/** Quantas mensagens por ler tem o gamer (o contador do menu). Atualiza com o tempo, o clube e a leitura. */
export function useInboxUnread(): number {
  const engine = useEngine();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    const load = () => {
      engine.call("worldState", null).then((m) => (m ? engine.call("inbox", { limit: 1 }) : null)).then((c) => live && setN(c?.unread ?? 0)).catch(() => undefined);
    };
    load();
    for (const e of ["raizes:tempo", "raizes:mundo", "raizes:meuClube", "raizes:caixa"]) window.addEventListener(e, load);
    return () => { live = false; for (const e of ["raizes:tempo", "raizes:mundo", "raizes:meuClube", "raizes:caixa"]) window.removeEventListener(e, load); };
  }, [engine]);
  return n;
}

/** As mensagens mais recentes da caixa e quantas estão por ler (cartão da página inicial). Não as marca como lidas. */
export function useRecentInbox(limit: number): { messages: InboxMessage[]; unread: number } {
  const engine = useEngine();
  const [r, setR] = useState<{ messages: InboxMessage[]; unread: number }>({ messages: [], unread: 0 });
  useEffect(() => {
    if (!engine) return;
    let live = true;
    const load = () => {
      engine.call("worldState", null).then((m) => (m ? engine.call("inbox", { limit }) : null)).then((c) => live && setR(c ?? { messages: [], unread: 0 })).catch(() => undefined);
    };
    load();
    for (const e of EVENTS) window.addEventListener(e, load);
    return () => { live = false; for (const e of EVENTS) window.removeEventListener(e, load); };
  }, [engine, limit]);
  return r;
}
