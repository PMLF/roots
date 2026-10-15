import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { abrirBetterSqlite } from "../../node/driverBetterSqlite";
import { Rng } from "../aleatorio/rng";
import { observarPlantelProprio } from "../conhecimento/observar";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { importarDados } from "../dados/importar";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { RepositorioSqlite } from "../persistencia/repositorioSqlite";
import { Vista } from "../vista/vista";
import { gerarMundo } from "./gerarMundo";
import { importarPaises } from "./paises";

const ler = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importarDados({ clubes: ler("clubes.csv"), cidades: ler("cidades.csv"), rivalidades: ler("rivalidades.csv"), distritos: ler("distritos.csv") });
const pr = importarPaises(ler("paises.csv"));
if (!d.ok || !pr.ok) throw new Error("dados inválidos");
const dados = d.dados;
const lote = gerarMundo({ seed: "integracao", dados, paises: pr.paises, params: P });
const meu = dados.clubes.find((c) => c.escalao === "terceiraLiga")!.id;
const outro = dados.clubes.find((c) => c.escalao === "segundaLiga")!.id;

describe.each([
  ["memória", () => new RepositorioMemoria()],
  ["SQLite", () => new RepositorioSqlite(abrirBetterSqlite())],
])("mundo guardado e visto (%s)", (_n, criar) => {
  const repo = criar();
  const progresso: number[] = [];
  repo.guardarMundo(lote, (f, t) => progresso.push(f / t));
  const data = "2026-07-01";
  const n = observarPlantelProprio(repo, meu, { data, epoca: 1 }, new Rng("obs"), P.conhecimento);
  const vista = new Vista(repo, { observador: meu, participantes: new Set([`clube:${meu}`]), data, epoca: 1 }, P.conhecimento);

  it("guarda tudo e reporta progresso até 100 %", () => {
    expect(repo.totalPessoas()).toBe(lote.pessoas.length);
    expect(progresso.at(-1)).toBe(1);
    expect(n).toBe(P.mundo.plantel.terceiraLiga);
  });
  it("o plantel próprio mostra estimativas com margem; o de outro clube só factos públicos", () => {
    const meus = vista.plantel(meu);
    expect(meus).toHaveLength(n);
    const f = vista.ficha(meus[0]!.id)!;
    expect(f.publico.idade).toBeGreaterThanOrEqual(16);
    expect(Object.keys(f.atributos!.campos).length).toBe(45);
    expect(f.potencial!.campos.potencial!.margem).toBeGreaterThan(0);
    expect(f.personalidade!.rotulos.length).toBeLessThanOrEqual(3);

    const alheio = vista.plantel(outro)[0]!;
    const fa = vista.ficha(alheio.id)!;
    expect(fa.publico.clube).toBe(outro);
    expect(fa.atributos).toBeUndefined();
    expect(fa.potencial).toBeUndefined();
    expect(fa.personalidade).toBeUndefined();
  });
  it("a Vista não devolve nada da verdade nem por acidente", () => {
    const txt = JSON.stringify(vista.ficha(vista.plantel(outro)[0]!.id));
    for (const proibido of ["potencial", "atributos", "lealdade", "arquetipo", "salario"]) expect(txt).not.toContain(`"${proibido}"`);
  });
  it("presidente e autarca são públicos pela Vista", () => {
    expect(vista.cargos({ clube: meu }).map((c) => c.funcao)).toContain("presidente");
    const cidade = dados.clubes.find((c) => c.id === meu)!.cidade;
    expect(vista.cargos({ cidade }).map((c) => c.funcao)).toContain("autarca");
  });
});

describe("os dois repositórios guardam o mesmo mundo", () => {
  it("ficha pública igual em memória e em SQLite", () => {
    const a = new RepositorioMemoria();
    const b = new RepositorioSqlite(abrirBetterSqlite());
    a.guardarMundo(lote);
    b.guardarMundo(lote);
    for (const p of lote.pessoas.filter((_, i) => i % 997 === 0)) {
      expect(b.pessoaPublica(p.id)).toEqual(a.pessoaPublica(p.id));
      expect(b.pessoa(p.id)).toEqual(a.pessoa(p.id));
    }
    expect(b.plantelPublico(meu)).toEqual(a.plantelPublico(meu));
  });
});
