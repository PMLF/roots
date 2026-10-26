/**
 * Cores de cada empresa (RZ-240): puramente cosméticas, derivadas do id (sempre as mesmas), no mesmo formato de texto das cores dos clubes
 * para a interface as desenhar com o mesmo indicador. Nada na simulação depende delas.
 */
const PALETTE = [
  "Azul e branco", "Azul-escuro e dourado", "Verde e branco", "Verde-escuro e ocre", "Vermelho e preto", "Grená e prata",
  "Laranja e azul-escuro", "Preto e dourado", "Roxo e branco", "Turquesa e branco", "Castanho e bege", "Azul-claro e cinzento",
  "Amarelo e preto", "Bordô e branco", "Verde e laranja", "Azul e amarelo", "Cinzento e vermelho", "Rosa e azul-escuro",
] as const;
const SOLO = ["Azul", "Verde", "Vermelho", "Laranja", "Preto", "Roxo", "Turquesa", "Grená"] as const;

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Uma ou duas cores (uma em cada cinco empresas tem só uma). */
export function companyColours(id: string): string {
  const h = hash(id);
  return h % 5 === 0 ? SOLO[(h >>> 3) % SOLO.length]! : PALETTE[(h >>> 3) % PALETTE.length]!;
}
