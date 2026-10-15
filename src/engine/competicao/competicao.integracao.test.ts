import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { gerarCalendarioLiga, paraRepositorio } from "../calendario/calendario";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { jogarJogo } from "../jogo/detalhe";
import { equipaSintetica } from "../jogo/teste-util";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { estadoDaCompeticao, tabelaDaCompeticao } from "./tabela";

describe("uma liga inteira: calendário, jogos, tabela e jornadas", () => {
  const clubes = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const forca = new Map(clubes.map((c, i) => [c, 14 - i]));
  const cal = gerarCalendarioLiga({ competicao: "L", escalao: "segundaLiga", clubes }, 1, P.calendario, new Rng("cal"));

  function jogar(parar?: string) {
    const repo = new RepositorioMemoria();
    const { jogos, folgas } = paraRepositorio(cal);
    repo.guardarCalendario(jogos, folgas);
    for (const g of [...jogos].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1))) {
      if (parar !== undefined && g.data > parar) break;
      const r = jogarJogo(
        { seed: "liga", id: g.id, casa: equipaSintetica(g.casa, forca.get(g.casa)!), fora: equipaSintetica(g.fora, forca.get(g.fora)!) },
        1,
        { id: g.id, competicao: g.competicao, epoca: g.epoca, jornada: g.jornada, data: g.data },
        P,
      );
      repo.registarJogo(r.registo.jogo, r.registo.factos, r.registo.participacoes);
    }
    return { repo, total: jogos.length };
  }

  it("no fim, a tabela tem todos os clubes, jogos certos, pontos coerentes e as melhores equipas em cima", () => {
    const { repo, total } = jogar();
    const t = tabelaDaCompeticao(repo, "L", 1, "liga", P, { seed: "x" });
    expect(t).toHaveLength(8);
    expect(t.map((l) => l.posicao)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t.every((l) => l.jogos === 14)).toBe(true);
    expect(t.reduce((s, l) => s + l.jogos, 0)).toBe(total * 2);
    expect(t.reduce((s, l) => s + l.golosMarcados, 0)).toBe(t.reduce((s, l) => s + l.golosSofridos, 0));
    for (let i = 1; i < t.length; i++) expect(t[i - 1]!.pontos).toBeGreaterThanOrEqual(t[i]!.pontos);
    // o mais forte fica no topo meia dúzia, o mais fraco nos últimos
    expect(["A", "B", "C"]).toContain(t[0]!.clube);
    expect(["F", "G", "H"]).toContain(t[7]!.clube);
    const e = estadoDaCompeticao(repo, "L", 1, "2027-06-30");
    expect(e).toMatchObject({ terminada: true, jogosJogados: total, jogosPorJogar: 0 });
    expect(e.jornadas).toHaveLength(14);
    expect(e.emAtraso).toEqual([]);
  });

  it("a meio da época: jornada atual, próxima data e clubes sem jogos continuam na tabela", () => {
    const meio = cal.jornadas[4]!.data;
    const { repo, total } = jogar(meio);
    const e = estadoDaCompeticao(repo, "L", 1, meio);
    expect(e.terminada).toBe(false);
    expect(e.jogosJogados).toBeGreaterThan(0);
    expect(e.jogosJogados).toBeLessThan(total);
    expect(e.jornadaAtual).toBeGreaterThanOrEqual(5);
    expect(e.emAtraso).toEqual([]);
    const sem = new RepositorioMemoria();
    const { jogos, folgas } = paraRepositorio(cal);
    sem.guardarCalendario(jogos, folgas);
    const t0 = tabelaDaCompeticao(sem, "L", 1, "liga", P, { seed: "x" });
    expect(t0.map((l) => l.clube).sort()).toEqual(clubes);
    expect(t0.every((l) => l.pontos === 0)).toBe(true);
    // jogos por jogar já passados da data contam como atraso
    expect(estadoDaCompeticao(sem, "L", 1, "2027-06-30").emAtraso).toHaveLength(total);
  });

  it("é determinístico", () => {
    const a = tabelaDaCompeticao(jogar().repo, "L", 1, "liga", P, { seed: "x" });
    const b = tabelaDaCompeticao(jogar().repo, "L", 1, "liga", P, { seed: "x" });
    expect(b).toEqual(a);
  });
});
