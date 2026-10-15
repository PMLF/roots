/**
 * Jogo ao vivo (RZ-130): o jogo do clube do gamer é simulado inteiro de uma vez e a linha do tempo fica guardada no save
 * (`vivo.<jogo>`; só os últimos jogos) para a interface a reproduzir minuto a minuto, com pausa e velocidade.
 * Os outros jogos só deixam o resumo público (golos, vermelhos, lesões, melhor em campo).
 */
import type { EventoJogo, Lado, ResultadoRemate } from "../jogo/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";

export type TipoLinhaVivo = "golo" | "remate" | "canto" | "penalti" | "cartao" | "lesao" | "substituicao" | "intervalo" | "fim";

export type LinhaVivo = {
  minuto: number;
  tipo: TipoLinhaVivo;
  lado?: Lado;
  jogador?: string;
  nome?: string;
  assistente?: string;
  /** Quem entra, numa substituição. */
  entra?: string;
  resultado?: ResultadoRemate;
  cor?: "amarelo" | "vermelho";
  segundoAmarelo?: boolean;
  /** Notificar: golos, cartões, penáltis, lesões e substituições. Os remates e cantos só enchem o feed. */
  importante: boolean;
  /** Marcador depois deste lance. */
  golosCasa: number;
  golosFora: number;
};

export type JogoVivo = {
  id: string;
  competicao: string;
  jornada: number;
  data: Data;
  casa: { id: string; nome: string };
  fora: { id: string; nome: string };
  duracao: number;
  golosCasa: number;
  golosFora: number;
  linhas: LinhaVivo[];
};

const GUARDAR = 6;

/** Converte os eventos do motor no feed do jogo (sem os «lances» simples, que são ruído). */
export function linhasDoJogo(eventos: readonly EventoJogo[], duracao: number, nome: (id: string) => string): LinhaVivo[] {
  let gc = 0;
  let gf = 0;
  const out: LinhaVivo[] = [];
  const base = (e: { minuto: number; lado: Lado }) => ({ minuto: e.minuto, lado: e.lado });
  const marcador = () => ({ golosCasa: gc, golosFora: gf });
  for (const e of [...eventos].sort((a, b) => a.minuto - b.minuto)) {
    if (e.tipo === "remate") {
      if (e.resultado === "golo") { if (e.lado === "casa") gc++; else gf++; }
      out.push({ ...base(e), tipo: e.resultado === "golo" ? "golo" : "remate", jogador: e.jogador, nome: nome(e.jogador), ...(e.assistente ? { assistente: nome(e.assistente) } : {}), resultado: e.resultado, importante: e.resultado === "golo", ...marcador() });
    } else if (e.tipo === "canto") out.push({ ...base(e), tipo: "canto", importante: false, ...marcador() });
    else if (e.tipo === "falta" && e.penalti) out.push({ ...base(e), tipo: "penalti", jogador: e.jogador, nome: nome(e.jogador), importante: true, ...marcador() });
    else if (e.tipo === "cartao") out.push({ ...base(e), tipo: "cartao", jogador: e.jogador, nome: nome(e.jogador), cor: e.cor, ...(e.segundoAmarelo ? { segundoAmarelo: true } : {}), importante: true, ...marcador() });
    else if (e.tipo === "lesao") out.push({ ...base(e), tipo: "lesao", jogador: e.jogador, nome: nome(e.jogador), importante: true, ...marcador() });
    else if (e.tipo === "substituicao") out.push({ ...base(e), tipo: "substituicao", jogador: e.sai, nome: nome(e.sai), entra: nome(e.entra), importante: true, ...marcador() });
  }
  // intervalo: marcador à passagem dos 45 minutos
  const aoIntervalo = out.filter((l) => l.minuto <= 45).at(-1);
  out.push({ minuto: 45, tipo: "intervalo", importante: false, golosCasa: aoIntervalo?.golosCasa ?? 0, golosFora: aoIntervalo?.golosFora ?? 0 });
  out.push({ minuto: duracao, tipo: "fim", importante: false, ...marcador() });
  return out.sort((a, b) => a.minuto - b.minuto || (a.tipo === "intervalo" ? 1 : 0) - (b.tipo === "intervalo" ? 1 : 0));
}

export function guardarJogoVivo(repo: Repositorio, jogo: JogoVivo): void {
  repo.definirMeta(`vivo.${jogo.id}`, JSON.stringify(jogo));
  const ids = (JSON.parse(repo.meta("vivo.lista") || "[]") as string[]).filter((x) => x !== jogo.id);
  ids.push(jogo.id);
  while (ids.length > GUARDAR) repo.definirMeta(`vivo.${ids.shift()}`, "");
  repo.definirMeta("vivo.lista", JSON.stringify(ids));
}

/** O jogo pedido ou, sem id, o último jogo do clube do gamer. */
export function lerJogoVivo(repo: Repositorio, id?: string): JogoVivo | null {
  const ids = JSON.parse(repo.meta("vivo.lista") || "[]") as string[];
  const alvo = id ?? ids.at(-1);
  const bruto = alvo ? repo.meta(`vivo.${alvo}`) : undefined;
  return bruto ? (JSON.parse(bruto) as JogoVivo) : null;
}

