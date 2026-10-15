"use client";
import { useEffect, useState } from "react";
import { ler } from "@/ui/armazenamento";

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
