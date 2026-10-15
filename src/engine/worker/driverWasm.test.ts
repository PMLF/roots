import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { describe, expect, it } from "vitest";
import { contratoRepositorio, ev } from "../persistencia/repositorio.contrato";
import { RepositorioSqlite } from "../persistencia/repositorioSqlite";
import { envolver } from "./driverWasm";

// No Node o pacote resolve para a versão em memória (sem OPFS): serve para validar o nosso invólucro
// do driver com a mesma bateria dos outros adaptadores. O OPFS verifica-se no browser (RZ-128, notas).
const s = await sqlite3InitModule();
const novo = () => envolver(s, new s.oo1.DB(":memory:", "c"));

contratoRepositorio("SQLite WASM", () => new RepositorioSqlite(novo()));

describe("driver sqlite-wasm", () => {
  it("exporta e reimporta o ficheiro", () => {
    const d = novo();
    const r = new RepositorioSqlite(d);
    r.acrescentarEvento(ev("X", { entidades: [{ k: "clube", id: "c1" }] }));
    const bytes = r.exportarSqlite();
    expect(bytes.byteLength).toBeGreaterThan(4096);
    const db2 = new s.oo1.DB(":memory:", "c");
    const p = s.wasm.allocFromTypedArray(bytes);
    expect(s.capi.sqlite3_deserialize(db2, "main", p, bytes.byteLength, bytes.byteLength, s.capi.SQLITE_DESERIALIZE_FREEONCLOSE)).toBe(0);
    expect(new RepositorioSqlite(envolver(s, db2)).contar("X")).toBe(1);
  });
});
