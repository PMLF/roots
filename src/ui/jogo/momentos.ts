/** Momentos-chave de um jogo em texto, no idioma do gamer (RZ-105). O motor só dá dados; as frases são da interface. */
import type { MomentoChave } from "../../engine/jogo/estatisticas";
import { traduzir, type Chave, type Locale } from "../i18n";

export type NomesJogo = {
  /** Nome curto de um jogador a partir do id. */
  jogador: (id: string) => string;
  clube: { casa: string; fora: string };
};

const chaveGolo = (m: Extract<MomentoChave, { tipo: "golo" }>): Chave => {
  if (m.origem === "penalti") return "momento.golo.penalti";
  if (m.origem === "canto") return "momento.golo.canto";
  if (m.origem === "livre") return "momento.golo.livre";
  return `momento.golo.${m.contexto}` as Chave;
};

/** Uma frase por momento, p. ex. «34' — Rui Alves abre o marcador (CD Foz). Assistência de Tiago Melo.» */
export function momentoEmTexto(locale: Locale, m: MomentoChave, nomes: NomesJogo): string {
  const clube = nomes.clube[m.lado];
  const jogador = nomes.jogador(m.jogador);
  let frase: string;
  switch (m.tipo) {
    case "golo":
      frase = traduzir(locale, chaveGolo(m), { jogador, clube });
      if (m.assistente) frase += ` ${traduzir(locale, "momento.assistencia", { assistente: nomes.jogador(m.assistente) })}`;
      break;
    case "penalti-falhado":
      frase = m.defendido && m.guardaRedes ? traduzir(locale, "momento.penaltiDefendido", { jogador, guardaRedes: nomes.jogador(m.guardaRedes) }) : traduzir(locale, "momento.penaltiFalhado", { jogador });
      break;
    case "grande-defesa":
      frase = traduzir(locale, "momento.grandeDefesa", { jogador, guardaRedes: nomes.jogador(m.guardaRedes) });
      break;
    case "ocasiao-falhada":
      frase = traduzir(locale, "momento.ocasiaoFalhada", { jogador, clube });
      break;
  }
  return `${m.minuto}' — ${frase}`;
}

/** O marcador depois de um golo, p. ex. «CD Foz 1-0 SC Mar». */
export function marcadorEmTexto(locale: Locale, m: Extract<MomentoChave, { tipo: "golo" }>, nomes: NomesJogo): string {
  return traduzir(locale, "momento.marcador", { casa: nomes.clube.casa, fora: nomes.clube.fora, golosCasa: m.golosCasa, golosFora: m.golosFora });
}
