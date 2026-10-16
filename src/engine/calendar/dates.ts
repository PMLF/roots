/**
 * Aritmética de datas do calendário do jogo ('AAAA-MM-DD'), sempre em UTC para não haver
 * saltos por fuso horário ou hora de verão. Funções puras.
 */
import type { IsoDate } from "../persistence/types";

const MS_DAY = 86_400_000;

export function dayNumber(d: IsoDate): number {
  const [a, m, day] = d.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(a, m - 1, day) / MS_DAY);
}

export function fromDayNumber(n: number): IsoDate {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

export function createDate(year: number, month: number, day: number): IsoDate {
  return fromDayNumber(Math.round(Date.UTC(year, month - 1, day) / MS_DAY));
}

export const addDays = (d: IsoDate, n: number): IsoDate => fromDayNumber(dayNumber(d) + n);

/** 0 = domingo … 6 = sábado. */
export const weekDay = (d: IsoDate): number => (((dayNumber(d) + 4) % 7) + 7) % 7;

export const compare = (a: IsoDate, b: IsoDate): number => dayNumber(a) - dayNumber(b);

/** Primeira data ≥ `d` que cai no dia da semana pedido. */
export function nextWeekday(d: IsoDate, day: number): IsoDate {
  return addDays(d, (day - weekDay(d) + 7) % 7);
}
