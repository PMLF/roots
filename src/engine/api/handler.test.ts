import { describe, expect, it } from "vitest";
import { VERSAO_ESQUEMA, VERSAO_MOTOR, tratar, type Servicos } from "./handler";
import { PARAMETROS_PADRAO } from "../config/parametros";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";

function servicosDeTeste(): Servicos {
  const repositorio = new RepositorioMemoria();
  return { abrirRepositorio: async () => ({ repositorio, backend: "memoria", versaoSqlite: "teste" }) };
}

describe("handler do motor", () => {
  const s = servicosDeTeste();
  it("responde ao ping com o mesmo eco", async () => {
    const r = await tratar({ id: 1, tipo: "ping", entrada: { eco: "olá" } }, s);
    expect(r.eco).toBe("olá");
    expect(r.relogioMs).toBeGreaterThan(0);
  });
  it("devolve versão e parâmetros", async () => {
    expect(await tratar({ id: 2, tipo: "versao", entrada: null }, s)).toEqual({ motor: VERSAO_MOTOR, esquema: VERSAO_ESQUEMA });
    expect(await tratar({ id: 3, tipo: "parametros", entrada: null }, s)).toEqual(PARAMETROS_PADRAO);
  });
  it("autodiagnóstico da base de dados: cada abertura acrescenta um evento", async () => {
    const a = await tratar({ id: 4, tipo: "bd", entrada: null }, s);
    const b = await tratar({ id: 5, tipo: "bd", entrada: null }, s);
    expect(a).toMatchObject({ backend: "memoria", persistente: false, esquema: VERSAO_ESQUEMA, aberturas: 1, eventos: 1 });
    expect(b).toMatchObject({ aberturas: 2, eventos: 2 });
  });
});
