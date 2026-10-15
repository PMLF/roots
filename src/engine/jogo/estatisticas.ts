/**
 * Estatísticas pós-jogo (RZ-105; docs/MOTOR_JOGO.md §6): do resultado do motor ao relatório que a ficha do jogo mostra.
 * Puro e determinístico (as notas levam um ruído estável tirado da seed e do id do jogo). Sem texto: os momentos-chave
 * são estruturados e a interface escreve-os no idioma do gamer. Lesões entram com RZ-107.
 */
import { Rng, limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import type { Posicao } from "../mundo/tipos";
import { outroLado, type EntradaJogo, type EquipaJogo, type EventoJogo, type EstatLado, type Lado, type Origem, type ResumoJogo } from "./tipos";

export type EstatJogador = {
  id: string;
  lado: Lado;
  clube: string;
  posicao: Posicao;
  minutos: number;
  golos: number;
  assistencias: number;
  remates: number;
  aBaliza: number;
  xg: number;
  penaltisFalhados: number;
  faltas: number;
  amarelos: number;
  /** 1 se foi expulso (vermelho direto ou segundo amarelo). */
  vermelhos: number;
  /** Só guarda-redes: remates à baliza defendidos. */
  defesas: number;
  golosSofridos: number;
  /** 1-10, uma casa decimal. */
  nota: number;
};

export type GoloJogo = { minuto: number; lado: Lado; jogador: string; assistente?: string; origem: Origem; golosCasa: number; golosFora: number };

/** O que o golo mudou no marcador, do ponto de vista de quem marcou. «Reviravolta» = passa para a frente depois de ter estado a perder. */
export type ContextoGolo = "abertura" | "empate" | "reviravolta" | "vantagem" | "reducao" | "alargou";

export type MomentoChave =
  | { tipo: "golo"; minuto: number; lado: Lado; jogador: string; assistente?: string; origem: Origem; contexto: ContextoGolo; golosCasa: number; golosFora: number }
  | { tipo: "penalti-falhado"; minuto: number; lado: Lado; jogador: string; guardaRedes?: string; defendido: boolean }
  | { tipo: "grande-defesa"; minuto: number; lado: Lado; jogador: string; guardaRedes: string; xg: number }
  | { tipo: "expulsao"; minuto: number; lado: Lado; jogador: string; segundoAmarelo: boolean }
  | { tipo: "ocasiao-falhada"; minuto: number; lado: Lado; jogador: string; xg: number };

export type CartaoJogo = { minuto: number; lado: Lado; jogador: string; cor: "amarelo" | "vermelho"; segundoAmarelo?: true };

export type RelatorioJogo = {
  duracao: number;
  golosCasa: number;
  golosFora: number;
  /** Golos ao intervalo (até ao minuto `duracao`/2 arredondado, 45 num jogo normal). */
  intervalo: { casa: number; fora: number };
  posseCasa: number;
  casa: EstatLado;
  fora: EstatLado;
  /** Golos por ordem, com o marcador depois de cada um. */
  golos: GoloJogo[];
  /** Todos os cartões, por ordem. */
  cartoes: CartaoJogo[];
  momentos: MomentoChave[];
  jogadores: EstatJogador[];
  /** Id do homem do jogo (melhor nota; desempata por golos + assistências, xG e id). */
  homemDoJogo: string;
};

const defensivo: Partial<Record<Posicao, number>> = { GR: 1, DD: 1, DC: 1, DE: 1, MDC: 0.5 };
const arredondar = (x: number, casas: number) => Math.round(x * 10 ** casas) / 10 ** casas;

/** `proprios` e `adversario` são os golos ANTES deste golo; `jaPerdia` diz se a equipa já perdeu em algum momento do jogo. */
function contextoDoGolo(proprios: number, adversario: number, jaPerdia: boolean): ContextoGolo {
  if (proprios === 0 && adversario === 0) return "abertura";
  if (proprios + 1 === adversario) return "empate";
  if (proprios + 1 < adversario) return "reducao";
  if (proprios === adversario) return jaPerdia ? "reviravolta" : "vantagem";
  return "alargou";
}

/**
 * Constrói o relatório. `equipas` tem de incluir todos os jogadores que jogaram (os do onze inicial e, quando
 * houver substituições, os que entraram); um evento de um jogador que lá não está é um erro.
 */
export function relatorioDoJogo(
  entrada: Pick<EntradaJogo, "seed" | "id">,
  equipas: { casa: EquipaJogo; fora: EquipaJogo },
  eventos: readonly EventoJogo[],
  resumo: ResumoJogo,
  params: Parametros,
): RelatorioJogo {
  const pj = params.jogo;
  const n = pj.notas;
  const jogadores = new Map<string, EstatJogador>();
  for (const lado of ["casa", "fora"] as const) {
    for (const j of equipas[lado].onze) {
      jogadores.set(j.id, { id: j.id, lado, clube: equipas[lado].clube, posicao: j.posicao, minutos: resumo.duracao, golos: 0, assistencias: 0, remates: 0, aBaliza: 0, xg: 0, penaltisFalhados: 0, faltas: 0, amarelos: 0, vermelhos: 0, defesas: 0, golosSofridos: 0, nota: n.base });
    }
  }
  const obter = (id: string): EstatJogador => {
    const j = jogadores.get(id);
    if (!j) throw new Error(`relatorioDoJogo: jogador ${id} não está nas equipas`);
    return j;
  };

  const marcador = { casa: 0, fora: 0 };
  const intervalo = { casa: 0, fora: 0 };
  const jaPerdeu = { casa: false, fora: false };
  const meio = Math.round(pj.duracao / 2);
  const golos: GoloJogo[] = [];
  const cartoes: CartaoJogo[] = [];
  const momentos: MomentoChave[] = [];
  /** Ajustes à nota por jogador, antes do clamp. */
  const ajuste = new Map<string, number>();
  const somar = (id: string, v: number) => ajuste.set(id, (ajuste.get(id) ?? 0) + v);

  for (const e of eventos) {
    if (e.tipo === "falta") {
      const inf = obter(e.jogador);
      inf.faltas++;
      somar(e.jogador, e.penalti ? n.penaltiConcedido : n.falta);
      continue;
    }
    if (e.tipo === "cartao") {
      const j = obter(e.jogador);
      cartoes.push({ minuto: e.minuto, lado: e.lado, jogador: e.jogador, cor: e.cor, ...(e.segundoAmarelo ? { segundoAmarelo: true as const } : {}) });
      if (e.cor === "amarelo") {
        j.amarelos++;
        somar(e.jogador, n.amarelo);
      } else {
        j.vermelhos++;
        j.minutos = Math.min(j.minutos, e.minuto);
        somar(e.jogador, n.vermelho);
        momentos.push({ tipo: "expulsao", minuto: e.minuto, lado: e.lado, jogador: e.jogador, segundoAmarelo: !!e.segundoAmarelo });
      }
      continue;
    }
    if (e.tipo !== "remate") continue;
    const fin = obter(e.jogador);
    fin.remates++;
    fin.xg += e.xg;
    const gr = e.guardaRedes ? obter(e.guardaRedes) : undefined;
    if (e.resultado === "golo") {
      const adv = outroLado(e.lado);
      const contexto = contextoDoGolo(marcador[e.lado], marcador[adv], jaPerdeu[e.lado]);
      marcador[e.lado]++;
      if (marcador[e.lado] > marcador[adv]) jaPerdeu[adv] = true;
      if (e.minuto <= meio) intervalo[e.lado]++;
      fin.golos++;
      fin.aBaliza++;
      somar(e.jogador, n.golo);
      if (e.assistente) {
        obter(e.assistente).assistencias++;
        somar(e.assistente, n.assistencia);
      }
      const g: GoloJogo = { minuto: e.minuto, lado: e.lado, jogador: e.jogador, ...(e.assistente ? { assistente: e.assistente } : {}), origem: e.origem, golosCasa: marcador.casa, golosFora: marcador.fora };
      golos.push(g);
      momentos.push({ tipo: "golo", ...g, contexto });
      continue;
    }
    if (e.resultado === "defendido") {
      fin.aBaliza++;
      somar(e.jogador, n.remateABaliza);
      if (gr) {
        gr.defesas++;
        somar(gr.id, n.defesa);
      }
    }
    if (e.origem === "penalti") {
      fin.penaltisFalhados++;
      somar(e.jogador, n.penaltiFalhado);
      momentos.push({ tipo: "penalti-falhado", minuto: e.minuto, lado: e.lado, jogador: e.jogador, ...(e.guardaRedes ? { guardaRedes: e.guardaRedes } : {}), defendido: e.resultado === "defendido" });
    } else if (e.xg >= pj.momentos.xgGrande) {
      if (e.resultado === "defendido" && e.guardaRedes) momentos.push({ tipo: "grande-defesa", minuto: e.minuto, lado: e.lado, jogador: e.jogador, guardaRedes: e.guardaRedes, xg: e.xg });
      else {
        somar(e.jogador, n.ocasiaoFalhada);
        momentos.push({ tipo: "ocasiao-falhada", minuto: e.minuto, lado: e.lado, jogador: e.jogador, xg: e.xg });
      }
    }
  }

  // notas: base + ações + defesa + resultado + ruído estável
  const rng = new Rng(entrada.seed, `jogo/${entrada.id}/notas`);
  const golosDe = (l: Lado) => marcador[l];
  for (const j of jogadores.values()) {
    const meu = golosDe(j.lado);
    const dele = golosDe(outroLado(j.lado));
    const peso = defensivo[j.posicao] ?? 0;
    let nota = n.base + (ajuste.get(j.id) ?? 0);
    if (peso > 0) {
      nota += n.golosSofridos * dele * peso;
      if (dele === 0) nota += n.balizaZero * peso;
    }
    nota += meu > dele ? n.resultado : meu < dele ? -n.resultado : 0;
    nota += (rng.derivar(j.id).float() * 2 - 1) * n.ruido;
    j.nota = arredondar(limitar(nota, n.min, n.max), 1);
    j.xg = arredondar(j.xg, 3);
    j.golosSofridos = j.posicao === "GR" ? dele : 0;
  }

  const lista = [...jogadores.values()];
  const melhor = [...lista].sort((a, b) => b.nota - a.nota || b.golos + b.assistencias - (a.golos + a.assistencias) || b.xg - a.xg || a.id.localeCompare(b.id))[0] as EstatJogador;
  momentos.sort((a, b) => a.minuto - b.minuto);
  return {
    duracao: resumo.duracao,
    golosCasa: marcador.casa,
    golosFora: marcador.fora,
    intervalo,
    posseCasa: resumo.posseCasa,
    casa: resumo.casa,
    fora: resumo.fora,
    golos,
    cartoes,
    momentos,
    jogadores: lista,
    homemDoJogo: melhor.id,
  };
}
