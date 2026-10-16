"use client";
import { useCallback, useEffect, useState } from "react";
import type { TimeState, Mode, AdvanceResult } from "@/engine/season/advance";
import { useOwnClub } from "@/ui/myClub";
import { useEngine } from "@/ui/EngineProvider";

/** O tempo do save (data, época, jogos por jogar) e o botão Avançar. Todas as páginas partilham o mesmo estado. */
const EVENT = "raizes:tempo";
let last: AdvanceResult | undefined;
let advancing = false;

export function useTime() {
  const engine = useEngine();
  const [club] = useOwnClub();
  const [state, setState] = useState<TimeState | null | undefined>(undefined);
  const [, force] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pause, setPause] = useState<{ match: string; opponent: string; atHome: boolean; ongoing: boolean } | undefined>(undefined);
  const [nextMatch, setNextMatch] = useState<{ id: string; date: string; competition: string; opponent: string; atHome: boolean; confirmed: boolean; ongoing: boolean; opponentId: string; opponentColours: string } | undefined>(undefined);

  useEffect(() => {
    if (!engine) return;
    let live = true;
    const load = () => {
      engine.call("worldState", null).then((m) => (m ? engine.call("timeState", null) : null)).then(async (e) => {
        if (!live) return;
        setState(e);
        // há jogo do teu clube hoje, por confirmar?
        const p = e ? await engine.call("plan", null) : null;
        const j = p?.nextMatch;
        if (live) setNextMatch(e ? j : undefined);
        if (live) setPause(e && j && j.date === e.today && !j.confirmed ? { match: j.id, opponent: j.opponent, atHome: j.atHome, ongoing: j.ongoing } : undefined);
      }).catch(() => live && setState(null));
    };
    const onChange = () => { force((n) => n + 1); load(); };
    load();
    window.addEventListener(EVENT, onChange);
    window.addEventListener("raizes:mundo", onChange);
    return () => { live = false; window.removeEventListener(EVENT, onChange); window.removeEventListener("raizes:mundo", onChange); };
  }, [engine]);

  const advance = useCallback(async (mode: Mode): Promise<AdvanceResult | undefined> => {
    if (!engine || advancing) return undefined;
    advancing = true;
    window.dispatchEvent(new Event(EVENT));
    try {
      last = await engine.call("advance", { mode, ...(club ? { club } : {}) });
      setError(undefined);
      return last;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      advancing = false;
      window.dispatchEvent(new Event(EVENT));
    }
  }, [engine, club]);

  return { state, last, advancing, advance, error, pause, nextMatch };
}
