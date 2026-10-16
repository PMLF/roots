import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { describe, expect, it } from "vitest";
import { repositoryContract, ev } from "../persistencia/repositorio.contrato";
import { SqliteRepository } from "../persistencia/repositorioSqlite";
import { involve } from "./driverWasm";

// No Node o pacote resolve para a versão em memória (sem OPFS): serve para validar o nosso invólucro
// do driver com a mesma bateria dos outros adaptadores. O OPFS verifica-se no browser (RZ-128, notas).
const s = await sqlite3InitModule();
const fresh = () => involve(s, new s.oo1.DB(":memory:", "c"));

repositoryContract("SQLite WASM", () => new SqliteRepository(fresh()));

describe("driver sqlite-wasm", () => {
  it("exporta e reimporta o ficheiro", () => {
    const d = fresh();
    const r = new SqliteRepository(d);
    r.appendEvent(ev("X", { entities: [{ k: "club", id: "c1" }] }));
    const bytes = r.exportSqlite();
    expect(bytes.byteLength).toBeGreaterThan(4096);
    const db2 = new s.oo1.DB(":memory:", "c");
    const p = s.wasm.allocFromTypedArray(bytes);
    expect(s.capi.sqlite3_deserialize(db2, "main", p, bytes.byteLength, bytes.byteLength, s.capi.SQLITE_DESERIALIZE_FREEONCLOSE)).toBe(0);
    expect(new SqliteRepository(involve(s, db2)).count("X")).toBe(1);
  });
});
