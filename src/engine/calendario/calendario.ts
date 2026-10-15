/**
 * Calendário de uma liga e da época inteira (RZ-102).
 * As datas respeitam: início depois de `primeiraJornada`, pausas (seleções, Natal), fim antes de
 * `ultimaJornadaAte`, jornadas a meio da semana quando faltam fins de semana (p. ex. 38 jornadas da
 * Primeira Liga) e últimas jornadas em simultâneo. Tudo determinístico (seed) e dirigido por parâmetros.
 */
import type { Rng } from "../aleatorio/rng";
import type { Escalao, Parametros } from "../config/parametros";
import type { Data, FolgaAgendada, JogoAgendado } from "../persistencia/tipos";
import { comparar, criarData, diaDaSemana, proximoDiaDaSemana, somarDias } from "./datas";
import { todosContraTodos } from "./todosContraTodos";

export type { JogoAgendado };
export type Jornada = { numero: number; data: Data; jogos: JogoAgendado[]; folga?: string };
export type CalendarioLiga = { competicao: string; epoca: number; escalao: Escalao; voltas: 1 | 2; clubes: string[]; jornadas: Jornada[] };

export type DefinicaoLiga = { competicao: string; escalao: Escalao; clubes: string[]; voltas?: 1 | 2 };

type Calend = Parametros["calendario"];

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** O ano civil de uma data (mês/dia) da época `epoca`: do mês de início da época a dezembro no ano em que começa, de janeiro ao mês anterior no seguinte. */
const anoDe = (epoca: number, mes: number, c: Calend) => (mes >= c.mesInicioEpoca ? c.anoInicial + epoca - 1 : c.anoInicial + epoca);
const dataDaEpoca = (epoca: number, d: { mes: number; dia: number }, c: Calend): Data => criarData(anoDe(epoca, d.mes, c), d.mes, d.dia);

type Slot = { data: Data; fimDeSemana: boolean };

/** Sábados disponíveis na época (sem pausas e com o domingo ainda dentro do limite). */
export function fimsDeSemanaDaEpoca(epoca: number, c: Calend, escalao?: Escalao): Data[] {
  const inicio = proximoDiaDaSemana(dataDaEpoca(epoca, c.primeiraJornada, c), 6);
  const fim = dataDaEpoca(epoca, (escalao && c.ultimaJornadaPorEscalao[escalao]) || c.ultimaJornadaAte, c);
  const pausas = c.pausas.map((p) => ({ de: dataDaEpoca(epoca, p.de, c), ate: dataDaEpoca(epoca, p.ate, c) }));
  const naPausa = (d: Data) => pausas.some((p) => comparar(d, p.de) >= 0 && comparar(d, p.ate) <= 0);
  const out: Data[] = [];
  for (let s = inicio; comparar(somarDias(s, 1), fim) <= 0; s = somarDias(s, 7)) if (!naPausa(s) && !naPausa(somarDias(s, 1))) out.push(s);
  return out;
}

/** `m` índices entre 0 e `total−1`, igualmente espaçados e crescentes. */
function repartir(total: number, m: number): number[] {
  if (m <= 0) return [];
  if (m === 1) return [0];
  return Array.from({ length: m }, (_, i) => Math.round((i * (total - 1)) / (m - 1)));
}

/** As `rondas` datas-base de uma liga: fins de semana espaçados e, se faltarem, quartas-feiras antes de um fim de semana. */
export function ranhurasDaLiga(rondas: number, epoca: number, c: Calend, escalao?: Escalao): Slot[] {
  const W = fimsDeSemanaDaEpoca(epoca, c, escalao);
  if (rondas <= W.length) return repartir(W.length, rondas).map((i) => ({ data: W[i] as Data, fimDeSemana: true }));
  const pausas = c.pausas.map((p) => ({ de: dataDaEpoca(epoca, p.de, c), ate: dataDaEpoca(epoca, p.ate, c) }));
  const livre = (d: Data) => !pausas.some((p) => comparar(d, p.de) >= 0 && comparar(d, p.ate) <= 0);
  const candidatas = W.map((s, i) => ({ i, quarta: somarDias(s, -3) })).filter(({ i, quarta }) => i > 0 && i < W.length - 1 && livre(quarta));
  const extra = rondas - W.length;
  if (extra > candidatas.length) throw new Error(`Calendário impossível: ${rondas} jornadas, só cabem ${W.length + candidatas.length}`);
  const meios = repartir(candidatas.length, extra).map((k) => (candidatas[k] as { quarta: Data }).quarta);
  return [...W.map((data) => ({ data, fimDeSemana: true })), ...meios.map((data) => ({ data, fimDeSemana: false }))].sort((a, b) => comparar(a.data, b.data));
}

/** Data de um jogo dentro de uma ranhura, repartindo os jogos pelos dias de jogo do escalão. */
function dataDoJogo(slot: Slot, indice: number, dias: number[], simultanea: boolean): Data {
  if (!slot.fimDeSemana) return slot.data;
  const deslocamento = (d: number) => (d === 6 ? 0 : d === 0 ? 1 : d === 5 ? -1 : d === 1 ? 2 : d === 4 ? -2 : d === 3 ? -3 : -4);
  const ordenados = [...dias].sort((a, b) => deslocamento(a) - deslocamento(b));
  const dia = simultanea ? (ordenados[ordenados.length - 1] as number) : (ordenados[indice % ordenados.length] as number);
  return somarDias(slot.data, deslocamento(dia));
}

export function gerarCalendarioLiga(def: DefinicaoLiga, epoca: number, c: Calend, rng: Rng): CalendarioLiga {
  const voltas = def.voltas ?? 2;
  const rondas = todosContraTodos(def.clubes, voltas, rng.derivar(`rondas/${def.competicao}`));
  const slots = ranhurasDaLiga(rondas.length, epoca, c, def.escalao);
  const dias = c.diasDeJogo[def.escalao];
  const jornadas: Jornada[] = rondas.map((r, i) => {
    const numero = i + 1;
    const simultanea = numero > rondas.length - c.jornadasFinaisSimultaneas;
    const slot = slots[i] as Slot;
    const jogos: JogoAgendado[] = r.jogos.map((j, k) => ({
      id: `e${epoca}-${slug(def.competicao)}-j${numero}-${j.casa}`,
      competicao: def.competicao,
      epoca,
      jornada: numero,
      data: dataDoJogo(slot, k, dias, simultanea),
      casa: j.casa,
      fora: j.fora,
    }));
    const datas = jogos.map((j) => j.data).sort(comparar);
    return { numero, data: (datas[0] as Data) ?? slot.data, jogos, ...(r.folga !== undefined ? { folga: r.folga } : {}) };
  });
  return { competicao: def.competicao, epoca, escalao: def.escalao, voltas, clubes: [...def.clubes], jornadas };
}

/** Calendários de várias ligas da mesma época; cada liga tem o seu fluxo aleatório, por isso acrescentar uma não muda as outras. */
export function gerarCalendariosDaEpoca(ligas: readonly DefinicaoLiga[], epoca: number, c: Calend, rng: Rng): CalendarioLiga[] {
  return ligas.map((l) => gerarCalendarioLiga(l, epoca, c, rng.derivar(`epoca/${epoca}`)));
}

/** Verifica um calendário; devolve a lista de problemas (vazia se estiver certo). */
export function validarCalendario(cal: CalendarioLiga): string[] {
  const erros: string[] = [];
  const n = cal.clubes.length;
  const porVolta = n % 2 === 0 ? n - 1 : n;
  if (cal.jornadas.length !== porVolta * cal.voltas) erros.push(`${cal.jornadas.length} jornadas (esperado ${porVolta * cal.voltas})`);
  const encontros = new Map<string, number>();
  const clubes = new Set(cal.clubes);
  let anterior: Data = "0000-00-00";
  for (const j of cal.jornadas) {
    const naJornada = new Set<string>();
    for (const g of j.jogos) {
      if (!clubes.has(g.casa) || !clubes.has(g.fora)) erros.push(`jornada ${j.numero}: clube desconhecido`);
      for (const c of [g.casa, g.fora]) {
        if (naJornada.has(c)) erros.push(`jornada ${j.numero}: ${c} joga duas vezes`);
        naJornada.add(c);
      }
      const k = `${g.casa}>${g.fora}`;
      encontros.set(k, (encontros.get(k) ?? 0) + 1);
    }
    const esperados = n - (n % 2);
    if (naJornada.size !== esperados) erros.push(`jornada ${j.numero}: ${naJornada.size} clubes a jogar (esperado ${esperados})`);
    if (n % 2 === 1 && (j.folga === undefined || naJornada.has(j.folga))) erros.push(`jornada ${j.numero}: folga inválida`);
    if (n % 2 === 0 && j.folga !== undefined) erros.push(`jornada ${j.numero}: não devia haver folga`);
    if (comparar(j.data, anterior) < 0) erros.push(`jornada ${j.numero}: data anterior à da jornada anterior`);
    anterior = j.data;
  }
  for (const a of cal.clubes)
    for (const b of cal.clubes)
      if (a !== b) {
        const jogos = encontros.get(`${a}>${b}`) ?? 0;
        if (jogos !== (cal.voltas === 2 ? 1 : 0) + (cal.voltas === 1 && a < b ? 1 : 0) && cal.voltas === 2 && jogos !== 1) erros.push(`${a} x ${b} em casa de ${a}: ${jogos} jogos (esperado 1)`);
        if (cal.voltas === 1) {
          const total = jogos + (encontros.get(`${b}>${a}`) ?? 0);
          if (total !== 1) erros.push(`${a} x ${b}: ${total} jogos (esperado 1)`);
        }
      }
  return erros;
}

export { diaDaSemana };

/** Linhas a guardar no repositório para um calendário de liga. */
export function paraRepositorio(cal: CalendarioLiga): { jogos: JogoAgendado[]; folgas: FolgaAgendada[] } {
  return {
    jogos: cal.jornadas.flatMap((j) => j.jogos),
    folgas: cal.jornadas.flatMap((j) => (j.folga !== undefined ? [{ competicao: cal.competicao, epoca: cal.epoca, jornada: j.numero, clube: j.folga }] : [])),
  };
}
