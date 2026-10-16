"use client";
import { useEffect, useState } from "react";
import { useEngine } from "@/ui/EngineProvider";

let cache: Record<string, string> | undefined;

/** Nome do país a partir do id (`pt` → «Portugal»). Carrega-se uma vez. */
export function useCountries(): (id: string) => string {
  const engine = useEngine();
  const [map, setMap] = useState<Record<string, string>>(cache ?? {});
  useEffect(() => {
    if (cache || !engine) return;
    let live = true;
    engine.call("countries", null).then((list) => {
      cache = Object.fromEntries(list.map((p) => [p.id, p.name]));
      if (live) setMap(cache);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [engine]);
  return (id) => map[id] ?? id;
}
