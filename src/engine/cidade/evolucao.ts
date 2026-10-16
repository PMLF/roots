/** Evolução anual de uma cidade (RZ-133; docs/CIDADE.md §11): regressão ao alvo, resultados dos clubes e acontecimentos. Puro. */
import type { Rng } from "../aleatorio/rng";
import { limitar } from "../aleatorio/rng";
import type { EfeitosCidade, Parametros } from "../config/parametros";
import type { AlvosCidade, EstadoCidade } from "./estado";

export type ResultadosClubes = { campeoes: number; subidas: number; descidas: number };
export const SEM_RESULTADOS: ResultadosClubes = { campeoes: 0, subidas: 0, descidas: 0 };

export type EntradaEvolucao = {
  alvos: AlvosCidade;
  /** Variação anual da população por causa do setor, em %. */
  derivaPopulacaoPct: number;
  resultados: ResultadosClubes;
  /** Efeitos dos acontecimentos desta época (já escolhidos). */
  efeitos: readonly EfeitosCidade[];
};

const lim = (x: number) => limitar(x, 0, 100);

export function evoluirCidade(antes: EstadoCidade, e: EntradaEvolucao, rng: Rng, params: Pick<Parametros, "cidade">): EstadoCidade {
  const k = params.cidade.evolucao;
  const soma = (campo: keyof EfeitosCidade) => e.efeitos.reduce((s, x) => s + (x[campo] ?? 0), 0);
  const rumo = (atual: number, alvo: number) => atual + (alvo - atual) * k.regressao + rng.gauss(0, k.ruido);
  const r = e.resultados;

  const economia = lim(rumo(antes.economia, e.alvos.economia) + soma("economia"));
  const emprego = lim(rumo(antes.emprego, e.alvos.emprego) + soma("emprego"));
  const turismo = lim(rumo(antes.turismo, e.alvos.turismo) + soma("turismo"));
  const orgulho = lim(rumo(antes.orgulho, e.alvos.orgulho) + r.campeoes * k.orgulho.campeao + r.subidas * k.orgulho.subida + r.descidas * k.orgulho.descida + soma("orgulho"));
  const notoriedade = lim(antes.notoriedade + (e.alvos.notoriedade - antes.notoriedade) * k.notoriedade.regressao + (orgulho - 50) * k.notoriedade.porOrgulho + soma("notoriedade") + rng.gauss(0, k.ruido / 2));
  const culturaFutebol = limitar(antes.culturaFutebol + (orgulho - 50) * k.cultura.porOrgulho + r.campeoes * k.cultura.campeao + r.subidas * k.cultura.subida, 5, 95);

  const pct = limitar(
    e.derivaPopulacaoPct + (economia - 50) * k.populacao.porEconomia + (orgulho - 50) * k.populacao.porOrgulho + soma("populacaoPct") + rng.gauss(0, k.populacao.ruidoPct),
    -k.populacao.maxPct,
    k.populacao.maxPct,
  );
  const populacao = Math.max(50, Math.round(antes.populacao * (1 + pct / 100)));
  return { populacao, emprego, economia, turismo, orgulho, notoriedade, culturaFutebol };
}
