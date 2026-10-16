/**
 * Cores de um clube a partir do texto dos dados («Laranja e branco», «Vermelho e branco horizontal»…).
 * Só serve para desenhar o indicador (`components/Cores.tsx`): o nome fica sempre ao lado.
 * Padrões: uma cor = lisa; várias = divididas ao meio (ou por `%`); «riscas»/«vertical»/«horizontal» = riscas.
 */
export type PadraoCores = "lisa" | "dividida" | "riscas-verticais" | "riscas-horizontais";
export type Segmento = { cor: string; peso: number };
export type CoresClube = { padrao: PadraoCores; segmentos: Segmento[] };

const BASE: Record<string, string> = {
  azul: "#1f4fa8", amarelo: "#f2c400", branco: "#f7f7f5", preto: "#1b1b1d", vermelho: "#d32f2f", verde: "#1e8e3e",
  laranja: "#f07f1a", grena: "#7a1230", bordo: "#6d1030", castanho: "#6b4226", cinzento: "#8a8f98", dourado: "#c9a227",
  prata: "#c0c4cc", rosa: "#ef8fb0", roxo: "#6a3fa0", ocre: "#c58a1b", salmao: "#fa8f7a", bege: "#d9c7a3", navy: "#14285c",
  turquesa: "#1aa6a6",
};
const COMPOSTAS: Record<string, string> = {
  "azul-claro": "#5aa9e6", "azul claro": "#5aa9e6", "azul-celeste": "#5aa9e6", "azul-cristal": "#8fd3f4", "azul-escuro": "#14285c",
  "azul-marinho": "#14285c", "azul-turquesa": "#1aa6a6", "amarelo-areia": "#e0c88a", "verde-escuro": "#0f5a2a", "verde-claro": "#7bcf8a",
  "verde-ceramica": "#5f9c7e", "verde-oliva": "#6b7a2a", "castanho-avermelhado": "#8a3b2a",
};

const semAcentos = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function corCss(nome: string): string {
  const n = semAcentos(nome);
  return COMPOSTAS[n] ?? BASE[n] ?? BASE[n.split(/[- ]/)[0] ?? ""] ?? "#9aa0a6";
}

export function lerCores(texto: string): CoresClube {
  let t = texto;
  let padrao: PadraoCores | undefined;
  const marca = /\b(às riscas|riscas|vertical|horizontal)\b/i.exec(t);
  if (marca) {
    padrao = /horizontal/i.test(marca[1] ?? "") ? "riscas-horizontais" : "riscas-verticais";
    t = t.replace(marca[0], "");
  }
  const nomes = t.split(/\s*,\s*|\s+e\s+/i).map((x) => x.trim()).filter(Boolean);
  const brutos = nomes.map((x) => {
    const m = /^(.*?)\s*(\d{1,3})\s*%$/.exec(x);
    return { cor: corCss(m?.[1] ?? x), peso: m ? Number(m[2]) : undefined };
  });
  if (brutos.length === 0) return { padrao: "lisa", segmentos: [{ cor: "#9aa0a6", peso: 1 }] };
  const fixo = brutos.reduce((s, b) => s + (b.peso ?? 0), 0);
  const semPeso = brutos.filter((b) => b.peso === undefined).length;
  const segmentos = brutos.map((b) => ({ cor: b.cor, peso: b.peso ?? (semPeso ? Math.max(0, 100 - fixo) / semPeso : 0) }));
  if (segmentos.length === 1) return { padrao: "lisa", segmentos };
  return { padrao: padrao ?? "dividida", segmentos };
}

/** Valor CSS de `background` para o indicador. */
export function fundoCores({ padrao, segmentos }: CoresClube): string {
  if (padrao === "lisa") return segmentos[0]?.cor ?? "transparent";
  if (padrao === "dividida") {
    let acc = 0;
    return `linear-gradient(90deg, ${segmentos.map((s) => { const de = acc; acc += s.peso; return `${s.cor} ${de}% ${acc}%`; }).join(", ")})`;
  }
  const passo = 3; // px por risca
  const faixas = segmentos.map((s, i) => `${s.cor} ${i * passo}px ${(i + 1) * passo}px`).join(", ");
  return `repeating-linear-gradient(${padrao === "riscas-verticais" ? "90deg" : "180deg"}, ${faixas})`;
}

const luminancia = (hex: string): number => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
};

/** A cor que mais pesa no clube e que se vê em fundo claro e escuro (evita o branco e o quase preto, se houver outra). Para linhas de gráficos. */
export function corPredominante(texto: string | undefined): string | undefined {
  if (!texto) return undefined;
  const segs = lerCores(texto).segmentos;
  const porPeso = [...segs].sort((a, b) => b.peso - a.peso);
  const legivel = porPeso.find((s) => /^#[0-9a-f]{6}$/i.test(s.cor) && luminancia(s.cor) > 0.1 && luminancia(s.cor) < 0.85);
  return (legivel ?? porPeso[0])?.cor;
}
