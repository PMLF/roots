"use client";
import { useEffect, useState } from "react";
import { useEngine } from "@/ui/EngineProvider";

let cache: Record<string, string> | undefined;
/** Pedido em curso: todas as bandeiras de uma página partilham o mesmo pedido ao motor. */
let loading: Promise<Record<string, string>> | undefined;

/** Nome do país a partir do id (`pt` → «Portugal»). Carrega-se uma vez. */
export function useCountries(): (id: string) => string {
  const engine = useEngine();
  const [map, setMap] = useState<Record<string, string>>(cache ?? {});
  useEffect(() => {
    if (cache || !engine) return;
    let live = true;
    loading ??= engine.call("countries", null).then((list) => (cache = Object.fromEntries(list.map((p) => [p.id, p.name]))));
    loading.then((c) => { if (live) setMap(c); }).catch(() => { loading = undefined; });
    return () => { live = false; };
  }, [engine]);
  return (id) => map[id] ?? id;
}
