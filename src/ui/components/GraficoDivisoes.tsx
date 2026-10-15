"use client";
import type { Escalao } from "@/engine/config/parametros";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

const NIVEIS: readonly Escalao[] = ["primeiraLiga", "segundaLiga", "terceiraLiga", "cp", "distrital"];


/** Percurso do clube pelas divisões: uma linha por época, o escalão mais alto em cima. Subidas a verde, descidas a vermelho. */
export function GraficoDivisoes({ pontos }: { pontos: { epoca: number; label: string; escalao: Escalao; liga: string }[] }) {
  const { t } = useT();
  const L = 560, A = 190, ex = 150, dx = 24, topo = 16, passoY = (A - topo - 28) / (NIVEIS.length - 1);
  const ordenados = [...pontos].sort((a, b) => a.epoca - b.epoca);
  const n = Math.max(ordenados.length, 2);
  const x = (i: number) => ex + (i * (L - ex - dx)) / (n - 1);
  const y = (e: Escalao) => topo + NIVEIS.indexOf(e) * passoY;
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={t("grafico.titulo")}>
        {NIVEIS.map((e) => (
          <g key={e}>
            <line x1={ex - 8} x2={L - dx + 8} y1={y(e)} y2={y(e)} className="grafico-grelha" />
            <text x={ex - 16} y={y(e) + 4} textAnchor="end" className="grafico-eixo">{t(`escalao.${e}` as Chave)}</text>
          </g>
        ))}
        {ordenados.slice(1).map((p, i) => {
          const antes = ordenados[i] as { escalao: Escalao };
          const tom = NIVEIS.indexOf(p.escalao) < NIVEIS.indexOf(antes.escalao) ? "sobe" : NIVEIS.indexOf(p.escalao) > NIVEIS.indexOf(antes.escalao) ? "desce" : "igual";
          return <line key={p.epoca} x1={x(i)} y1={y(antes.escalao)} x2={x(i + 1)} y2={y(p.escalao)} className={`grafico-linha grafico-${tom}`} />;
        })}
        {ordenados.map((p, i) => (
          <g key={p.epoca}>
            <circle cx={x(i)} cy={y(p.escalao)} r={5} className="grafico-ponto"><title>{`${p.label} · ${p.liga}`}</title></circle>
            <text x={x(i)} y={A - 6} textAnchor="middle" className="grafico-eixo">{p.label}</text>
          </g>
        ))}
      </svg>
      {ordenados.length < 2 && <figcaption className="suave">{t("grafico.vazio")}</figcaption>}
    </figure>
  );
}
