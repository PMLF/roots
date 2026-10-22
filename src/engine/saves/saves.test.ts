import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { IsoDate } from "../persistence/types";
import { MemorySaveStore, autosaveIfDue, createSave, listSaves, prune, readSaveFile, type AutosaveState, type Codec, type SaveContext } from "./saves";

const codec: Codec = { compress: async (b) => new Uint8Array(gzipSync(b)), decompress: async (b) => new Uint8Array(gunzipSync(b)) };
const sqlite = (extra = "x") => new Uint8Array([...new TextEncoder().encode("SQLite format 3\u0000"), ...new TextEncoder().encode(extra)]);

function world() {
  const store = new MemorySaveStore();
  const st = { club: "Pacense", gameDate: "2026-07-01" as IsoDate, season: 1 };
  let clock = Date.UTC(2026, 9, 22, 12);
  const ctx: SaveContext = { store, codec, exportCurrent: async () => sqlite(st.gameDate), state: () => ({ ...st }), now: () => new Date((clock += 1000)) };
  return { store, st, ctx };
}

describe("saves (RZ-134)", () => {
  it("guarda comprimido, lista com resumo e o ficheiro volta a ser o SQLite", async () => {
    const { ctx, store } = world();
    const meta = await createSave(ctx, "manual", "Antes da final");
    expect(meta).toMatchObject({ kind: "manual", name: "Antes da final", club: "Pacense", season: 1, gameDate: "2026-07-01" });
    expect(meta.bytes).toBeGreaterThan(0);
    const back = await readSaveFile((await store.get(meta.id))!, codec);
    expect(new TextDecoder().decode(back.subarray(0, 6))).toBe("SQLite");
    expect((await listSaves(store)).map((x) => x.id)).toEqual([meta.id]);
  });

  it("rejeita ficheiros que não são saves", async () => {
    await expect(readSaveFile(new TextEncoder().encode("olá, isto não é um save"), codec)).rejects.toThrow("não é um save");
    await expect(readSaveFile(new Uint8Array([0x1f, 0x8b, 1, 2, 3]), codec)).rejects.toThrow("danificado");
    // um .sqlite sem compressão também entra
    await expect(readSaveFile(sqlite(), codec)).resolves.toBeDefined();
  });

  it("autosave de 7 em 7 dias de jogo, só 3 rotativos, e o primeiro avanço só marca o ponto de partida", async () => {
    const { ctx, st, store } = world();
    let state: AutosaveState = {};
    const advanceTo = async (date: IsoDate) => {
      st.gameDate = date;
      const r = await autosaveIfDue(ctx, P, state);
      state = r.state;
      return r.saved.length;
    };
    expect(await advanceTo("2026-07-02")).toBe(0);
    expect(await advanceTo("2026-07-05")).toBe(0);
    expect(await advanceTo("2026-07-09")).toBe(1);
    expect(await advanceTo("2026-07-12")).toBe(0);
    expect(await advanceTo("2026-07-16")).toBe(1);
    expect(await advanceTo("2026-07-23")).toBe(1);
    expect(await advanceTo("2026-07-30")).toBe(1);
    expect((await store.list()).filter((x) => x.kind === "auto")).toHaveLength(P.saves.rotatingAutosaves);
  });

  it("guarda um save no início de cada época e mantém só os mais recentes; os manuais nunca se apagam", async () => {
    const { ctx, st, store } = world();
    await createSave(ctx, "manual", "meu");
    let state: AutosaveState = {};
    for (let season = 1; season <= 9; season++) {
      st.season = season;
      st.gameDate = `${2026 + season}-07-01` as IsoDate;
      state = (await autosaveIfDue(ctx, P, state)).state;
    }
    const all = await listSaves(store);
    expect(all.filter((x) => x.kind === "season")).toHaveLength(P.saves.keepSeasonSaves);
    expect(all.filter((x) => x.kind === "season")[0]!.season).toBe(9);
    expect(all.filter((x) => x.kind === "manual")).toHaveLength(1);
    await prune(store, P);
    expect(all.filter((x) => x.kind === "backup")).toHaveLength(0);
  });
});
