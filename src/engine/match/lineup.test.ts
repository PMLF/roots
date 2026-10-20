import { describe, expect, it } from "vitest";
import { BENCH_SIZE, missingPositions, moveToBench, moveToReserve, moveToSlot, remapLineup, type Board } from "./lineup";

const empty = (): Board => ({ slots: Array.from({ length: 11 }, () => undefined), bench: [] });

describe("onze do gamer (RZ-248)", () => {
  it("as posições em falta contam-se por formação", () => {
    expect(missingPositions("4-4-2", ["GK", "CB"])).toHaveLength(9);
    expect(missingPositions("4-4-2", ["GK", "CB", "CB", "RB", "LB", "RW", "LW", "CM", "CM", "ST", "ST"])).toEqual([]);
    // uma posição que a formação não tem não ocupa lugar
    expect(missingPositions("4-4-2", ["AM"])).toHaveLength(11);
  });
  it("mudar de formação mantém quem ainda tem lugar e deixa os outros por escolher", () => {
    const kept = remapLineup([{ player: "a", position: "GK" }, { player: "b", position: "DM" }, { player: "c", position: "AM" }, { player: "d", position: "ST" }], "4-4-2");
    expect(kept.map((s) => s.player)).toEqual(["a", "d"]);
  });
  it("arrastar para um lugar ocupado troca com quem lá estava", () => {
    let b = moveToSlot(empty(), "a", 0);
    b = moveToSlot(b, "b", 1);
    b = moveToSlot(b, "a", 1);
    expect(b.slots.slice(0, 2)).toEqual(["b", "a"]);
  });
  it("quem vem do banco e ocupa um lugar manda o titular para o banco; do reservas, o titular vai para os reservas", () => {
    let b: Board = { ...moveToSlot(empty(), "a", 0), bench: ["x"] };
    b = moveToSlot(b, "x", 0);
    expect(b.slots[0]).toBe("x");
    expect(b.bench).toEqual(["a"]);
    b = moveToSlot(b, "r", 0);
    expect(b.slots[0]).toBe("r");
    expect(b.bench).toEqual(["a"]);
    expect(b.slots).not.toContain("x");
  });
  it("o banco tem limite; mandar para reservas liberta o lugar", () => {
    let b: Board | undefined = empty();
    for (let i = 0; i < BENCH_SIZE; i++) b = moveToBench(b!, `s${i}`);
    expect(moveToBench(b!, "extra")).toBeUndefined();
    b = moveToReserve(b!, "s0");
    expect(moveToBench(b, "extra")?.bench).toHaveLength(BENCH_SIZE);
  });
});
