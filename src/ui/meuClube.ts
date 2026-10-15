"use client";
import { useEffect, useState } from "react";
import { guardar, ler } from "@/ui/armazenamento";

/**
 * O clube que o gamer está a gerir. Provisório até haver onboarding (RZ-138): escolhe-se num seletor e fica guardado no
 * browser; todas as páginas do menu (Clube, Plantel, Jogos, Cidade, Hoje) reagem à mudança.
 */
const CHAVE = "raizes.meuClube";
const EVENTO = "raizes:meuClube";
const eTexto = (v: unknown): v is string => typeof v === "string";

export function useMeuClube(): [string | undefined, (id: string) => void, boolean] {
  const [id, setId] = useState<string | undefined>(undefined);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const atualizar = () => { setId(ler(CHAVE, eTexto)); setPronto(true); };
    atualizar();
    window.addEventListener(EVENTO, atualizar);
    return () => window.removeEventListener(EVENTO, atualizar);
  }, []);
  const definir = (novo: string) => {
    guardar(CHAVE, novo);
    window.dispatchEvent(new Event(EVENTO));
  };
  return [id, definir, pronto];
}
