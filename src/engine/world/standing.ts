/**
 * Posição de um clube no seu escalão (0 = o mais pequeno, 1 = o maior), a partir da reputação e do dinheiro (RZ-263). Só a reputação
 * não chega: há escalões em que é igual para todos os clubes, e é o dinheiro que separa quem tem mais meios.
 */
type Peer = { reputation: number; finances: number };

const norm = (value: number, values: readonly number[]): number => {
  const lo = Math.min(...values), hi = Math.max(...values);
  return hi > lo ? (value - lo) / (hi - lo) : 0.5;
};

export function standingIn(club: Peer, peers: readonly Peer[], reputationWeight: number): number {
  const reputation = norm(club.reputation, peers.map((p) => p.reputation));
  const money = norm(Math.log(Math.max(1, club.finances)), peers.map((p) => Math.log(Math.max(1, p.finances))));
  // reputação igual para todos (ex.: Terceira Liga): só o dinheiro os separa
  const flat = new Set(peers.map((p) => p.reputation)).size <= 1;
  return flat ? money : reputationWeight * reputation + (1 - reputationWeight) * money;
}
