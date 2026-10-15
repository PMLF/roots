import { describe, expect, it } from "vitest";
import { VERSAO_ESQUEMA, VERSAO_MOTOR, tratar } from "./handler";
import { PARAMETROS_PADRAO } from "../config/parametros";

describe("handler do motor", () => {
  it("responde ao ping com o mesmo eco", () => {
    const r = tratar({ id: 1, tipo: "ping", entrada: { eco: "olá" } });
    expect(r.eco).toBe("olá");
    expect(r.relogioMs).toBeGreaterThan(0);
  });
  it("devolve versão e parâmetros", () => {
    expect(tratar({ id: 2, tipo: "versao", entrada: null })).toEqual({ motor: VERSAO_MOTOR, esquema: VERSAO_ESQUEMA });
    expect(tratar({ id: 3, tipo: "parametros", entrada: null })).toEqual(PARAMETROS_PADRAO);
  });
});
