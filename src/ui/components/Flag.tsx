"use client";
import { useCountries } from "@/ui/useCountries";

/** Bandeira (emoji) a partir do id do país (código ISO de duas letras); o nome fica no tooltip. */
function flagEmoji(id: string): string {
  return /^[a-z]{2}$/i.test(id) ? String.fromCodePoint(...[...id.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "";
}

export function Flag({ id }: { id: string }) {
  const country = useCountries();
  const name = country(id);
  return <span className="bandeira" role="img" aria-label={name} title={name}>{flagEmoji(id) || name}</span>;
}
