import type { Params, Tier } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { Rng } from "../random/rng";

/**
 * Atribui agentes (RZ-206) aos jogadores sem agente: a quota depende do escalão do clube (livres: o escalão dos livres);
 * a escolha favorece os agentes que já têm mais clientes (agentes grandes ficam maiores). Determinístico dado o `rng`.
 */
export function assignAgents(repo: Repository, rng: Rng, params: Params, tierOf: (club: string) => Tier | undefined): number {
  const agents = repo.roleHolders("agent");
  if (agents.length === 0) return 0;
  const clients = new Map<string, number>(agents.map((a) => [a, 0]));
  const without: { person: string; tier: Tier }[] = [];
  for (const state of ["active", "free"] as const) {
    for (const j of repo.playersByState(state)) {
      if (j.agent) clients.set(j.agent, (clients.get(j.agent) ?? 0) + 1);
      else without.push({ person: j.person, tier: (j.club ? tierOf(j.club) : undefined) ?? params.world.stars.freeAgentTier });
    }
  }
  const mk = params.market.agents;
  let n = 0;
  for (const w of without) {
    const r = rng.derive(`agent/${w.person}`);
    if (!r.prob(mk.share[w.tier])) continue;
    const agent = r.weighted(agents, (a) => 1 + mk.popularity * (clients.get(a) ?? 0));
    repo.updatePlayer(w.person, { agent });
    clients.set(agent, (clients.get(agent) ?? 0) + 1);
    n++;
  }
  return n;
}

/** Traços do agente que contam no mercado (10 = neutro quando não há agente). */
export function agentTraits(repo: Repository, agent: string | undefined): { greed: number; loyalty: number } | undefined {
  if (!agent) return undefined;
  const p = repo.person(agent)?.personality;
  return p ? { greed: p.greed ?? 10, loyalty: p.loyalty ?? 10 } : undefined;
}
