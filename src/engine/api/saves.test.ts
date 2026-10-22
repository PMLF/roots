import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "./handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { MemorySaveStore } from "../saves/saves";

const fakeSqlite = (tag: string) => new Uint8Array([...new TextEncoder().encode("SQLite format 3\u0000"), ...new TextEncoder().encode(tag)]);

function servicos() {
  const repository = new MemoryRepository();
  const replaced: Uint8Array[] = [];
  let tick = Date.UTC(2026, 9, 22);
  const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  const s: Servicos = {
    now: () => new Date((tick += 1000)),
    openRepository: async () => ({ repository, backend: "memory", sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
    saves: new MemorySaveStore(),
    codec: { compress: async (b) => new Uint8Array(gzipSync(b)), decompress: async (b) => new Uint8Array(gunzipSync(b)) },
    exportCurrent: async () => fakeSqlite(repository.meta("date.today") ?? "x"),
    replaceCurrent: async (bytes) => { replaced.push(bytes); },
  };
  return { s, replaced };
}

describe("saves pelo handler (RZ-134)", { timeout: 180000 }, () => {
  it("guarda, avança no tempo com autosave, exporta, importa e carrega com cópia de segurança", async () => {
    const { s, replaced } = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "saves" } }, s);
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    await handle({ id: 3, type: "chooseClub", input: { id: clubs.find((c) => c.league.startsWith("Distrital"))!.id } }, s);

    const manual = await handle({ id: 4, type: "saveGame", input: { name: "  Início  " } }, s);
    expect(manual).toMatchObject({ kind: "manual", name: "Início" });
    expect(manual.club).toBeTruthy();

    for (let i = 0; i < 6; i++) {
      const r = await handle({ id: 10 + i, type: "advance", input: { mode: "week" } }, s);
      if (r.pause) await handle({ id: 30 + i, type: "confirmMatch", input: { match: r.pause.match } }, s);
    }
    const list = await handle({ id: 5, type: "saves", input: null }, s);
    expect(list.filter((x) => x.kind === "auto").length).toBeGreaterThanOrEqual(1);
    expect(list.filter((x) => x.kind === "auto").length).toBeLessThanOrEqual(3);
    expect(list.filter((x) => x.kind === "manual")).toHaveLength(1);

    // exportar: o ficheiro é gzip de um SQLite e importa-se de volta
    const file = await handle({ id: 6, type: "exportSave", input: { id: manual.id } }, s);
    expect(file.filename).toMatch(/\.raizes$/);
    expect(file.bytes[0]).toBe(0x1f);
    await handle({ id: 7, type: "importSave", input: { bytes: file.bytes } }, s);
    expect(replaced).toHaveLength(1);
    expect(new TextDecoder().decode(replaced[0]!.subarray(0, 6))).toBe("SQLite");
    expect((await handle({ id: 8, type: "saves", input: null }, s)).some((x) => x.kind === "backup" && x.name?.includes("importar"))).toBe(true);

    // ficheiros que não são saves não substituem nada
    await expect(handle({ id: 9, type: "importSave", input: { bytes: new TextEncoder().encode("não sou um save") } }, s)).rejects.toThrow("não é um save");
    expect(replaced).toHaveLength(1);

    // carregar: guarda cópia do que havia e troca o mundo
    await handle({ id: 50, type: "loadSave", input: { id: manual.id } }, s);
    expect(replaced).toHaveLength(2);
    expect((await handle({ id: 51, type: "saves", input: null }, s)).some((x) => x.kind === "backup" && x.name?.includes("carregar"))).toBe(true);
    await handle({ id: 52, type: "deleteSave", input: { id: manual.id } }, s);
    expect((await handle({ id: 53, type: "saves", input: null }, s)).some((x) => x.id === manual.id)).toBe(false);
  });

  it("sem armazenamento, os pedidos de saves dizem porquê e o avanço do tempo não falha", async () => {
    const { s } = servicos();
    delete (s as { saves?: unknown }).saves;
    await expect(handle({ id: 1, type: "saves", input: null }, s)).rejects.toThrow("não estão disponíveis");
    await handle({ id: 2, type: "createWorld", input: { seed: "nosave" } }, s);
    await expect(handle({ id: 3, type: "advance", input: { mode: "day" } }, s)).resolves.toBeDefined();
  });
});
