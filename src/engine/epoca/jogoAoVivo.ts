/**
 * Jogo ao vivo (RZ-130): o jogo do clube do gamer é simulado inteiro de uma vez e a linha do tempo fica guardada no save
 * (`vivo.<jogo>`; só os últimos jogos) para a interface a reproduzir minuto a minuto, com pausa e velocidade.
 * Os outros jogos só deixam o resumo público (golos, vermelhos, lesões, melhor em campo).
 */
import type { RelatorioJogo } from "../jogo/estatisticas";
import type { EquipaJogo, EventoJogo, Lado, ResultadoRemate, ResumoJogo, Tatica } from "../jogo/tipos";
import type { Posicao } from "../mundo/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";

export type TipoLinhaVivo = "inicio" | "golo" | "remate" | "canto" | "penalti" | "cartao" | "lesao" | "substituicao" | "intervalo" | "fim";

export type LinhaVivo = {
  minuto: number;
  tipo: TipoLinhaVivo;
  lado?: Lado;
  jogador?: string;
  nome?: string;
  assistente?: string;
  /** Ids para a interface ligar os nomes às fichas (jogos guardados antes não os têm). */
  assistenteId?: string;
  entraId?: string;
  /** Quem entra, numa substituição. */
  entra?: string;
  resultado?: ResultadoRemate;
  cor?: "amarelo" | "vermelho";
  segundoAmarelo?: boolean;
  /** Notificar: golos, cartões, penáltis, lesões e substituições. Os remates e cantos só enchem o feed. */
  importante: boolean;
  /** Num golo: o que muda no jogo, do ponto de vista de quem marca (para o comentário). */
  situacao?: "abre" | "empata" | "vira" | "aumenta" | "reduz";
  /** Marcador depois deste lance. */
  golosCasa: number;
  golosFora: number;
};

/**
 * Um jogador no jogo (painel «Equipas»): o onze inicial e o banco, com a nota ao minuto, o que fez e quando entrou ou saiu.
 * `estado`: em campo, no banco (ainda não entrou), substituído, ou expulso.
 */
export type JogadorVivo = {
  id: string;
  nome: string;
  posicao: Posicao;
  estado: "campo" | "banco" | "saiu" | "expulso";
  /** Só quem já jogou. */
  nota?: number;
  golos: number;
  assistencias: number;
  amarelos: number;
  vermelho: boolean;
  lesionado: boolean;
  /** Minuto em que entrou (suplentes). */
  entrou?: number;
  /** Minuto em que saiu (substituído, lesionado, expulso). */
  saiu?: number;
  /** Quem o substituiu / quem substituiu. */
  trocaCom?: { id: string; nome: string };
};
export type EquipasVivo = { casa: JogadorVivo[]; fora: JogadorVivo[] };

/** Constrói o painel das equipas no minuto a que `eventos` e `relatorio` chegam. */
export function equipasDoJogo(equipas: { casa: EquipaJogo; fora: EquipaJogo }, eventos: readonly EventoJogo[], relatorio: RelatorioJogo, nome: (id: string) => string): EquipasVivo {
  const stat = new Map(relatorio.jogadores.map((j) => [j.id, j] as const));
  const entrou = new Map<string, number>();
  const saiu = new Map<string, { minuto: number; expulso: boolean }>();
  const troca = new Map<string, string>();
  for (const e of eventos) {
    if (e.tipo === "substituicao") {
      entrou.set(e.entra, e.minuto);
      saiu.set(e.sai, { minuto: e.minuto, expulso: false });
      troca.set(e.sai, e.entra);
      troca.set(e.entra, e.sai);
    } else if (e.tipo === "cartao" && e.cor === "vermelho") saiu.set(e.jogador, { minuto: e.minuto, expulso: true });
  }
  const lado = (l: Lado): JogadorVivo[] =>
    [...equipas[l].onze, ...(equipas[l].banco ?? [])].map((j, i) => {
      const st = stat.get(j.id);
      const inicial = i < equipas[l].onze.length;
      const sai = saiu.get(j.id);
      const ent = entrou.get(j.id);
      const jogou = inicial || ent !== undefined;
      const outro = troca.get(j.id);
      return {
        id: j.id, nome: nome(j.id), posicao: st?.posicao ?? j.posicao,
        estado: sai ? (sai.expulso ? "expulso" : "saiu") : jogou ? "campo" : "banco",
        ...(jogou && st ? { nota: st.nota } : {}),
        golos: st?.golos ?? 0, assistencias: st?.assistencias ?? 0, amarelos: st?.amarelos ?? 0, vermelho: (st?.vermelhos ?? 0) > 0, lesionado: !!st?.lesao,
        ...(ent !== undefined ? { entrou: ent } : {}), ...(sai ? { saiu: sai.minuto } : {}),
        ...(outro ? { trocaCom: { id: outro, nome: nome(outro) } } : {}),
      };
    });
  return { casa: lado("casa"), fora: lado("fora") };
}

/** Uma linha da tabela da competição antes dos jogos de hoje. */
export type LinhaTabelaVivo = { clube: string; nome: string; jogos: number; pontos: number; golosMarcados: number; golosSofridos: number };

/** Outro jogo da mesma competição no mesmo dia: só os golos (o que se sabe dos jogos que não são o teu). */
export type OutroJogoVivo = {
  id: string;
  casa: { id: string; nome: string };
  fora: { id: string; nome: string };
  duracao: number;
  golos: { minuto: number; lado: Lado }[];
  golosCasa: number;
  golosFora: number;
};

/** Um jogo anterior entre as duas equipas (do ponto de vista de quem joga em casa agora não importa: guarda quem jogou onde). */
export type ConfrontoVivo = { id: string; data: Data; competicao: string; epoca: number; casa: string; fora: string; golosCasa: number; golosFora: number };

/** O que se sabe do jogo além do que acontece em campo. Árbitro e transmissão entram quando existirem (RZ-218, RZ-222). */
export type InfoJogo = {
  estadio: { nome: string; localidade: string; capacidade: number };
  /** Adeptos no estádio (pré-visualização determinística; o valor registado é o mesmo). */
  assistencia: number;
  arbitro?: string;
  /** Quem transmite o jogo (televisão, streaming, rádio). */
  canais?: { nome: string; meio: "tv" | "streaming" | "radio" }[];
};

/** xG acumulado de cada equipa em cada minuto (índice = minuto; o 0 é sempre 0). */
export type CurvaXg = { casa: number[]; fora: number[] };

/** Constrói a curva de xG até ao minuto `ate` a partir dos remates. */
export function curvaXg(eventos: readonly EventoJogo[], ate: number): CurvaXg {
  const n = Math.max(0, Math.floor(ate));
  const casa = new Array<number>(n + 1).fill(0);
  const fora = new Array<number>(n + 1).fill(0);
  for (const e of eventos) {
    if (e.tipo !== "remate") continue;
    const m = Math.min(n, Math.max(0, Math.ceil(e.minuto)));
    (e.lado === "casa" ? casa : fora)[m]! += e.xg;
  }
  for (const v of [casa, fora]) for (let i = 1; i <= n; i++) v[i] = Math.round((v[i]! + v[i - 1]!) * 1000) / 1000;
  return { casa, fora };
}

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
  /** Tabela antes dos jogos de hoje; a interface soma-lhe os marcadores a cada minuto. */
  tabela: LinhaTabelaVivo[];
  pontosVitoria: number;
  pontosEmpate: number;
  outros: OutroJogoVivo[];
  /** Cores de cada clube que aparece no jogo (casa, fora e tabela). */
  cores?: Record<string, string>;
  /** As duas equipas: onze, banco, notas e o que cada jogador fez (ao minuto, ou as finais num jogo guardado). */
  equipas?: EquipasVivo;
  /** Estatísticas do jogo (as finais num jogo guardado; as do minuto atual ao vivo). */
  resumo?: ResumoJogo;
  /** Evolução do xG por minuto (até ao minuto atual ao vivo). */
  xg?: CurvaXg;
  /** Últimos jogos entre as duas equipas, mais recente primeiro. */
  confrontos?: ConfrontoVivo[];
  /** Estádio, assistência, árbitro, ... */
  info?: InfoJogo;
  /** Quantos sobem e descem nesta competição (para as zonas da tabela). */
  zonas?: { promovidos: number; descidos: number };
  /** De que lado joga o clube do gamer. */
  ladoGamer?: Lado;
  /** Só ao vivo (RZ-170): o jogo está a decorrer, no minuto indicado, com esta tática do lado do gamer. */
  emCurso?: boolean;
  minuto?: number;
  tatica?: Tatica;
};

const GUARDAR = 6;

/** Chave do save onde fica o jogo do gamer que está a decorrer (RZ-170). */
export const CHAVE_SESSAO = "sessao";

/** Converte os eventos do motor no feed do jogo (sem os «lances» simples, que são ruído). */
export function linhasDoJogo(eventos: readonly EventoJogo[], duracao: number, nome: (id: string) => string): LinhaVivo[] {
  let gc = 0;
  let gf = 0;
  const out: LinhaVivo[] = [];
  const base = (e: { minuto: number; lado: Lado }) => ({ minuto: e.minuto, lado: e.lado });
  const marcador = () => ({ golosCasa: gc, golosFora: gf });
  for (const e of [...eventos].sort((a, b) => a.minuto - b.minuto)) {
    if (e.tipo === "remate") {
      let situacao: LinhaVivo["situacao"];
      if (e.resultado === "golo") {
        const meus = e.lado === "casa" ? gc : gf;
        const deles = e.lado === "casa" ? gf : gc;
        situacao = meus + deles === 0 ? "abre" : meus + 1 === deles ? "empata" : meus + 1 < deles ? "reduz" : meus === deles ? "vira" : "aumenta";
        if (e.lado === "casa") gc++; else gf++;
      }
      out.push({ ...base(e), tipo: e.resultado === "golo" ? "golo" : "remate", ...(situacao ? { situacao } : {}), jogador: e.jogador, nome: nome(e.jogador), ...(e.assistente ? { assistente: nome(e.assistente), assistenteId: e.assistente } : {}), resultado: e.resultado, importante: e.resultado === "golo", ...marcador() });
    } else if (e.tipo === "canto") out.push({ ...base(e), tipo: "canto", importante: false, ...marcador() });
    else if (e.tipo === "falta" && e.penalti) out.push({ ...base(e), tipo: "penalti", jogador: e.jogador, nome: nome(e.jogador), importante: true, ...marcador() });
    else if (e.tipo === "cartao") out.push({ ...base(e), tipo: "cartao", jogador: e.jogador, nome: nome(e.jogador), cor: e.cor, ...(e.segundoAmarelo ? { segundoAmarelo: true } : {}), importante: true, ...marcador() });
    else if (e.tipo === "lesao") out.push({ ...base(e), tipo: "lesao", jogador: e.jogador, nome: nome(e.jogador), importante: true, ...marcador() });
    else if (e.tipo === "substituicao") out.push({ ...base(e), tipo: "substituicao", jogador: e.sai, nome: nome(e.sai), entra: nome(e.entra), entraId: e.entra, importante: true, ...marcador() });
  }
  // intervalo: marcador à passagem dos 45 minutos
  const aoIntervalo = out.filter((l) => l.minuto <= 45).at(-1);
  out.push({ minuto: 0, tipo: "inicio", importante: false, golosCasa: 0, golosFora: 0 });
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

