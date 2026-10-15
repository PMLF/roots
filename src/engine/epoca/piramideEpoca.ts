/**
 * Composição da pirâmide por época (RZ-159). Na época 1 vem dos dados; a partir daí guarda-se no save (`piramide.<época>`)
 * o que os movimentos de fim de época decidiram. `dadosDaEpoca` devolve os dados com a liga e o escalão **atuais** de cada
 * clube, para que todas as páginas mostrem sempre a liga em que o clube joga neste save (a de arranque só fica no
 * histórico de divisões).
 */
import type { Escalao } from "../config/parametros";
import type { ClubeId, DadosBase, SerieCP } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import { SERIES, type Piramide } from "./movimentos";

const chave = (epoca: number) => `piramide.${epoca}`;

export const epocaAtual = (repo: Repositorio): number => Number(repo.meta("epoca") ?? 1);

export function piramideInicial(dados: DadosBase): Piramide {
  const ids = (e: Escalao) => dados.clubes.filter((c) => c.escalao === e).map((c) => c.id);
  const distritais: Record<string, ClubeId[]> = {};
  for (const c of dados.clubes) if (c.escalao === "distrital") (distritais[c.distrito] ??= []).push(c.id);
  return {
    primeira: ids("primeiraLiga"),
    segunda: ids("segundaLiga"),
    terceira: ids("terceiraLiga"),
    cp: Object.fromEntries(SERIES.map((s) => [s, dados.clubes.filter((c) => c.escalao === "cp" && c.liga === `CP Série ${s}`).map((c) => c.id)])) as Record<SerieCP, ClubeId[]>,
    distritais,
  };
}

export function lerPiramide(repo: Repositorio, dados: DadosBase, epoca: number): Piramide {
  const bruto = repo.meta(chave(epoca));
  if (bruto) return JSON.parse(bruto) as Piramide;
  if (epoca === 1) return piramideInicial(dados);
  throw new Error(`Não há pirâmide guardada para a época ${epoca}`);
}

export const guardarPiramide = (repo: Repositorio, epoca: number, p: Piramide) => repo.definirMeta(chave(epoca), JSON.stringify(p));

export type LigaEscalao = { liga: string; escalao: Escalao };

/** A liga e o escalão de cada clube numa pirâmide. Os nomes das ligas vêm dos dados. */
export function ligasDaPiramide(p: Piramide, dados: DadosBase): Map<ClubeId, LigaEscalao> {
  const nomeDoEscalao = (e: Escalao) => dados.clubes.find((c) => c.escalao === e)?.liga ?? e;
  const nomeDistrital = (distrito: string) => dados.clubes.find((c) => c.escalao === "distrital" && c.distrito === distrito)?.liga ?? `Distrital ${distrito}`;
  const m = new Map<ClubeId, LigaEscalao>();
  for (const [lista, e] of [[p.primeira, "primeiraLiga"], [p.segunda, "segundaLiga"], [p.terceira, "terceiraLiga"]] as const) for (const c of lista) m.set(c, { liga: nomeDoEscalao(e), escalao: e });
  for (const s of SERIES) for (const c of p.cp[s]) m.set(c, { liga: `CP Série ${s}`, escalao: "cp" });
  for (const [d, lista] of Object.entries(p.distritais)) for (const c of lista) m.set(c, { liga: nomeDistrital(d), escalao: "distrital" });
  return m;
}

/** Os dados com a liga e o escalão de cada clube numa época do save. */
export function dadosDaPiramide(repo: Repositorio, dados: DadosBase, epoca: number): DadosBase {
  const ligas = ligasDaPiramide(lerPiramide(repo, dados, epoca), dados);
  return { ...dados, clubes: dados.clubes.map((c) => { const l = ligas.get(c.id); return l ? { ...c, liga: l.liga, escalao: l.escalao } : c; }) };
}

/** Os dados com a liga e o escalão **atuais** de cada clube. Idempotente. */
export function dadosDaEpoca(repo: Repositorio, dados: DadosBase): DadosBase {
  const epoca = epocaAtual(repo);
  if (epoca === 1 && repo.meta(chave(1)) === undefined) return dados;
  return dadosDaPiramide(repo, dados, epoca);
}

/** Ligas por onde o clube passou, época a época (o gráfico de divisões). */
export function historicoDeDivisoes(repo: Repositorio, dados: DadosBase, clube: ClubeId): { epoca: number; escalao: Escalao; liga: string }[] {
  const out: { epoca: number; escalao: Escalao; liga: string }[] = [];
  for (let e = 1; e <= epocaAtual(repo); e++) {
    const l = ligasDaPiramide(lerPiramide(repo, dados, e), dados).get(clube);
    if (l) out.push({ epoca: e, ...l });
  }
  return out;
}
