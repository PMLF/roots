"use client";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Ligacao } from "@/ui/components/Ligacao";
import { Tabela } from "@/ui/components/Tabela";
import type { Chave } from "@/ui/i18n";
import { useMeuClube } from "@/ui/meuClube";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Coluna } from "@/ui/tabela/logica";

type Row = CompetitionPage["table"][number];

/** Classificação de uma liga com as zonas de campeão, subida e descida coloridas. `compacta` reduz as colunas (cartões). */
export function TabelaLiga({ page, compacta = false }: { page: CompetitionPage; compacta?: boolean }) {
  const { t } = useT();
  const [meu] = useMeuClube();
  const todas: Coluna<Row>[] = [
    { id: "pos", titulo: t("lab.col.pos"), valor: (l) => l.position, numerica: true },
    { id: "club", titulo: t("lab.col.clube"), valor: (l) => l.name },
    { id: "played", titulo: t("lab.col.jogos"), valor: (l) => l.played, numerica: true },
    { id: "won", titulo: t("lab.col.v"), valor: (l) => l.won, numerica: true },
    { id: "drawn", titulo: t("lab.col.e"), valor: (l) => l.drawn, numerica: true },
    { id: "lost", titulo: t("lab.col.d"), valor: (l) => l.lost, numerica: true },
    { id: "gf", titulo: t("lab.col.gm"), valor: (l) => l.goalsFor, numerica: true },
    { id: "ga", titulo: t("lab.col.gs"), valor: (l) => l.goalsAgainst, numerica: true },
    { id: "gd", titulo: t("lab.col.dif"), valor: (l) => l.goalDifference, numerica: true },
    { id: "pts", titulo: t("lab.col.pts"), valor: (l) => l.points, numerica: true },
  ];
  const colunas = compacta ? todas.filter((c) => ["pos", "club", "played", "gd", "pts"].includes(c.id)) : todas;
  const zonas = new Set(page.table.map((r) => r.zone).filter(Boolean));
  return (
    <>
      <Tabela
        id={compacta ? "liga-compacta" : "liga"}
        simples
        nomeFicheiro={`table-${page.league}`}
        colunas={colunas}
        linhas={page.table}
        chave={(l) => l.club}
        celula={{ club: (l) => <Ligacao k="clube" id={l.club}>{l.name}</Ligacao> }}
        ordemInicial={{ coluna: "pos", direcao: "asc" }}
        classeLinha={(l) => [l.zone ? `zona zona-${l.zone}` : "", l.club === meu ? "meu-clube" : ""].filter(Boolean).join(" ") || undefined}
      />
      {zonas.size > 0 && (
        <ul className="legenda-zonas">
          {(["champion", "promotion", "relegation"] as const).filter((z) => zonas.has(z)).map((z) => (
            <li key={z}><span className={`zona-amostra zona-${z}`} aria-hidden="true" /> {t(`zona.${z}` as Chave)}</li>
          ))}
        </ul>
      )}
    </>
  );
}
