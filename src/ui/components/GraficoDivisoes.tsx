"use client";
import type { Tier } from "@/engine/config/parametros";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

const LEVELS: readonly Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];


/** Percurso do clube pelas divisões: uma linha por época, o escalão mais alto em cima. Subidas a verde, descidas a vermelho. */
export function DivisionsChart({ points }: { points: { season: number; label: string; tier: Tier; league: string }[] }) {
  const { t } = useT();
  const L = 560, A = 190, ex = 150, dx = 24, top = 16, yStep = (A - top - 28) / (LEVELS.length - 1);
  const sorted = [...points].sort((a, b) => a.season - b.season);
  const n = Math.max(sorted.length, 2);
  const x = (i: number) => ex + (i * (L - ex - dx)) / (n - 1);
  const y = (e: Tier) => top + LEVELS.indexOf(e) * yStep;
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t("grafico.titulo")}>
        {LEVELS.map((e) => (
          <g key={e}>
            <line x1={ex - 8} x2={L - dx + 8} y1={y(e)} y2={y(e)} className="grafico-grelha" />
            <text x={ex - 16} y={y(e) + 4} textAnchor="end" className="grafico-eixo">{t(`escalao.${e}` as Key)}</text>
          </g>
        ))}
        {sorted.slice(1).map((p, i) => {
          const before = sorted[i] as { tier: Tier };
          const tone = LEVELS.indexOf(p.tier) < LEVELS.indexOf(before.tier) ? "rises" : LEVELS.indexOf(p.tier) > LEVELS.indexOf(before.tier) ? "drops" : "equal";
          return <line key={p.season} x1={x(i)} y1={y(before.tier)} x2={x(i + 1)} y2={y(p.tier)} className={`grafico-linha grafico-${tone}`} />;
        })}
        {sorted.map((p, i) => (
          <g key={p.season}>
            <circle cx={x(i)} cy={y(p.tier)} r={5} className="grafico-ponto"><title>{`${p.label} · ${p.league}`}</title></circle>
            <text x={x(i)} y={A - 6} textAnchor="middle" className="grafico-eixo">{p.label}</text>
          </g>
        ))}
      </svg>
      {sorted.length < 2 && <figcaption className="suave">{t("grafico.vazio")}</figcaption>}
    </figure>
  );
}
