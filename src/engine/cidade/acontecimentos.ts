/** Acontecimentos anuais que mexem com as cidades (RZ-133): fábricas, fundos, autoestradas, festivais… Puro e determinístico. */
import type { Rng } from "../aleatorio/rng";
import { TIPOS_EVENTO_CIDADE, type EventoCidadeCfg, type Parametros, type TipoEventoCidade } from "../config/parametros";
import type { CidadeBase } from "../dados/tipos";

export type AcontecimentoCidade = {
  tipo: TipoEventoCidade;
  regional: boolean;
  /** Só nos regionais. */
  polo?: string;
  /** Concelhos atingidos. */
  cidades: string[];
};

/** Peso do acontecimento para uma cidade: setor principal a 100 %, secundário a 50 %. */
function pesoPara(cfg: EventoCidadeCfg, c: Pick<CidadeBase, "setor" | "tag2">): number {
  const p = (s: string) => cfg.peso[s] ?? cfg.peso["*"] ?? 0;
  return p(c.setor) + 0.5 * p(c.tag2);
}

export function sortearAcontecimentos(cidades: readonly CidadeBase[], rng: Rng, params: Pick<Parametros, "cidade">): AcontecimentoCidade[] {
  const { probCidade, probPolo, tipos } = params.cidade.eventos;
  const locais = TIPOS_EVENTO_CIDADE.filter((t) => !tipos[t].regional);
  const regionais = TIPOS_EVENTO_CIDADE.filter((t) => tipos[t].regional);
  const out: AcontecimentoCidade[] = [];

  for (const c of [...cidades].sort((a, b) => a.id.localeCompare(b.id))) {
    const r = rng.derivar(`cidade:${c.id}`);
    if (!r.prob(probCidade)) continue;
    if (!locais.some((t) => pesoPara(tipos[t], c) > 0)) continue;
    out.push({ tipo: r.ponderado(locais, (t) => pesoPara(tipos[t], c)), regional: false, cidades: [c.id] });
  }

  const polos = [...new Set(cidades.map((c) => c.polo).filter((p) => p !== ""))].sort();
  for (const polo of polos) {
    const r = rng.derivar(`polo:${polo}`);
    if (!r.prob(probPolo) || regionais.length === 0) continue;
    const membros = cidades.filter((c) => c.polo === polo);
    const media = (t: TipoEventoCidade) => membros.reduce((s, c) => s + pesoPara(tipos[t], c), 0) / membros.length;
    if (!regionais.some((t) => media(t) > 0)) continue;
    out.push({ tipo: r.ponderado(regionais, media), regional: true, polo, cidades: membros.map((c) => c.id).sort() });
  }
  return out;
}
