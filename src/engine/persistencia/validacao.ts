/** Validações partilhadas por todos os adaptadores (o comportamento tem de ser igual em qualquer um). */
import type { EventoNovo, JogoFacto, JogoNovo, Participacao } from "./tipos";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const inteiro = (n: number) => Number.isInteger(n);

export function validarEventoNovo(e: EventoNovo): void {
  const erros: string[] = [];
  if (!e.tipo) erros.push("tipo vazio");
  if (!DATA.test(e.data)) erros.push(`data inválida "${e.data}" (AAAA-MM-DD)`);
  if (!inteiro(e.epoca)) erros.push("epoca deve ser inteira");
  if (e.jornada !== undefined && !inteiro(e.jornada)) erros.push("jornada deve ser inteira");
  if (e.v !== undefined && (!inteiro(e.v) || e.v < 1)) erros.push("v deve ser um inteiro ≥ 1");
  if (e.corrige !== undefined && e.tipo !== "CORRECAO") erros.push("só eventos CORRECAO podem ter 'corrige'");
  if (e.tipo === "CORRECAO" && e.corrige === undefined) erros.push("CORRECAO exige 'corrige'");
  const vistas = new Set<string>();
  for (const x of e.entidades) {
    const chave = `${x.k}:${x.id}`;
    if (!x.id) erros.push(`entidade ${x.k} sem id`);
    if (vistas.has(chave)) erros.push(`entidade repetida: ${chave}`);
    vistas.add(chave);
  }
  if (erros.length > 0) throw new Error(`Evento ${e.tipo || "?"} inválido: ${erros.join("; ")}`);
}

export function validarJogo(j: JogoNovo, factos: JogoFacto[], participacoes: Participacao[]): void {
  const erros: string[] = [];
  if (!j.id) erros.push("id vazio");
  if (j.casa === j.fora) erros.push("casa e fora são o mesmo clube");
  if (!DATA.test(j.data)) erros.push(`data inválida "${j.data}"`);
  for (const [nome, v] of [["golosCasa", j.golosCasa], ["golosFora", j.golosFora]] as const)
    if (!inteiro(v) || v < 0) erros.push(`${nome} deve ser um inteiro ≥ 0`);
  const clubes = new Set([j.casa, j.fora]);
  let gCasa = 0;
  let gFora = 0;
  for (const f of factos) {
    if (!clubes.has(f.clube)) erros.push(`facto ${f.tipo} de um clube que não joga (${f.clube})`);
    if (!inteiro(f.minuto) || f.minuto < 0 || f.minuto > 130) erros.push(`minuto inválido (${f.minuto})`);
    if (f.tipo === "G" && f.clube === j.casa) gCasa++;
    else if (f.tipo === "G") gFora++;
  }
  if (gCasa !== j.golosCasa || gFora !== j.golosFora)
    erros.push(`os golos registados (${gCasa}-${gFora}) não batem com o resultado (${j.golosCasa}-${j.golosFora})`);
  const jogadores = new Set<string>();
  for (const p of participacoes) {
    if (!clubes.has(p.clube)) erros.push(`participação de um clube que não joga (${p.clube})`);
    if (jogadores.has(p.jogador)) erros.push(`jogador repetido: ${p.jogador}`);
    jogadores.add(p.jogador);
    if (!inteiro(p.minutos) || p.minutos < 0 || p.minutos > 130) erros.push(`minutos inválidos (${p.minutos})`);
  }
  if (erros.length > 0) throw new Error(`Jogo ${j.id} inválido: ${erros.join("; ")}`);
}

/** Comparação de texto igual à do SQLite (binária): evita diferenças de ordenação entre adaptadores. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
