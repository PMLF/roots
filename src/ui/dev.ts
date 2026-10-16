"use client";
import { useEffect, useState } from "react";
import { save, read } from "@/ui/armazenamento";

/**
 * Modo developer: páginas de ferramentas (Laboratório, Mundo) que não são «jogar o jogo».
 * Ligado em `pnpm dev` e em builds com `NEXT_PUBLIC_RAIZES_DEV=1`; num build normal só se alguém o ligar no seu
 * browser com `localStorage.setItem("raizes.dev", "true")`. Nunca aparece a quem só joga.
 */
const daBuild = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_RAIZES_DEV === "1";

export function useDevMode(): boolean {
  const [dev, setDev] = useState(false);
  useEffect(() => {
    setDev(daBuild || read("raizes.dev", (v): v is boolean => typeof v === "boolean") === true);
  }, []);
  return dev;
}

/**
 * «Ver tudo» (só no modo developer): mostra a verdade oculta (atributos, potencial, personalidade, finanças…) em vez do
 * que o gamer sabe. Guardado no browser; todas as páginas reagem à mudança.
 */
const ALL_SEE_KEY = "raizes.verTudo";
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
