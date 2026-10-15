import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { observarCampos, observarPersonalidade, sigmaDaQualidade } from "../conhecimento/observar";
import { PARAMETROS_PADRAO } from "../config/parametros";
import { ev } from "../persistencia/repositorio.contrato";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { Vista } from "./vista";

const K = PARAMETROS_PADRAO.conhecimento;
const ESCALA: [number, number] = [1, 20];
const alvo = (id: string) => ({ k: "pessoa" as const, id });
const vistaDe = (repo: RepositorioMemoria, epoca = 1, participantes: string[] = ["clube:meu"]) =>
  new Vista(repo, { observador: "meu", participantes: new Set(participantes), data: `${2026 + epoca}-09-01`, epoca }, K);
const pedido = (id: string, epoca = 1, extra: Partial<Parameters<typeof observarCampos>[1]> = {}) => ({
  observador: "meu", alvo: alvo(id), grupo: "atributos", fonte: "olheiro" as const, data: `${2026 + epoca}-09-01`, epoca, ...extra,
});

describe("Vista: conhecimento", () => {
  it("sem observação não devolve nada (nem atributos, nem personalidade)", () => {
    const repo = new RepositorioMemoria();
    const v = vistaDe(repo);
    expect(v.conhecimento(alvo("p1"), "atributos")).toBeUndefined();
    expect(v.conhecimento(alvo("p1"), "personalidade")).toBeUndefined();
    expect(v.estimativa(alvo("p1"), "atributos", "finalizacao")).toBeUndefined();
  });

  it("com observação devolve intervalo, margem = z·σ e dentro da escala", () => {
    const repo = new RepositorioMemoria();
    observarCampos(repo, pedido("p1"), { finalizacao: 19, passe: 2 }, ESCALA, new Rng("t"), K);
    const c = vistaDe(repo).conhecimento(alvo("p1"), "atributos");
    expect(c?.observacoes).toBe(1);
    const f = c?.campos.finalizacao;
    expect(f?.margem).toBeCloseTo(K.z * sigmaDaQualidade(K.qualidadePorFonte.olheiro, K), 1);
    expect(f?.intervalo[1]).toBeLessThanOrEqual(20);
    expect(c?.campos.passe?.intervalo[0]).toBeGreaterThanOrEqual(1);
    expect(f?.intervalo[0]).toBeLessThanOrEqual(f?.valor ?? 0);
  });

  it("o intervalo cobre o valor verdadeiro cerca de 80 % das vezes (z = 1,28)", () => {
    const repo = new RepositorioMemoria();
    const rng = new Rng("cobertura");
    const verdades: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const verdade = 6 + rng.float() * 8; // longe dos limites, para o corte da escala não enviesar
      verdades.push(verdade);
      observarCampos(repo, pedido(`p${i}`), { x: verdade }, ESCALA, rng, K);
    }
    const v = vistaDe(repo);
    const dentro = verdades.filter((t, i) => {
      const [lo, hi] = v.estimativa(alvo(`p${i}`), "atributos", "x")?.intervalo ?? [NaN, NaN];
      return t >= lo - 0.05 && t <= hi + 0.05; // arredondamento a 1 casa
    }).length;
    expect(dentro / verdades.length).toBeGreaterThan(0.76);
    expect(dentro / verdades.length).toBeLessThan(0.86);
  });

  it("melhor qualidade → erro e margem menores", () => {
    const repo = new RepositorioMemoria();
    const rng = new Rng("qualidade");
    const erro = { 0.1: 0, 0.9: 0 } as Record<number, number>;
    const margem = { 0.1: 0, 0.9: 0 } as Record<number, number>;
    for (const q of [0.1, 0.9])
      for (let i = 0; i < 500; i++) {
        observarCampos(repo, pedido(`q${q}-${i}`, 1, { qualidade: q }), { x: 10 }, ESCALA, rng, K);
        const e = vistaDe(repo).estimativa(alvo(`q${q}-${i}`), "atributos", "x");
        erro[q] = (erro[q] ?? 0) + Math.abs((e?.valor ?? 0) - 10) / 500;
        margem[q] = (margem[q] ?? 0) + (e?.margem ?? 0) / 500;
      }
    expect(erro[0.9]).toBeLessThan((erro[0.1] ?? 0) / 3);
    expect(margem[0.9]).toBeLessThan((margem[0.1] ?? 0) / 3);
  });

  it("a fonte 'proprioClube' sabe mais do que a 'imprensa'", () => {
    expect(sigmaDaQualidade(K.qualidadePorFonte.proprioClube, K)).toBeLessThan(sigmaDaQualidade(K.qualidadePorFonte.imprensa, K) / 3);
  });

  it("várias observações juntas estreitam a margem", () => {
    const repo = new RepositorioMemoria();
    const rng = new Rng("juntar");
    observarCampos(repo, pedido("p1"), { x: 12 }, ESCALA, rng, K);
    const uma = vistaDe(repo).estimativa(alvo("p1"), "atributos", "x")?.margem ?? 0;
    observarCampos(repo, pedido("p1"), { x: 12 }, ESCALA, rng, K);
    observarCampos(repo, pedido("p1"), { x: 12 }, ESCALA, rng, K);
    observarCampos(repo, pedido("p1"), { x: 12 }, ESCALA, rng, K);
    const c = vistaDe(repo).conhecimento(alvo("p1"), "atributos");
    expect(c?.observacoes).toBe(4);
    expect(c?.campos.x?.margem).toBeLessThan(uma * 0.6);
  });

  it("a observação envelhece: 'visto há N épocas', desatualizado e margem a crescer", () => {
    const repo = new RepositorioMemoria();
    observarCampos(repo, pedido("p1", 1), { x: 12 }, ESCALA, new Rng("e"), K);
    const margens: number[] = [];
    for (const epoca of [1, 2, 3, 5]) {
      const c = vistaDe(repo, epoca).conhecimento(alvo("p1"), "atributos");
      margens.push(c?.campos.x?.margem ?? 0);
      expect(c?.epocasDesde).toBe(epoca - 1);
      expect(c?.desatualizado).toBe(epoca - 1 >= K.desatualizadoAposEpocas);
      expect(c?.campos.x?.vistoEm).toBe("2027-09-01");
    }
    expect(margens).toEqual([...margens].sort((a, b) => a - b));
    expect(margens[3]).toBeGreaterThan((margens[0] ?? 0) * 1.5);
  });

  it("observações de outro observador ou de outro grupo não contam", () => {
    const repo = new RepositorioMemoria();
    observarCampos(repo, pedido("p1", 1, { observador: "rival" }), { x: 12 }, ESCALA, new Rng("o"), K);
    observarCampos(repo, pedido("p1", 1, { grupo: "potencial" }), { x: 12 }, ESCALA, new Rng("o"), K);
    expect(vistaDe(repo).conhecimento(alvo("p1"), "atributos")).toBeUndefined();
    expect(vistaDe(repo).conhecimento(alvo("p1"), "potencial")).toBeDefined();
  });

  it("não deixa escapar o valor verdadeiro nem campos nunca observados", () => {
    const repo = new RepositorioMemoria();
    const verdade = { finalizacao: 13.123456, potencialReal: 17.654321, oculto: 3.141592 };
    observarCampos(repo, pedido("p1"), { finalizacao: verdade.finalizacao }, ESCALA, new Rng("leak"), K);
    const v = vistaDe(repo);
    const tudo = JSON.stringify([v.conhecimento(alvo("p1"), "atributos"), v.conhecimento(alvo("p1"), "potencial"), v.eventos(alvo("p1"))]);
    expect(tudo).not.toContain("13.123456");
    expect(tudo).not.toContain("17.654321");
    expect(tudo).not.toContain("3.141592");
    expect(tudo).not.toContain("potencialReal");
    expect(Object.keys(v.conhecimento(alvo("p1"), "atributos")?.campos ?? {})).toEqual(["finalizacao"]);
  });
});

describe("Vista: personalidade em rótulos", () => {
  const tracos = { ambicao: 18, lealdade: 3, vaidade: 10, paciencia: 11, integridade: 6, ganancia: 16, temperamento: 12, profissionalismo: 20 };

  it("mostra só os extremos, os mais marcados primeiro, no máximo 3", () => {
    const repo = new RepositorioMemoria();
    observarPersonalidade(repo, pedido("p1", 1, { grupo: "personalidade", qualidade: 1 }), tracos, new Rng("r"), K);
    const r = vistaDe(repo).conhecimento(alvo("p1"), "personalidade")?.rotulos;
    expect(r).toEqual([
      { traco: "profissionalismo", faixa: "alta" },
      { traco: "ambicao", faixa: "alta" },
      { traco: "lealdade", faixa: "baixa" },
    ]);
  });

  it("com qualidade máxima nunca troca a faixa; com qualidade nula troca cerca de 35 %", () => {
    const rng = new Rng("troca");
    const contar = (q: number) => {
      let trocas = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) {
        const repo = new RepositorioMemoria();
        observarPersonalidade(repo, pedido("p1", 1, { grupo: "personalidade", qualidade: q }), { ambicao: 19 }, rng, K);
        if (vistaDe(repo).conhecimento(alvo("p1"), "personalidade")?.rotulos[0]?.faixa === "baixa") trocas++;
      }
      return trocas / n;
    };
    expect(contar(1)).toBe(0);
    expect(contar(0)).toBeGreaterThan(0.3);
    expect(contar(0)).toBeLessThan(0.4);
  });

  it("uma pessoa sem traços extremos não gera rótulos", () => {
    const repo = new RepositorioMemoria();
    observarPersonalidade(repo, pedido("p1", 1, { grupo: "personalidade" }), { ambicao: 9, lealdade: 11 }, new Rng("m"), K);
    expect(vistaDe(repo).conhecimento(alvo("p1"), "personalidade")?.rotulos).toEqual([]);
  });
});

describe("Vista: eventos e factos públicos", () => {
  const c = { k: "clube" as const, id: "rival" };

  it("públicos de qualquer clube; privados e secretos só se participarmos", () => {
    const repo = new RepositorioMemoria();
    repo.acrescentarEvento(ev("GOLO", { entidades: [c] }));
    repo.acrescentarEvento(ev("CONTRATO", { vis: "privado", entidades: [c, { k: "clube", id: "outro" }] }));
    repo.acrescentarEvento(ev("CONTRATO", { vis: "privado", entidades: [c, { k: "clube", id: "meu" }] }));
    repo.acrescentarEvento(ev("PROPOSTA_ILICITA", { vis: "secreto", entidades: [c] }));
    repo.acrescentarEvento(ev("PROPOSTA_ILICITA", { vis: "secreto", entidades: [c, { k: "pessoa", id: "eu" }] }));
    expect(vistaDe(repo).eventos(c).map((e) => e.id)).toEqual([3, 1]);
    expect(vistaDe(repo, 1, ["clube:meu", "pessoa:eu"]).eventos(c).map((e) => e.id)).toEqual([5, 3, 1]);
  });

  it("o limite aplica-se depois de filtrar pela visibilidade", () => {
    const repo = new RepositorioMemoria();
    repo.acrescentarEvento(ev("GOLO", { entidades: [c] }));
    for (let i = 0; i < 5; i++) repo.acrescentarEvento(ev("SEGREDO", { vis: "secreto", entidades: [c] }));
    expect(vistaDe(repo).eventos(c, { limite: 1 }).map((e) => e.id)).toEqual([1]);
  });

  it("resultados, marcadores, classificação e estatísticas de jogo são públicos", () => {
    const repo = new RepositorioMemoria();
    repo.registarJogo(
      { id: "j1", competicao: "PL", epoca: 1, jornada: 1, data: "2026-08-16", casa: "A", fora: "B", golosCasa: 1, golosFora: 0 },
      [{ minuto: 10, tipo: "G", jogador: "A-9", clube: "A" }],
      [{ jogador: "A-9", clube: "A", titular: true, minutos: 90 }],
    );
    const v = vistaDe(repo);
    expect(v.jogo("j1")?.golosCasa).toBe(1);
    expect(v.marcadores("PL", 1, 1)).toHaveLength(1);
    expect(v.classificacao("PL", 1)[0]?.clube).toBe("A");
    expect(v.statsJogador("A-9")[0]?.golos).toBe(1);
  });
});
