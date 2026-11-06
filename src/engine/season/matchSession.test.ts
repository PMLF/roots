import { describe, expect, it } from "vitest";
import { namesOf } from "./matchSession";
import type { BaseData } from "../data/types";

describe("nomes dos clubes no jogo ao vivo", () => {
  it("clubes estrangeiros (competições europeias) aparecem pelo nome e não pelo id", () => {
    const data = { clubs: [{ id: "a", name: "CD A" }], foreignClubs: [{ id: "x-hr-01", name: "NK Zagreb" }] } as unknown as BaseData;
    const names = namesOf(data);
    expect(names.get("a")).toBe("CD A");
    expect(names.get("x-hr-01")).toBe("NK Zagreb");
  });
});
