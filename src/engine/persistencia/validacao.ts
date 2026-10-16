/** Validações partilhadas por todos os adaptadores (o comportamento tem de ser igual em qualquer um). */
import type { NewEvent, FactMatch, NewMatch, Appearance } from "./tipos";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const integer = (n: number) => Number.isInteger(n);

export function validateNewEvent(e: NewEvent): void {
  const errors: string[] = [];
  if (!e.type) errors.push("tipo vazio");
  if (!DATE.test(e.date)) errors.push(`data inválida "${e.date}" (AAAA-MM-DD)`);
  if (!integer(e.season)) errors.push("epoca deve ser inteira");
  if (e.round !== undefined && !integer(e.round)) errors.push("jornada deve ser inteira");
  if (e.v !== undefined && (!integer(e.v) || e.v < 1)) errors.push("v deve ser um inteiro ≥ 1");
  if (e.fixes !== undefined && e.type !== "CORRECAO") errors.push("só eventos CORRECAO podem ter 'corrige'");
  if (e.type === "CORRECAO" && e.fixes === undefined) errors.push("CORRECAO exige 'corrige'");
  const views = new Set<string>();
  for (const x of e.entities) {
    const rowKey = `${x.k}:${x.id}`;
    if (!x.id) errors.push(`entidade ${x.k} sem id`);
    if (views.has(rowKey)) errors.push(`entidade repetida: ${rowKey}`);
    views.add(rowKey);
  }
  if (errors.length > 0) throw new Error(`Evento ${e.type || "?"} inválido: ${errors.join("; ")}`);
}

export function validateMatch(j: NewMatch, facts: FactMatch[], appearances: Appearance[]): void {
  const errors: string[] = [];
  if (!j.id) errors.push("id vazio");
  if (j.home === j.away) errors.push("casa e fora são o mesmo clube");
  if (!DATE.test(j.date)) errors.push(`data inválida "${j.date}"`);
  for (const [name, v] of [["homeGoals", j.homeGoals], ["awayGoals", j.awayGoals]] as const)
    if (!integer(v) || v < 0) errors.push(`${name} deve ser um inteiro ≥ 0`);
  const clubs = new Set([j.home, j.away]);
  let homeG = 0;
  let awayG = 0;
  for (const f of facts) {
    if (!clubs.has(f.club)) errors.push(`facto ${f.type} de um clube que não joga (${f.club})`);
    if (!integer(f.minute) || f.minute < 0 || f.minute > 130) errors.push(`minuto inválido (${f.minute})`);
    if (f.type === "G" && f.club === j.home) homeG++;
    else if (f.type === "G") awayG++;
  }
  if (homeG !== j.homeGoals || awayG !== j.awayGoals)
    errors.push(`os golos registados (${homeG}-${awayG}) não batem com o resultado (${j.homeGoals}-${j.awayGoals})`);
  const players = new Set<string>();
  for (const p of appearances) {
    if (!clubs.has(p.club)) errors.push(`participação de um clube que não joga (${p.club})`);
    if (players.has(p.player)) errors.push(`jogador repetido: ${p.player}`);
    players.add(p.player);
    if (!integer(p.minutes) || p.minutes < 0 || p.minutes > 130) errors.push(`minutos inválidos (${p.minutes})`);
  }
  if (errors.length > 0) throw new Error(`Jogo ${j.id} inválido: ${errors.join("; ")}`);
}

/** Comparação de texto igual à do SQLite (binária): evita diferenças de ordenação entre adaptadores. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
