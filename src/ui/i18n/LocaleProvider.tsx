"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALES, DEFAULT_LOCALE, translate, type Key, type Locale } from "./index";

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (rowKey: Key, values?: Record<string, string | number>) => string };
const LocaleCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "raizes.locale";

function readSaved(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null;
  } catch {
    return null;
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = readSaved();
    if (saved) setLocaleState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* armazenamento indisponível: só não se lembra */ }
  }, []);
  const t = useCallback((rowKey: Key, values?: Record<string, string | number>) => translate(locale, rowKey, values), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useT(): Ctx {
  const c = useContext(LocaleCtx);
  if (!c) throw new Error("useT fora do LocaleProvider");
  return c;
}
