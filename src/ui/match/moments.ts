/** Momentos-chave de um jogo em texto, no idioma do gamer (RZ-105). O motor só dá dados; as frases são da interface. */
import type { MomentKey } from "../../engine/match/statistics";
import { translate, type Key, type Locale } from "../i18n/index";

export type MatchNames = {
  /** Nome curto de um jogador a partir do id. */
  player: (id: string) => string;
  club: { home: string; away: string };
};

const goalKey = (m: Extract<MomentKey, { type: "goal" }>): Key => {
  if (m.origin === "penalty") return "moment.goal.penalty";
  if (m.origin === "corner") return "moment.goal.corner";
  if (m.origin === "free") return "moment.goal.free";
  return `moment.goal.${m.context}` as Key;
};

/** Uma frase por momento, p. ex. «34' — Rui Alves abre o marcador (CD Foz). Assistência de Tiago Melo.» */
export function momentInText(locale: Locale, m: MomentKey, names: MatchNames): string {
  const club = names.club[m.side];
  const player = names.player(m.player);
  let phrase: string;
  switch (m.type) {
    case "goal":
      phrase = translate(locale, goalKey(m), { player, club });
      if (m.assistant) phrase += ` ${translate(locale, "moment.attendance", { assistant: names.player(m.assistant) })}`;
      break;
    case "penalty-missed":
      phrase = m.saved && m.goalkeeper ? translate(locale, "moment.penaltySaved", { player, goalkeeper: names.player(m.goalkeeper) }) : translate(locale, "moment.penaltyMissed", { player });
      break;
    case "big-save":
      phrase = translate(locale, "moment.bigSave", { player, goalkeeper: names.player(m.goalkeeper) });
      break;
    case "injury":
      phrase = translate(locale, "moment.injury", { player, type: translate(locale, `injury.type.${m.injury.type}` as Key), severity: translate(locale, `injury.severity.${m.injury.severity}` as Key) });
      phrase += m.substitute ? ` ${translate(locale, "moment.injurySubstitute", { substitute: names.player(m.substitute) })}` : ` ${translate(locale, "moment.injuryNoSubstitute", { club })}`;
      break;
    case "sendingOff":
      phrase = translate(locale, m.secondYellow ? "moment.sendingOffSecondYellow" : "moment.sendingOff", { player, club });
      break;
    case "chance-missed":
      phrase = translate(locale, "moment.missedChance", { player, club });
      break;
  }
  return `${m.minute}' — ${phrase}`;
}

/** O marcador depois de um golo, p. ex. «CD Foz 1-0 SC Mar». */
export function scorerInText(locale: Locale, m: Extract<MomentKey, { type: "goal" }>, names: MatchNames): string {
  return translate(locale, "moment.scorer", { home: names.club.home, away: names.club.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals });
}
