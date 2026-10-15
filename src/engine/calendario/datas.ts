/**
 * Aritmética de datas do calendário do jogo ('AAAA-MM-DD'), sempre em UTC para não haver
 * saltos por fuso horário ou hora de verão. Funções puras.
 */
import type { Data } from "../persistencia/tipos";

const MS_DIA = 86_400_000;

export function paraDias(d: Data): number {
  const [a, m, dia] = d.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(a, m - 1, dia) / MS_DIA);
}

export function deDias(n: number): Data {
  return new Date(n * MS_DIA).toISOString().slice(0, 10);
}

export function criarData(ano: number, mes: number, dia: number): Data {
  return deDias(Math.round(Date.UTC(ano, mes - 1, dia) / MS_DIA));
}

export const somarDias = (d: Data, n: number): Data => deDias(paraDias(d) + n);

/** 0 = domingo … 6 = sábado. */
export const diaDaSemana = (d: Data): number => (((paraDias(d) + 4) % 7) + 7) % 7;

export const comparar = (a: Data, b: Data): number => paraDias(a) - paraDias(b);

/** Primeira data ≥ `d` que cai no dia da semana pedido. */
export function proximoDiaDaSemana(d: Data, dia: number): Data {
  return somarDias(d, (dia - diaDaSemana(d) + 7) % 7);
}
