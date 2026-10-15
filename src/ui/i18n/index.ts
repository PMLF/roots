import { IntlMessageFormat } from "intl-messageformat";
import ptPT from "./pt-PT.json";
import en from "./en.json";

export type Locale = "pt-PT" | "en";
export const LOCALES: readonly Locale[] = ["pt-PT", "en"];
export const LOCALE_PADRAO: Locale = "pt-PT";

/** Chaves tipadas a partir do catálogo base (pt-PT). O inglês tem de ter exatamente as mesmas (há um teste). */
export type Chave = keyof typeof ptPT;

const catalogos: Record<Locale, Record<string, string>> = { "pt-PT": ptPT, en };
const cache = new Map<string, IntlMessageFormat>();

export function traduzir(locale: Locale, chave: Chave, valores?: Record<string, string | number>): string {
  const texto = catalogos[locale][chave] ?? catalogos[LOCALE_PADRAO][chave] ?? chave;
  const k = `${locale}|${chave}`;
  let fmt = cache.get(k);
  if (!fmt) {
    fmt = new IntlMessageFormat(texto, locale);
    cache.set(k, fmt);
  }
  return String(fmt.format(valores));
}

export function catalogo(locale: Locale): Record<string, string> {
  return catalogos[locale];
}
