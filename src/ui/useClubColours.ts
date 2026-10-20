"use client";
import { useEffect, useState } from "react";
import type { ClientEngine } from "@/ui/engineClient";
import { useEngine } from "@/ui/EngineProvider";

/** Cores de todos os clubes (id → texto dos dados), pedidas uma só vez ao motor e partilhadas por todas as páginas. */
let cache: ReadonlyMap<string, string> | undefined;
let pendingRequest: Promise<void> | undefined;
const listeners = new Set<() => void>();

function fetchClubColours(engine: ClientEngine) {
  if (cache || pendingRequest) return;
  pendingRequest = engine.call("clubColours", null).then((cs) => {
    cache = new Map(cs.map((c) => [c.id, c.colours] as const));
    pendingRequest = undefined;
    listeners.forEach((f) => f());
  }).catch(() => { pendingRequest = undefined; });
}

export function useClubsColours(): ReadonlyMap<string, string> | undefined {
  const engine = useEngine();
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    if (engine) fetchClubColours(engine);
    return () => { listeners.delete(f); };
  }, [engine]);
  return cache;
}
