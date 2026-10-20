import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../match/types";
import { matchLines } from "./liveMatch";

describe("feed do jogo: cartões (RZ-255)", () => {
  it("um segundo amarelo é um só lance (vermelho com segundo amarelo), não amarelo + vermelho", () => {
    const events: MatchEvent[] = [
      { type: "card", minute: 30, side: "home", player: "a", colour: "yellow" },
      { type: "card", minute: 60, side: "home", player: "a", colour: "yellow" },
      { type: "card", minute: 60, side: "home", player: "a", colour: "red", secondYellow: true },
      { type: "card", minute: 70, side: "away", player: "b", colour: "red" },
    ];
    const cards = matchLines(events, 90, (id) => id).filter((l) => l.type === "card");
    expect(cards.map((l) => `${l.minute}/${l.player}/${l.colour}/${l.secondYellow ? "2" : ""}`)).toEqual(["30/a/yellow/", "60/a/red/2", "70/b/red/"]);
  });
});
