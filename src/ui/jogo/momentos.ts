/** Momentos-chave de um jogo em texto, no idioma do gamer (RZ-105). O motor só dá dados; as frases são da interface. */
import type { MomentKey } from "../../engine/jogo/estatisticas";
import { translate, type Key, type Locale } from "../i18n";

export type MatchNames = {
  /** Nome curto de um jogador a partir do id. */
  player: (id: string) => string;
  club: { home: string; away: string };
};

const goalKey = (m: Extract<MomentKey, { type: "goal" }>): Key => {
  if (m.origin === "penalty") return "momento.golo.penalti";
  if (m.origin === "corner") return "momento.golo.canto";
  if (m.origin === "free") return "momento.golo.livre";
  return `momento.golo.${m.context}` as Key;
};

/** Uma frase por momento, p. ex. «34' — Rui Alves abre o marcador (CD Foz). Assistência de Tiago Melo.» */
export function momentInText(locale: Locale, m: MomentKey, names: MatchNames): string {
  const club = names.club[m.side];
  const player = names.player(m.player);
  let phrase: string;
  switch (m.type) {
    case "goal":
      phrase = translate(locale, goalKey(m), { player, club });
      if (m.assistant) phrase += ` ${translate(locale, "momento.assistencia", { assistant: names.player(m.assistant) })}`;
      break;
    case "penalti-falhado":
      phrase = m.saved && m.goalkeeper ? translate(locale, "momento.penaltiDefendido", { player, goalkeeper: names.player(m.goalkeeper) }) : translate(locale, "momento.penaltiFalhado", { player });
      break;
    case "grande-defesa":
      phrase = translate(locale, "momento.grandeDefesa", { player, goalkeeper: names.player(m.goalkeeper) });
      break;
    case "injury":
      phrase = translate(locale, "momento.lesao", { player, type: translate(locale, `lesao.tipo.${m.injury.type}` as Key), severity: translate(locale, `lesao.gravidade.${m.injury.severity}` as Key) });
      phrase += m.substitute ? ` ${translate(locale, "momento.lesaoSubstituto", { substitute: names.player(m.substitute) })}` : ` ${translate(locale, "momento.lesaoSemSuplente", { club })}`;
      break;
    case "expulsao":
      phrase = translate(locale, m.secondYellow ? "momento.expulsaoSegundoAmarelo" : "momento.expulsao", { player, club });
      break;
    case "ocasiao-falhada":
      phrase = translate(locale, "momento.ocasiaoFalhada", { player, club });
      break;
  }
  return `${m.minute}' — ${phrase}`;
}

/** O marcador depois de um golo, p. ex. «CD Foz 1-0 SC Mar». */
export function scorerInText(locale: Locale, m: Extract<MomentKey, { type: "goal" }>, names: MatchNames): string {
  return translate(locale, "momento.marcador", { home: names.club.home, away: names.club.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals });
}
