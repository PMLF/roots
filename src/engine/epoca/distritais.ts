/**
 * Distritais de tamanho variável e segunda distrital (RZ-113; docs/DESIGN_REGRAS.md §4). Puro: depois dos movimentos, cada
 * distrito tem `n' = n − p + r` clubes. Acima de `max`, os piores classificados (os recém-chegados do CP ficam
 * protegidos) descem para a segunda distrital; abaixo de `min`, a liga é completada com os que lá estão há menos tempo.
 * A segunda distrital é uma divisão que o jogo não simula: guarda o clube e a história, e os clubes podem voltar.
 * Se não houver clubes lá a liga joga com menos clubes (o gerador de clubes novos é o RZ-126).
 */
import type { Parametros } from "../config/parametros";
import type { ClubeId, DistritoId } from "../dados/tipos";

export const PREFIXO_SEGUNDA = "Segunda Distrital ";
export const ligaDaSegundaDistrital = (distrito: DistritoId) => `${PREFIXO_SEGUNDA}${distrito}`;
export const estaNaSegundaDistrital = (liga: string) => liga.startsWith(PREFIXO_SEGUNDA);

/** Um clube na segunda distrital e a época em que lá chegou. */
export type EntradaSegundaDistrital = { clube: ClubeId; desde: number };
export type SegundaDistrital = Record<DistritoId, EntradaSegundaDistrital[]>;

export type AjusteDistrital = { clube: ClubeId; distrito: DistritoId; tipo: "descida" | "regresso" };

export type ResultadoDistritais = { distritais: Record<DistritoId, ClubeId[]>; segunda: SegundaDistrital; ajustes: AjusteDistrital[]; avisos: string[] };

export function ajustarDistritais(
  nova: Readonly<Record<DistritoId, readonly ClubeId[]>>,
  ctx: {
    /** Classificação final de cada distrital desta época, do melhor para o pior. */
    finais: Readonly<Record<DistritoId, readonly ClubeId[]>>;
    /** Despromovidos do CP nesta passagem de época: não jogaram na distrital e ficam protegidos. */
    protegidos: ReadonlySet<ClubeId>;
    segunda: Readonly<SegundaDistrital>;
    epoca: number;
  },
  params: Parametros,
): ResultadoDistritais {
  const { max, min, minimoDuro } = params.distritais;
  const distritais: Record<DistritoId, ClubeId[]> = {};
  const segunda: SegundaDistrital = Object.fromEntries(Object.entries(ctx.segunda).map(([d, l]) => [d, [...l]]));
  const ajustes: AjusteDistrital[] = [];
  const avisos: string[] = [];

  for (const distrito of Object.keys(nova).sort()) {
    let lista = [...(nova[distrito] as readonly ClubeId[])];
    const daSegunda = segunda[distrito] ?? (segunda[distrito] = []);

    if (lista.length > max) {
      const excedente = lista.length - max;
      const ordem = ctx.finais[distrito] ?? [];
      const lugar = (c: ClubeId) => ordem.indexOf(c);
      const candidatos = lista.filter((c) => !ctx.protegidos.has(c) && lugar(c) >= 0).sort((a, b) => lugar(b) - lugar(a) || (a < b ? -1 : 1));
      const saem = candidatos.slice(0, excedente);
      if (saem.length < excedente) avisos.push(`${distrito}: ${excedente} a mais mas só ${saem.length} podem sair para a segunda distrital`);
      lista = lista.filter((c) => !saem.includes(c));
      for (const c of saem) {
        daSegunda.unshift({ clube: c, desde: ctx.epoca });
        ajustes.push({ clube: c, distrito, tipo: "descida" });
      }
    }

    if (lista.length < min && daSegunda.length > 0) {
      // regressam primeiro os que desceram há menos tempo (em empate, por id)
      const porVoltar = [...daSegunda].sort((a, b) => b.desde - a.desde || (a.clube < b.clube ? -1 : 1)).slice(0, min - lista.length);
      for (const e of porVoltar) {
        lista.push(e.clube);
        ajustes.push({ clube: e.clube, distrito, tipo: "regresso" });
      }
      segunda[distrito] = daSegunda.filter((e) => !porVoltar.includes(e));
    }

    if (lista.length < min) avisos.push(`${distrito}: ${lista.length} clubes e a segunda distrital está vazia (um clube novo só com o RZ-126)`);
    if (lista.length < minimoDuro) avisos.push(`${distrito}: abaixo do mínimo duro de ${minimoDuro} clubes`);
    distritais[distrito] = lista;
  }
  return { distritais, segunda, ajustes, avisos };
}

