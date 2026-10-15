"use client";
import { useEffect, useState } from "react";
import { guardar, ler } from "@/ui/armazenamento";

/**
 * Modo developer: páginas de ferramentas (Laboratório, Mundo) que não são «jogar o jogo».
 * Ligado em `pnpm dev` e em builds com `NEXT_PUBLIC_RAIZES_DEV=1`; num build normal só se alguém o ligar no seu
 * browser com `localStorage.setItem("raizes.dev", "true")`. Nunca aparece a quem só joga.
 */
const daBuild = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_RAIZES_DEV === "1";

export function useModoDev(): boolean {
  const [dev, setDev] = useState(false);
  useEffect(() => {
    setDev(daBuild || ler("raizes.dev", (v): v is boolean => typeof v === "boolean") === true);
  }, []);
  return dev;
}

/**
 * «Ver tudo» (só no modo developer): mostra a verdade oculta (atributos, potencial, personalidade, finanças…) em vez do
 * que o gamer sabe. Guardado no browser; todas as páginas reagem à mudança.
 */
const CHAVE_VER_TUDO = "raizes.verTudo";
const EVENTO_VER_TUDO = "raizes:verTudo";

function lerVerTudo(): boolean {
  return ler(CHAVE_VER_TUDO, (v): v is boolean => typeof v === "boolean") === true;
}

export function useVerTudo(): [boolean, (v: boolean) => void] {
  const dev = useModoDev();
  const [valor, setValor] = useState(false);
  useEffect(() => {
    setValor(lerVerTudo());
    const aoMudar = () => setValor(lerVerTudo());
    window.addEventListener(EVENTO_VER_TUDO, aoMudar);
    return () => window.removeEventListener(EVENTO_VER_TUDO, aoMudar);
  }, []);
  const definir = (v: boolean) => {
    guardar(CHAVE_VER_TUDO, v);
    window.dispatchEvent(new Event(EVENTO_VER_TUDO));
  };
  return [dev && valor, definir];
}
