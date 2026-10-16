/**
 * Cores de um clube a partir do texto dos dados («Laranja e branco», «Vermelho e branco horizontal»…).
 * Só serve para desenhar o indicador (`components/Cores.tsx`): o nome fica sempre ao lado.
 * Padrões: uma cor = lisa; várias = divididas ao meio (ou por `%`); «riscas»/«vertical»/«horizontal» = riscas.
 */
export type DefaultColours = "lisa" | "dividida" | "riscas-verticais" | "riscas-horizontais";
export type Segment = { colour: string; weight: number };
export type ClubColours = { fallback: DefaultColours; segments: Segment[] };

const BASE: Record<string, string> = {
  blue: "#1f4fa8", yellow: "#f2c400", white: "#f7f7f5", black: "#1b1b1d", red: "#d32f2f", green: "#1e8e3e",
  laranja: "#f07f1a", claret: "#7a1230", edge: "#6d1030", brown: "#6b4226", grey: "#8a8f98", gold: "#c9a227",
  silver: "#c0c4cc", pink: "#ef8fb0", purple: "#6a3fa0", ochre: "#c58a1b", salmon: "#fa8f7a", beige: "#d9c7a3", navy: "#14285c",
  turquoise: "#1aa6a6",
};
const COMPOSITE: Record<string, string> = {
  "azul-claro": "#5aa9e6", "azul claro": "#5aa9e6", "azul-celeste": "#5aa9e6", "azul-cristal": "#8fd3f4", "azul-escuro": "#14285c",
  "azul-marinho": "#14285c", "azul-turquesa": "#1aa6a6", "amarelo-areia": "#e0c88a", "verde-escuro": "#0f5a2a", "verde-claro": "#7bcf8a",
  "verde-ceramica": "#5f9c7e", "verde-oliva": "#6b7a2a", "castanho-avermelhado": "#8a3b2a",
};

const withoutAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function cssColour(name: string): string {
  const n = withoutAccents(name);
  return COMPOSITE[n] ?? BASE[n] ?? BASE[n.split(/[- ]/)[0] ?? ""] ?? "#9aa0a6";
}

export function readColours(text: string): ClubColours {
  let t = text;
  let fallback: DefaultColours | undefined;
  const mark = /\b(às riscas|riscas|vertical|horizontal)\b/i.exec(t);
  if (mark) {
    fallback = /horizontal/i.test(mark[1] ?? "") ? "riscas-horizontais" : "riscas-verticais";
    t = t.replace(mark[0], "");
  }
  const names = t.split(/\s*,\s*|\s+e\s+/i).map((x) => x.trim()).filter(Boolean);
  const raw = names.map((x) => {
    const m = /^(.*?)\s*(\d{1,3})\s*%$/.exec(x);
    return { colour: cssColour(m?.[1] ?? x), weight: m ? Number(m[2]) : undefined };
  });
  if (raw.length === 0) return { fallback: "lisa", segments: [{ colour: "#9aa0a6", weight: 1 }] };
  const fixed = raw.reduce((s, b) => s + (b.weight ?? 0), 0);
  const withoutWeight = raw.filter((b) => b.weight === undefined).length;
  const segments = raw.map((b) => ({ colour: b.colour, weight: b.weight ?? (withoutWeight ? Math.max(0, 100 - fixed) / withoutWeight : 0) }));
  if (segments.length === 1) return { fallback: "lisa", segments };
  return { fallback: fallback ?? "dividida", segments };
}

/** Valor CSS de `background` para o indicador. */
export function backgroundColours({ fallback, segments }: ClubColours): string {
  if (fallback === "lisa") return segments[0]?.colour ?? "transparent";
  if (fallback === "dividida") {
    let acc = 0;
    return `linear-gradient(90deg, ${segments.map((s) => { const de = acc; acc += s.weight; return `${s.colour} ${de}% ${acc}%`; }).join(", ")})`;
  }
  const step = 3; // px por risca
  const strips = segments.map((s, i) => `${s.colour} ${i * step}px ${(i + 1) * step}px`).join(", ");
  return `repeating-linear-gradient(${fallback === "riscas-verticais" ? "90deg" : "180deg"}, ${strips})`;
}

const luminance = (hex: string): number => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * (v[0] ?? 0) + 0.7152 * (v[1] ?? 0) + 0.0722 * (v[2] ?? 0);
};

/** A cor que mais pesa no clube e que se vê em fundo claro e escuro (evita o branco e o quase preto, se houver outra). Para linhas de gráficos. */
export function predominantColour(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const secs = readColours(text).segments;
  const byWeight = [...secs].sort((a, b) => b.weight - a.weight);
  const readable = byWeight.find((s) => /^#[0-9a-f]{6}$/i.test(s.colour) && luminance(s.colour) > 0.1 && luminance(s.colour) < 0.85);
  return (readable ?? byWeight[0])?.colour;
}
