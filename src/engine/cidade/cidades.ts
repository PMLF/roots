/**
 * As cidades no save (RZ-133). Nada se grava à parte: o estado de cada cidade é o seu último evento privado `CIDADE_EPOCA`
 * (os números verdadeiros) e os acontecimentos são eventos públicos `CIDADE_EVENTO` (viram notícia). Antes do primeiro fecho
 * de época o estado é o de arranque, que se reconstrói da seed.
 */
import { Rng } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";
import { sortearAcontecimentos } from "./acontecimentos";
import { SEM_RESULTADOS, evoluirCidade, type ResultadosClubes } from "./evolucao";
import { alvosDaCidade, efeitoDoSetor, estadoInicial, type EstadoCidade } from "./estado";

export type InstantaneoCidade = { epoca: number; estado: EstadoCidade };

const CAMPOS: readonly (keyof EstadoCidade)[] = ["populacao", "emprego", "economia", "turismo", "orgulho", "notoriedade", "culturaFutebol"];

const lerEstado = (d: Record<string, unknown>): EstadoCidade => Object.fromEntries(CAMPOS.map((c) => [c, Number(d[c])])) as EstadoCidade;

const rngDoSave = (repo: Repositorio) => new Rng(repo.meta("seed") ?? "?", "cidade");

/** Estado de arranque (época 1) de uma cidade, reconstruído da seed. */
export function estadoDeArranque(repo: Repositorio, base: DadosBase, params: Pick<Parametros, "cidade">, cidade: string): EstadoCidade | undefined {
  const c = base.cidades.find((x) => x.id === cidade);
  return c ? estadoInicial(c, base.clubes, rngDoSave(repo).derivar(`inicial:${c.id}`), params) : undefined;
}

/** Estado em cada época (a 1 é o de arranque), do mais antigo para o mais recente. */
export function historicoDaCidade(repo: Repositorio, base: DadosBase, params: Pick<Parametros, "cidade">, cidade: string): InstantaneoCidade[] {
  const inicial = estadoDeArranque(repo, base, params, cidade);
  if (!inicial) return [];
  const depois = repo
    .eventosDe({ k: "cidade", id: cidade }, { tipo: "CIDADE_EPOCA" })
    .reverse()
    .map((e): InstantaneoCidade => ({ epoca: Number(e.dados.valida), estado: lerEstado(e.dados) }));
  return [{ epoca: 1, estado: inicial }, ...depois];
}

/**
 * Fecha o ano de todas as cidades: sorteia os acontecimentos, evolui cada estado e grava os eventos.
 * `epoca` é a que acabou; os estados novos valem para `epoca + 1`.
 */
export function evoluirCidades(repo: Repositorio, base: DadosBase, params: Pick<Parametros, "cidade">, epoca: number, hoje: Data, resultados: ReadonlyMap<string, ResultadosClubes>): void {
  const rng = rngDoSave(repo).derivar(`e${epoca}`);
  const acontecimentos = sortearAcontecimentos(base.cidades, rng.derivar("acontecimentos"), params);
  const porCidade = new Map<string, typeof acontecimentos>();
  for (const a of acontecimentos) for (const id of a.cidades) porCidade.set(id, [...(porCidade.get(id) ?? []), a]);

  for (const a of acontecimentos) {
    repo.acrescentarEvento({
      tipo: "CIDADE_EVENTO", data: hoje, epoca, vis: "publico", origem: "gerado",
      entidades: a.cidades.map((id) => ({ k: "cidade" as const, id, papel: a.regional ? "regiao" : "afetada" })),
      dados: { evento: a.tipo, regional: a.regional, ...(a.polo ? { polo: a.polo } : {}) },
    });
  }

  for (const c of base.cidades) {
    const hist = historicoDaCidade(repo, base, params, c.id);
    const antes = hist[hist.length - 1]!.estado;
    const meus = porCidade.get(c.id) ?? [];
    const novo = evoluirCidade(
      antes,
      {
        alvos: alvosDaCidade(c, base.clubes, params),
        derivaPopulacaoPct: efeitoDoSetor(c, "populacaoPct", params),
        resultados: resultados.get(c.id) ?? SEM_RESULTADOS,
        efeitos: meus.map((a) => params.cidade.eventos.tipos[a.tipo].efeitos),
      },
      rng.derivar(`cidade:${c.id}`),
      params,
    );
    repo.acrescentarEvento({
      tipo: "CIDADE_EPOCA", data: hoje, epoca, vis: "privado", origem: "gerado",
      entidades: [{ k: "cidade", id: c.id }],
      dados: { valida: epoca + 1, ...novo, acontecimentos: meus.map((a) => a.tipo) },
    });
  }
}
