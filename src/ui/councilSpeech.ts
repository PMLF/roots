import type { Key } from "@/ui/i18n";

type T = (key: Key, values?: Record<string, string | number>) => string;

/** Resposta do autarca a um pedido (RZ-236) como um pequeno discurso: abertura pelo feitio, motivo e fecho. */
export function councilSpeech(t: T, p: { approved: boolean; reason: string; tone: string; kind: string; amount: number }, money: Intl.NumberFormat): string {
  const o = p.approved ? "yes" : "no";
  const what = t(`council.what.${p.kind}` as Key, { amount: money.format(p.amount) });
  return [t(`council.open.${p.tone}.${o}` as Key), t(`council.body.${o}.${p.reason}` as Key, { what }), t(`council.close.${p.tone}.${o}` as Key)].join(" ");
}
