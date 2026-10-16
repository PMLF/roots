import { IntlMessageFormat } from "intl-messageformat";
import ptPT from "./pt-PT.json";
import en from "./en.json";

export type Locale = "pt-PT" | "en";
export const LOCALES: readonly Locale[] = ["pt-PT", "en"];
export const DEFAULT_LOCALE: Locale = "pt-PT";

/** Chaves tipadas a partir do catálogo base (pt-PT). O inglês tem de ter exatamente as mesmas (há um teste). */
export type Key = keyof typeof ptPT;

const catalogues: Record<Locale, Record<string, string>> = { "pt-PT": ptPT, en };
const cache = new Map<string, IntlMessageFormat>();

export function translate(locale: Locale, rowKey: Key, values?: Record<string, string | number>): string {
  const text = catalogues[locale][rowKey] ?? catalogues[DEFAULT_LOCALE][rowKey] ?? rowKey;
  const k = `${locale}|${rowKey}`;
  let fmt = cache.get(k);
  if (!fmt) {
    fmt = new IntlMessageFormat(text, locale);
    cache.set(k, fmt);
  }
  return String(fmt.format(values));
}

export function catalogue(locale: Locale): Record<string, string> {
  return catalogues[locale];
}
