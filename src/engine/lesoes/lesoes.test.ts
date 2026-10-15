import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { PARAMETROS_PADRAO as P, validarParametros } from "../config/parametros";
import { relatorioDoJogo } from "../jogo/estatisticas";
import { registoDoJogo } from "../jogo/registo";
import { SimuladorJogo, simularJogo } from "../jogo/simulador";
import { equipaSintetica } from "../jogo/teste-util";
import { TATICA_PADRAO } from "../jogo/formacoes";
import type { EntradaJogo, EquipaJogo, EventoJogo, JogadorEmCampo, Tatica } from "../jogo/tipos";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { EVENTO_LESAO, estadoFisico, eventoLesao, lesionadosDoClube, semLesionados } from "./estado";
import { formaDoJogador } from "./forma";
import { riscoPor90, sortearLesao, type ContextoRisco } from "./lesao";

const base: ContextoRisco = { forma: 1, aptidaoFisica: 10 };

describe("lesões: sorteio e risco", () => {
  it("os parâmetros são válidos", () => {
    expect(validarParametros(P)).toEqual([]);
  });

  it("a gravidade segue a distribuição e os dias ficam nos limites", () => {
    const n = 20000;
    const cont = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const l = sortearLesao(new Rng("s", `l${i}`), P);
      cont[l.gravidade - 1]!++;
      const [min, max] = P.lesoes.gravidades[l.gravidade - 1]!.dias;
      expect(l.dias).toBeGreaterThanOrEqual(min);
      expect(l.dias).toBeLessThanOrEqual(max);
      expect(l.recaida).toBe(false);
    }
    P.lesoes.gravidades.forEach((g, k) => expect(Math.abs(cont[k]! / n - g.peso)).toBeLessThan(0.02));
  });

  it("os tipos fazem sentido com a gravidade: ligeiras são pancadas ou musculares, as gravíssimas ligamentos ou fraturas", () => {
    for (let i = 0; i < 5000; i++) {
      const l = sortearLesao(new Rng("s", `t${i}`), P);
      if (l.gravidade === 1) expect(["pancada", "muscular", "entorse"]).toContain(l.tipo);
      if (l.gravidade === 5) expect(["ligamentos", "fratura"]).toContain(l.tipo);
    }
  });

  it("a recaída repete o tipo e dura mais; o staff médico encurta a paragem", () => {
    const media = (opc: Parameters<typeof sortearLesao>[2], prefixo: string) => {
      let t = 0;
      for (let i = 0; i < 4000; i++) t += sortearLesao(new Rng("s", `${prefixo}${i}`), P, opc).dias;
      return t / 4000;
    };
    const normal = media({}, "n");
    expect(media({ recaida: "muscular" }, "n")).toBeGreaterThan(normal * 1.2);
    expect(sortearLesao(new Rng("s", "r"), P, { recaida: "entorse" })).toMatchObject({ tipo: "entorse", recaida: true });
    expect(media({ medico: 20 }, "n")).toBeLessThan(normal * 0.88);
    expect(media({ medico: 1 }, "n")).toBeGreaterThan(normal * 1.1);
  });

  it("é determinístico", () => {
    expect(sortearLesao(new Rng("s", "x"), P)).toEqual(sortearLesao(new Rng("s", "x"), P));
  });

  it("o risco sobe com fadiga, calendário, relvado mau, intensidade, adversário duro e recaída; desce com físico e médicos", () => {
    const r0 = riscoPor90(base, P);
    expect(r0).toBeCloseTo(P.lesoes.pPorJogadorJogo, 10);
    const mais: Partial<ContextoRisco>[] = [{ forma: 0.8 }, { relvado: 0 }, { medico: 3 }, { aptidaoFisica: 4 }, { fairPlayAdversario: 5 }, { intensidade: 5 }, { fadiga: 2 }, { recaida: true }];
    for (const m of mais) expect(riscoPor90({ ...base, ...m }, P), JSON.stringify(m)).toBeGreaterThan(r0);
    const menos: Partial<ContextoRisco>[] = [{ forma: 1.1 }, { relvado: 1 }, { medico: 18 }, { aptidaoFisica: 17 }, { fairPlayAdversario: 1 }, { intensidade: 1 }];
    for (const m of menos) expect(riscoPor90({ ...base, ...m }, P), JSON.stringify(m)).toBeLessThan(r0);
    expect(riscoPor90({ ...base, forma: 0.7, relvado: 0, medico: 1, aptidaoFisica: 1, fairPlayAdversario: 5, intensidade: 5, fadiga: 5, recaida: true }, P)).toBeLessThanOrEqual(1);
  });
});

describe("forma e calendário", () => {
  const jogo = (data: string, minutos = 90) => ({ data, minutos });
  it("descansado = 1; calendário apertado cansa; descansar recupera", () => {
    expect(formaDoJogador({ hoje: "2026-10-10", jogos: [] }, P)).toBe(1);
    const apertado = formaDoJogador({ hoje: "2026-10-10", jogos: [jogo("2026-10-09"), jogo("2026-10-06"), jogo("2026-10-03")] }, P);
    const folgado = formaDoJogador({ hoje: "2026-10-10", jogos: [jogo("2026-09-30")] }, P);
    expect(apertado).toBeLessThan(folgado);
    expect(apertado).toBeLessThan(0.95);
    // mais dias de descanso, mais forma
    const dia = (d: string) => formaDoJogador({ hoje: d, jogos: [jogo("2026-10-03"), jogo("2026-10-06"), jogo("2026-10-09")] }, P);
    expect(dia("2026-10-12")).toBeGreaterThan(dia("2026-10-10"));
    expect(dia("2026-10-30")).toBe(1); // fora da janela
    // poucos minutos cansam menos
    expect(formaDoJogador({ hoje: "2026-10-10", jogos: [jogo("2026-10-09", 20)] }, P)).toBeGreaterThan(formaDoJogador({ hoje: "2026-10-10", jogos: [jogo("2026-10-09", 90)] }, P));
  });
  it("quem regressa de lesão volta com forma baixa que sobe dia a dia", () => {
    const f = (hoje: string) => formaDoJogador({ hoje, jogos: [], regressouEm: "2026-10-01" }, P);
    expect(f("2026-10-01")).toBeCloseTo(P.lesoes.forma.aoRegressar, 6);
    expect(f("2026-10-05")).toBeGreaterThan(f("2026-10-01"));
    expect(f("2026-10-20")).toBe(1);
  });
  it("fica sempre entre os limites", () => {
    const muitos = Array.from({ length: 14 }, (_, i) => jogo(`2026-10-${String(i + 1).padStart(2, "0")}`));
    const v = formaDoJogador({ hoje: "2026-10-15", jogos: muitos }, P);
    expect(v).toBeGreaterThanOrEqual(P.lesoes.forma.min);
    expect(v).toBeLessThanOrEqual(P.lesoes.forma.max);
  });
});

describe("estado físico a partir do histórico", () => {
  const lesao = { tipo: "muscular", gravidade: 2, dias: 14, recaida: false } as const;
  it("lesionado até ao dia certo, depois recém-regressado, depois nada; o histórico não se apaga", () => {
    const r = new RepositorioMemoria();
    r.acrescentarEvento(eventoLesao({ jogador: "p1", clube: "A", data: "2026-10-01", epoca: 1, lesao }));
    const e = (hoje: string) => estadoFisico(r, "p1", hoje, P);
    expect(e("2026-09-30")).toMatchObject({ lesoesNoHistorico: 0 });
    expect(e("2026-10-01").lesionado).toMatchObject({ tipo: "muscular", ate: "2026-10-15", diasRestantes: 14 });
    expect(e("2026-10-14").lesionado?.diasRestantes).toBe(1);
    const volta = e("2026-10-15");
    expect(volta.lesionado).toBeUndefined();
    expect(volta.recemRegressado).toEqual({ tipo: "muscular", regressouEm: "2026-10-15" });
    expect(e("2026-12-15")).toMatchObject({ lesoesNoHistorico: 1 });
    expect(e("2026-12-15").recemRegressado).toBeUndefined();
    expect(estadoFisico(r, "outro", "2026-10-05", P)).toEqual({ jogador: "outro", lesoesNoHistorico: 0 });
  });

  it("filtra os lesionados de um plantel", () => {
    const r = new RepositorioMemoria();
    r.acrescentarEvento(eventoLesao({ jogador: "p1", clube: "A", data: "2026-10-01", epoca: 1, lesao }));
    r.acrescentarEvento(eventoLesao({ jogador: "p2", clube: "A", data: "2026-10-01", epoca: 1, lesao: { ...lesao, dias: 3 } }));
    const les = lesionadosDoClube(r, ["p1", "p2", "p3"], "2026-10-08", P);
    expect(les.map((l) => l.jogador)).toEqual(["p1"]);
    expect(semLesionados([{ pessoa: "p1" }, { pessoa: "p2" }, { pessoa: "p3" }], les).map((c) => c.pessoa)).toEqual(["p2", "p3"]);
    expect(eventoLesao({ jogador: "p1", clube: "A", data: "2026-10-01", epoca: 1, lesao, jogo: "j1", minuto: 33 }).dados).toMatchObject({ jogo: "j1", minuto: 33, ate: "2026-10-15" });
    expect(EVENTO_LESAO).toBe("LESAO");
  });
});

// ---------- no jogo

function comBanco(eq: EquipaJogo, n = 7): EquipaJogo {
  const posicoes = ["GK", "CB", "RB", "CM", "CM", "RW", "ST"] as const;
  const banco: JogadorEmCampo[] = Array.from({ length: n }, (_, i) => ({ ...(eq.onze[1] as JogadorEmCampo), id: `${eq.clube}-b${i}`, posicao: posicoes[i % posicoes.length] as JogadorEmCampo["posicao"] }));
  return { ...eq, banco };
}
type Les = Extract<EventoJogo, { tipo: "lesao" }>;
const lesoes = (e: readonly EventoJogo[]) => e.filter((x): x is Les => x.tipo === "lesao");

describe("lesões em jogo", () => {
  const entrada = (id: string, extra: Partial<EntradaJogo> = {}, casa = comBanco(equipaSintetica("A", 10)), fora = comBanco(equipaSintetica("B", 10))): EntradaJogo => ({ seed: "les", id, casa, fora, ...extra });

  it("calibração: ≈0,3-0,5 lesões por jogo", () => {
    let t = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const { eventos, resumo } = simularJogo(entrada(`c${i}`), P);
      t += lesoes(eventos).length;
      expect(resumo.casa.lesoes + resumo.fora.lesoes).toBe(lesoes(eventos).length);
    }
    console.log("lesões por jogo", t / N);
    expect(t / N).toBeGreaterThan(0.25);
    expect(t / N).toBeLessThan(0.55);
  });

  it("o lesionado sai e é substituído por alguém do banco; nunca volta; o suplente joga na posição dele", () => {
    let vistos = 0;
    for (let i = 0; i < 3000 && vistos < 30; i++) {
      const { eventos } = simularJogo(entrada(`s${i}`), P);
      for (const l of lesoes(eventos)) {
        vistos++;
        const sub = eventos.find((e) => e.tipo === "substituicao" && e.sai === l.jogador);
        expect(sub, "substituição").toMatchObject({ minuto: l.minuto, lado: l.lado, motivo: "lesao" });
        expect(l.jogador.startsWith(l.lado === "casa" ? "A-" : "B-")).toBe(true);
        expect(eventos.some((e) => e.minuto > l.minuto && "jogador" in e && e.jogador === l.jogador), "lesionado em campo").toBe(false);
      }
    }
    expect(vistos).toBeGreaterThan(10);
  });

  it("sem suplentes, joga-se com menos um e isso pesa", () => {
    let nSem = 0;
    for (let i = 0; i < 4000 && nSem < 5; i++) {
      const e = entrada(`n${i}`, {}, equipaSintetica("A", 10), equipaSintetica("B", 10));
      const { eventos } = simularJogo(e, P);
      if (lesoes(eventos).length > 0) {
        nSem++;
        expect(eventos.some((x) => x.tipo === "substituicao")).toBe(false);
      }
    }
    expect(nSem).toBeGreaterThan(0);
    // pior depois da lesão do que um jogo sem lesão
    let dez = 0, onze = 0;
    for (let i = 0; i < 40000; i++) {
      const { eventos } = simularJogo(entrada(`p${i}`, {}, equipaSintetica("A", 10), equipaSintetica("B", 10)), P);
      const l = lesoes(eventos).find((x) => x.minuto <= 60);
      if (!l) continue;
      for (const e of eventos) {
        if (e.tipo !== "remate" || e.resultado !== "golo" || e.minuto <= l.minuto) continue;
        if (e.lado === l.lado) dez++;
        else onze++;
      }
    }
    expect(dez / onze).toBeLessThan(0.9);
  }, 120000);

  const taxa = (cfg: (i: number) => EntradaJogo, lado: "casa" | "fora", n = 2500) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += lesoes(simularJogo(cfg(i), P).eventos).filter((l) => l.lado === lado).length;
    return t / n;
  };

  it("relvado mau, staff fraco, fair play duro do adversário e jogadores cansados: mais lesões", () => {
    const normal = taxa((i) => entrada(`x${i}`), "casa");
    const relvadoMau = taxa((i) => entrada(`x${i}`, { relvado: 0 }), "casa");
    const relvadoBom = taxa((i) => entrada(`x${i}`, { relvado: 1 }), "casa");
    expect(relvadoMau).toBeGreaterThan(normal * 1.2);
    expect(relvadoBom).toBeLessThan(normal * 0.9);
    const medicoFraco = taxa((i) => entrada(`x${i}`, {}, comBanco({ ...equipaSintetica("A", 10), medico: 2 })), "casa");
    const medicoBom = taxa((i) => entrada(`x${i}`, {}, comBanco({ ...equipaSintetica("A", 10), medico: 19 })), "casa");
    expect(medicoFraco).toBeGreaterThan(medicoBom * 1.3);
    const duro: Tatica = { ...TATICA_PADRAO, fairPlay: 5 };
    const adversarioDuro = taxa((i) => entrada(`x${i}`, {}, undefined, { ...comBanco(equipaSintetica("B", 10)), tatica: duro }), "casa");
    expect(adversarioDuro).toBeGreaterThan(normal * 1.25);
    const cansados = comBanco(equipaSintetica("A", 10));
    cansados.onze = cansados.onze.map((j) => ({ ...j, forma: 0.75 }));
    expect(taxa((i) => entrada(`x${i}`, {}, cansados), "casa")).toBeGreaterThan(normal * 1.4);
  }, 120000);

  it("quem acaba de voltar da mesma lesão tem pior sorte e uma recaída dura mais", () => {
    const eq = comBanco(equipaSintetica("A", 10));
    const alvo = eq.onze[5] as JogadorEmCampo;
    const frágil: EquipaJogo = { ...eq, onze: eq.onze.map((j) => (j.id === alvo.id ? { ...j, recaida: "muscular" as const } : j)) };
    let normal = 0, recaidas = 0, tipoCerto = true;
    for (let i = 0; i < 6000; i++) {
      normal += lesoes(simularJogo(entrada(`z${i}`, {}, eq), P).eventos).filter((l) => l.jogador === alvo.id).length;
      for (const l of lesoes(simularJogo(entrada(`z${i}`, {}, frágil), P).eventos).filter((x) => x.jogador === alvo.id)) {
        recaidas++;
        expect(l.lesao.recaida).toBe(true);
        tipoCerto &&= l.lesao.tipo === "muscular";
      }
    }
    expect(tipoCerto).toBe(true);
    expect(recaidas).toBeGreaterThan(normal * 1.5);
  }, 120000);

  it("alterarEquipa não traz de volta um lesionado", () => {
    for (let i = 0; i < 3000; i++) {
      const e = entrada(`a${i}`);
      const l = lesoes(simularJogo(e, P).eventos)[0];
      if (!l) continue;
      const s = new SimuladorJogo(e, P);
      s.simularAte(l.minuto);
      s.alterarEquipa(l.lado, e[l.lado]);
      expect(s.simularAte(94).some((x) => "jogador" in x && x.jogador === l.jogador)).toBe(false);
      return;
    }
    throw new Error("sem lesões");
  });
});

describe("lesões nas estatísticas e no registo", () => {
  it("minutos, momentos, factos, participações e eventos LESAO coerentes; o repositório aceita tudo", () => {
    for (let i = 0; i < 3000; i++) {
      const e: EntradaJogo = { seed: "reg", id: `g${i}`, casa: comBanco(equipaSintetica("A", 10)), fora: comBanco(equipaSintetica("B", 10)) };
      const { eventos, resumo } = simularJogo(e, P);
      const ls = lesoes(eventos);
      if (ls.length === 0 || eventos.some((x) => x.tipo === "cartao" && x.cor === "vermelho")) continue;
      const rel = relatorioDoJogo(e, { casa: e.casa, fora: e.fora }, eventos, resumo, P);
      const l = ls[0] as Les;
      const sai = rel.jogadores.find((j) => j.id === l.jogador)!;
      const sub = eventos.find((x) => x.tipo === "substituicao" && x.sai === l.jogador) as Extract<EventoJogo, { tipo: "substituicao" }>;
      const entra = rel.jogadores.find((j) => j.id === sub.entra)!;
      expect(sai).toMatchObject({ minutos: l.minuto, lesao: l.lesao });
      expect(entra.minutos).toBe(resumo.duracao - l.minuto);
      expect(entra.posicao).toBe(sai.posicao);
      expect(rel.momentos.find((m) => m.tipo === "lesao" && m.jogador === l.jogador)).toMatchObject({ substituto: sub.entra });
      // cada equipa soma 11 × duração em minutos (sem expulsões)
      for (const lado of ["casa", "fora"] as const) expect(rel.jogadores.filter((j) => j.lado === lado).reduce((s, j) => s + j.minutos, 0)).toBe(11 * resumo.duracao);
      expect(rel.jogadores.every((j) => j.minutos > 0)).toBe(true);

      const r = new RepositorioMemoria();
      const reg = registoDoJogo({ id: e.id, competicao: "ST", epoca: 1, jornada: 1, data: "2026-09-05" }, e.casa, e.fora, eventos, resumo, rel);
      expect(reg.factos.filter((f) => f.tipo === "L")).toHaveLength(ls.length);
      expect(reg.factos.find((f) => f.tipo === "L")?.extra).toBe(`gravidade:${l.lesao.gravidade}`);
      expect(reg.factos.filter((f) => f.tipo === "S")).toHaveLength(eventos.filter((x) => x.tipo === "substituicao").length);
      expect(reg.lesoes).toHaveLength(ls.length);
      expect(reg.participacoes.find((p) => p.jogador === sub.entra)).toMatchObject({ titular: false, minutos: entra.minutos });
      expect(reg.participacoes.find((p) => p.jogador === l.jogador)?.minutos).toBe(l.minuto);
      r.registarJogo(reg.jogo, reg.factos, reg.participacoes);
      for (const ev of reg.lesoes) r.acrescentarEvento(ev);
      const lesionado = estadoFisico(r, l.jogador, "2026-09-05", P);
      expect(lesionado.lesionado).toMatchObject({ tipo: l.lesao.tipo, gravidade: l.lesao.gravidade, jogo: e.id });
      return;
    }
    throw new Error("sem jogo adequado");
  });
});
