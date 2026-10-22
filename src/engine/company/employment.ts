/**
 * Empresas ↔ cidade (RZ-235, docs/CITY.md §12.5): os empregos das empresas locais empurram o emprego e a economia do concelho,
 * o maior empregador dá a dependência (um fecho dói mais) e as empresas de saúde, transportes, energia e media ajudam os serviços
 * que a Câmara deixa de fora. Tudo puro, a partir das empresas ativas guardadas.
 */
import { clamp } from "../random/rng";
import type { CityService, Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { CompanyRecord } from "../persistence/types";
import { SCALES, scaleWeightOf, targetCompanies } from "./generate";

type Scale = CompanyRecord["scale"];

/** Empregados estimados da empresa (todos os sítios onde trabalha). */
export const employeesOf = (c: Pick<CompanyRecord, "capital" | "scale">, params: Pick<Params, "companies">): number =>
  Math.max(1, Math.round(c.capital / params.companies.capitalPerEmployee[c.scale]));

/** Empregos no concelho: só a parte dos empregados que trabalha lá (uma empresa nacional emprega pouco em cada cidade). */
export const localJobsOf = (c: Pick<CompanyRecord, "capital" | "scale">, params: Pick<Params, "companies">): number =>
  Math.max(1, Math.round(employeesOf(c, params) * params.companies.city.jobs.localShare[c.scale]));

export type Dependence = "low" | "medium" | "high";
export type CityJobs = { jobs: number; companies: number; /** Quota de empregos do maior empregador (0-1). */ topShare: number; top?: CompanyRecord; dependence: Dependence };

export function cityJobs(repo: Repository, params: Pick<Params, "companies">, city: string): CityJobs {
  const list = repo.companies({ city, state: "active" });
  const jobs = list.reduce((s, c) => s + localJobsOf(c, params), 0);
  const top = [...list].sort((a, b) => localJobsOf(b, params) - localJobsOf(a, params) || (a.id < b.id ? -1 : 1))[0];
  const topShare = top && jobs > 0 ? localJobsOf(top, params) / jobs : 0;
  const [mid, high] = params.companies.city.jobs.dependence;
  return { jobs, companies: list.length, topShare, ...(top ? { top } : {}), dependence: topShare >= high ? "high" : topShare >= mid ? "medium" : "low" };
}

/** O que se espera de uma cidade do tamanho dela: nº de empresas que sustenta × a média por escala (empregos locais e volume de negócio de uma empresa mediana). */
export function expectedOf(city: { population: number }, params: Params): { jobs: number; capital: number } {
  const n = targetCompanies(city, params);
  const w = SCALES.map((s) => scaleWeightOf(city.population, s, params));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  const median = (s: Scale) => params.companies.capital.median[s];
  return {
    jobs: n * SCALES.reduce((a, s, i) => a + (w[i] as number) * localJobsOf({ capital: median(s), scale: s }, params), 0) / total,
    capital: n * SCALES.reduce((a, s, i) => a + (w[i] as number) * median(s), 0) / total,
  };
}

/** Pontos que as empresas somam ao alvo do emprego e da economia do concelho (±limite); 0 se as empresas ainda não existem. */
export function companyTargets(repo: Repository, params: Params, city: string, population: number): { employment: number; economy: number } {
  if (repo.meta("companies.enabled") !== "1") return { employment: 0, economy: 0 };
  const k = params.companies.city.jobs;
  const expected = expectedOf({ population }, params);
  const jobs = cityJobs(repo, params, city).jobs;
  const capital = repo.companies({ city, state: "active" }).reduce((s, c) => s + c.capital, 0);
  const employment = clamp(k.employmentK * Math.log2(Math.max(jobs, 1) / Math.max(1, expected.jobs)), -k.employmentMax, k.employmentMax);
  const economy = clamp(k.economyK * Math.log2(Math.max(capital, 1) / Math.max(1, expected.capital)), -k.economyMax, k.economyMax);
  return { employment, economy };
}

/** Parceiros de serviços: empresas dos setores certos ajudam quando a prioridade da Câmara está abaixo da média (défice = 1 − quociente). */
export function partnerOffsets(repo: Repository, params: Pick<Params, "companies">, city: string, ratio: Partial<Record<CityService, number>>): Partial<Record<CityService, number>> {
  if (repo.meta("companies.enabled") !== "1") return {};
  const p = params.companies.city.partners;
  const out: Partial<Record<CityService, number>> = {};
  for (const c of repo.companies({ city, state: "active" })) {
    const service = p.sectors[c.sector];
    if (!service) continue;
    const deficit = Math.max(0, 1 - (ratio[service] ?? 1));
    out[service] = Math.min(p.max, (out[service] ?? 0) + p.k * p.scale[c.scale as Scale] * deficit);
  }
  return out;
}
