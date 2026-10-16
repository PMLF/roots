import type { LinhaVivo } from "@/engine/epoca/jogoAoVivo";

/**
 * Ícones dos lances do jogo (24×24). Cada lance tem forma e cor próprias para se distinguir de relance; a cor vem de classes
 * `.ev-*` (nunca só a cor: a forma também muda). Decorativos: o texto do lance ao lado diz o que aconteceu.
 */
const BOLA = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8.200l3.500 2.500-1.300 4.100H9.800L8.500 10.700zM12 8.200V4M15.500 10.700l3.800-1.200M14.200 14.800l2.300 3.200M9.800 14.800 7.500 18M8.500 10.700 4.700 9.500";

type Forma = { d: string; cheio?: boolean; extra?: string };
const FORMAS: Record<string, Forma> = {
  golo: { d: BOLA },
  penalti: { d: "M3 20V8h18v12M3 8l2-3h14l2 3", extra: "M12 16m-1.800 0a1.800 1.800 0 1 0 3.600 0 1.800 1.800 0 1 0-3.600 0" },
  "remate-golo": { d: BOLA },
  "remate-defendido": { d: "M8 12V6.500a1.500 1.500 0 0 1 3 0V11M11 11V5a1.500 1.500 0 0 1 3 0v6M14 11V6a1.500 1.500 0 0 1 3 0v7.500c0 4-2 7-6 7s-5-2-6-4l-1.500-3a1.500 1.500 0 0 1 2.500-1.500L8 14" },
  "remate-fora": { d: "M5 19 19 5M10 5h9v9" },
  "remate-bloqueado": { d: "M12 3 19 6v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z" },
  canto: { d: "M6 21V4M6 4h11l-3 4 3 4H6" },
  cartao: { d: "M8 4h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", cheio: true },
  lesao: { d: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z", cheio: true },
  substituicao: { d: "M8 20V5M4 9l4-4 4 4M16 4v15M12 15l4 4 4-4" },
  inicio: { d: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.500 1.500M9.500 2.500h5" },
  intervalo: { d: "M8 5v14M16 5v14" },
  fim: { d: "M5 21V4M5 4h13l-3 4.500 3 4.500H5" },
};

export function chaveIcone(l: LinhaVivo): string {
  if (l.tipo === "remate") return `remate-${l.resultado ?? "fora"}`;
  return l.tipo;
}

export function IconeEvento({ chave, cor }: { chave: string; cor?: "amarelo" | "vermelho" }) {
  const f = FORMAS[chave] ?? FORMAS["fim"]!;
  return (
    <svg className={`ev-icone ev-${chave}${cor ? ` ev-${cor}` : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={f.d} className={f.cheio ? "ev-cheio" : undefined} />
      {f.extra && <path d={f.extra} className="ev-cheio" />}
    </svg>
  );
}
