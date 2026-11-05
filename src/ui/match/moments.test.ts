import { describe, expect, it } from "vitest";
import type { MomentKey } from "../../engine/match/statistics";
import { scorerInText, momentInText } from "./moments";

const names = { player: (id: string) => ({ a: "Rui Alves", b: "Tiago Melo", gk: "Nuno Reis" })[id] ?? id, club: { home: "CD Foz", away: "SC Mar" } };
const goal = (extra: Partial<Extract<MomentKey, { type: "goal" }>> = {}): Extract<MomentKey, { type: "goal" }> => ({ type: "goal", minute: 34, side: "home", player: "a", origin: "openPlay", context: "opening", homeGoals: 1, awayGoals: 0, ...extra });

describe("momentos em texto", () => {
  it("escreve golos com contexto e assistência", () => {
    expect(momentInText("pt-PT", goal({ assistant: "b" }), names)).toBe("34' — Rui Alves abre o marcador (CD Foz). Assistência de Tiago Melo.");
    expect(momentInText("en", goal({ context: "turnaround", side: "away" }), names)).toBe("34' — Rui Alves turns the game around for SC Mar.");
  });
  it("a origem do golo tem prioridade sobre o contexto", () => {
    expect(momentInText("pt-PT", goal({ origin: "penalty" }), names)).toContain("converte o penálti");
    expect(momentInText("pt-PT", goal({ origin: "corner" }), names)).toContain("canto");
  });
  it("escreve penáltis falhados, grandes defesas e ocasiões falhadas", () => {
    expect(momentInText("pt-PT", { type: "penalty-missed", minute: 70, side: "away", player: "a", goalkeeper: "gk", saved: true }, names)).toBe("70' — Nuno Reis defende o penálti de Rui Alves.");
    expect(momentInText("pt-PT", { type: "penalty-missed", minute: 70, side: "away", player: "a", saved: false }, names)).toBe("70' — Rui Alves falha o penálti.");
    expect(momentInText("en", { type: "big-save", minute: 12, side: "home", player: "a", goalkeeper: "gk", xg: 0.4 }, names)).toBe("12' — Great save by Nuno Reis from Rui Alves.");
    expect(momentInText("pt-PT", { type: "chance-missed", minute: 5, side: "home", player: "a", xg: 0.5 }, names)).toBe("5' — Rui Alves desperdiça uma grande ocasião para CD Foz.");
  });
  it("escreve expulsões", () => {
    expect(momentInText("pt-PT", { type: "sendingOff", minute: 61, side: "away", player: "a", secondYellow: false }, names)).toBe("61' — Rui Alves é expulso e SC Mar fica com menos um.");
    expect(momentInText("en", { type: "sendingOff", minute: 61, side: "away", player: "a", secondYellow: true }, names)).toContain("second yellow");
  });
  it("escreve lesões, com e sem suplente", () => {
    const injury = { type: "muscular", severity: 2, days: 15, relapse: false } as const;
    expect(momentInText("pt-PT", { type: "injury", minute: 40, side: "home", player: "a", injury, substitute: "b" }, names)).toBe("40' — Rui Alves lesiona-se (lesão muscular, moderada). Entra Tiago Melo.");
    expect(momentInText("en", { type: "injury", minute: 40, side: "home", player: "a", injury }, names)).toBe("40' — Rui Alves is injured (muscle injury, moderate). CD Foz have no substitute left and play with ten.");
  });
  it("escreve o marcador", () => {
    expect(scorerInText("pt-PT", goal(), names)).toBe("CD Foz 1-0 SC Mar");
  });
});
