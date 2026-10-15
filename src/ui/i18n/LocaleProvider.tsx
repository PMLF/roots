"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, LOCALE_PADRAO, traduzir, type Chave, type Locale } from "./index";

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (chave: Chave, valores?: Record<string, string | number>) => string };
const LocaleCtx = createContext<Ctx | null>(null);
const CHAVE_ARMAZENAMENTO = "raizes.locale";

function lerGuardado(): Locale | null {
  try {
    const v = window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
    return v && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null;
  } catch {
    return null;
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(LOCALE_PADRAO);

  useEffect(() => {
    const guardado = lerGuardado();
    if (guardado) setLocaleState(guardado);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { window.localStorage.setItem(CHAVE_ARMAZENAMENTO, l); } catch { /* armazenamento indisponível: só não se lembra */ }
  }, []);
  const t = useCallback((chave: Chave, valores?: Record<string, string | number>) => traduzir(locale, chave, valores), [locale]);
  const valor = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleCtx.Provider value={valor}>{children}</LocaleCtx.Provider>;
}

export function useT(): Ctx {
  const c = useContext(LocaleCtx);
  if (!c) throw new Error("useT fora do LocaleProvider");
  return c;
}
