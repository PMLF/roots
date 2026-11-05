"use client";
import { useEffect, useState } from "react";
import { save, read } from "@/ui/storage";

/**
 * Modo developer: ferramentas (Laboratório, Mundo, escolher clube, simular época, «Ver tudo») que não são «jogar o jogo».
 * Está sempre desligado para quem joga, em qualquer build. Liga-se a quem desenvolve abrindo qualquer página com `?dev=1`
 * (fica guardado neste browser) e desliga-se com `?dev=0`.
 */
const DEV_KEY = "raizes.dev";
const DEV_EVENT = "raizes:dev";
const isFlag = (v: unknown): v is boolean => typeof v === "boolean";

export function useDevMode(): boolean {
  const [dev, setDev] = useState(false);
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("dev");
    if (asked === "1" || asked === "0") {
      save(DEV_KEY, asked === "1");
      const url = new URL(window.location.href);
      url.searchParams.delete("dev");
      window.history.replaceState(window.history.state, "", url);
      window.dispatchEvent(new Event(DEV_EVENT));
    }
    const sync = () => setDev(read(DEV_KEY, isFlag) === true);
    sync();
    window.addEventListener(DEV_EVENT, sync);
    return () => window.removeEventListener(DEV_EVENT, sync);
  }, []);
  return dev;
}

/**
 * «Ver tudo» (só no modo developer): mostra a verdade oculta (atributos, potencial, personalidade, finanças…) em vez do
 * que o gamer sabe. Guardado no browser; todas as páginas reagem à mudança.
 */
const ALL_SEE_KEY = "raizes.seeAll";
const ALL_SEE_EVENT = "raizes:verTudo";

function readSeeAll(): boolean {
  return read(ALL_SEE_KEY, (v): v is boolean => typeof v === "boolean") === true;
}

export function useSeeAll(): [boolean, (v: boolean) => void] {
  const dev = useDevMode();
  const [value, setValue] = useState(false);
  useEffect(() => {
    setValue(readSeeAll());
    const onChange = () => setValue(readSeeAll());
    window.addEventListener(ALL_SEE_EVENT, onChange);
    return () => window.removeEventListener(ALL_SEE_EVENT, onChange);
  }, []);
  const set = (v: boolean) => {
    save(ALL_SEE_KEY, v);
    window.dispatchEvent(new Event(ALL_SEE_EVENT));
  };
  return [dev && value, set];
}
