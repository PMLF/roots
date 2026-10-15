/**
 * Criação de observações (RZ-129): a ponte entre a "verdade" oculta e o que passa a ser conhecido.
 * Recebe os valores verdadeiros como argumento (quem chama é o olheiro, o treino, o jogo…), acrescenta
 * ruído que depende da qualidade da fonte e grava só a estimativa. A Vista nunca importa este módulo.
 */
import type { Parametros } from "../config/parametros";
import { limitar, type Rng } from "../aleatorio/rng";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data, TipoEntidade } from "../persistencia/tipos";
import type { Rotulo, ValoresObservados } from "../vista/tipos";

export type PedidoObservacao = {
  observador: string;
  alvo: { k: TipoEntidade; id: string };
  grupo: string;
  fonte: keyof Parametros["conhecimento"]["qualidadePorFonte"];
  /** 0-1; por omissão a da fonte (parâmetros). Um bom olheiro tem qualidade mais alta. */
  qualidade?: number;
  data: Data;
  epoca: number;
};

type Conhecimento = Parametros["conhecimento"];

/** Desvio do erro de uma observação com a qualidade dada (interpolação linear). */
export function sigmaDaQualidade(qualidade: number, k: Conhecimento): number {
  const q = limitar(qualidade, 0, 1);
  return k.sigmaPiorQualidade + (k.sigmaMelhorQualidade - k.sigmaPiorQualidade) * q;
}

const qualidadeDe = (p: PedidoObservacao, k: Conhecimento) => limitar(p.qualidade ?? k.qualidadePorFonte[p.fonte], 0, 1);

/** Observa valores numéricos (atributos, potencial, …). Devolve o id da observação. */
export function observarCampos(
  repo: Repositorio,
  p: PedidoObservacao,
  verdadeiros: Readonly<Record<string, number>>,
  escala: [number, number],
  rng: Rng,
  k: Conhecimento,
): number {
  const q = qualidadeDe(p, k);
  const sigma = sigmaDaQualidade(q, k);
  const campos: NonNullable<ValoresObservados["campos"]> = {};
  for (const nome of Object.keys(verdadeiros).sort()) {
    const est = limitar(rng.gauss(verdadeiros[nome] as number, sigma), escala[0], escala[1]);
    campos[nome] = { est: Math.round(est * 10) / 10, sigma };
  }
  const valores: ValoresObservados = { v: 1, escala, campos };
  return repo.acrescentarObservacao({ observador: p.observador, alvoK: p.alvo.k, alvoId: p.alvo.id, grupo: p.grupo, valores, qualidade: q, fonte: p.fonte, data: p.data, epoca: p.epoca });
}

/**
 * Observa a personalidade como rótulos (PERSONALIDADE §7): só os traços nos extremos (≤ baixo ou ≥ alto),
 * os mais marcados primeiro, no máximo `maxRotulos`. Com qualidade baixa a faixa pode vir trocada.
 */
export function observarPersonalidade(
  repo: Repositorio,
  p: PedidoObservacao,
  tracos: Readonly<Record<string, number>>,
  rng: Rng,
  k: Conhecimento,
): number {
  const q = qualidadeDe(p, k);
  const pr = k.personalidade;
  const probTroca = pr.probTrocaPiorQualidade * (1 - q);
  const rotulos: Rotulo[] = Object.entries(tracos)
    .filter(([, v]) => v <= pr.limiarBaixo || v >= pr.limiarAlto)
    .sort((a, b) => Math.abs(b[1] - 10.5) - Math.abs(a[1] - 10.5) || (a[0] < b[0] ? -1 : 1))
    .slice(0, pr.maxRotulos)
    .map(([traco, v]) => {
      const faixa: Rotulo["faixa"] = v >= pr.limiarAlto ? "alta" : "baixa";
      return { traco, faixa: rng.prob(probTroca) ? (faixa === "alta" ? "baixa" : "alta") : faixa };
    });
  const valores: ValoresObservados = { v: 1, rotulos };
  return repo.acrescentarObservacao({ observador: p.observador, alvoK: p.alvo.k, alvoId: p.alvo.id, grupo: p.grupo, valores, qualidade: q, fonte: p.fonte, data: p.data, epoca: p.epoca });
}

/**
 * O clube conhece bem o seu próprio plantel (fonte "proprioClube"): cria as observações iniciais de
 * atributos, potencial e personalidade de cada jogador. Chama-se uma vez no início do save (e ao contratar).
 */
export function observarPlantelProprio(
  repo: Repositorio,
  clube: string,
  quando: { data: Data; epoca: number },
  rng: Rng,
  k: Conhecimento,
): number {
  let n = 0;
  for (const j of repo.jogadoresDoClube(clube)) {
    const p = repo.pessoa(j.pessoa);
    if (!p) continue;
    const base = { observador: clube, alvo: { k: "pessoa" as const, id: j.pessoa }, fonte: "proprioClube" as const, ...quando };
    observarCampos(repo, { ...base, grupo: "atributos" }, j.atributos, [1, 20], rng, k);
    observarCampos(repo, { ...base, grupo: "potencial" }, { potencial: j.potencial }, [1, 20], rng, k);
    observarPersonalidade(repo, { ...base, grupo: "personalidade" }, p.personalidade, rng, k);
    n++;
  }
  return n;
}
