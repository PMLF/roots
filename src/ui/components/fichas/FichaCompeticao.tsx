"use client";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Cartao, Dados, Topo } from "@/ui/components/Cartao";
import { Chip } from "@/ui/components/Atributos";
import { CartaoEquipas, ListasDestaques } from "@/ui/components/competicao/Destaques";
import { Jornadas } from "@/ui/components/competicao/Jornadas";
import { TabelaLiga } from "@/ui/components/competicao/TabelaLiga";
import { Ficha } from "@/ui/components/Ficha";
import { Ligacao } from "@/ui/components/Ligacao";
import { Tabela } from "@/ui/components/Tabela";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Coluna } from "@/ui/tabela/logica";

type ClubRow = CompetitionPage["clubs"][number];

/** Página de uma liga (RZ-145): classificação e destaques logo à entrada, jornadas paginadas, clubes e história. */
export function FichaCompeticao({ d }: { d: CompetitionPage }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const escalao = t(`escalao.${d.tier}` as Chave);

  const colunasClubes: Coluna<ClubRow>[] = [
    { id: "club", titulo: t("lab.col.clube"), valor: (c) => c.name },
    { id: "locality", titulo: t("coluna.localidade"), valor: (c) => c.locality },
    { id: "reputation", titulo: t("coluna.rep"), valor: (c) => c.reputation, numerica: true },
    { id: "stadium", titulo: t("coluna.estadio"), valor: (c) => c.capacity, numerica: true },
  ];

  const topo = (
    <Topo
      titulo={d.league}
      etiquetas={<><Chip tom="destaque">{escalao}</Chip>{d.district && <Chip tom="suave">{d.district}</Chip>}<Chip tom="suave">{t("competicoes.clubes", { n: d.clubs.length })}</Chip><Chip tom="suave">{t("competicao.jogos")}: {d.gamesPlayed}/{d.gamesTotal}</Chip></>}
    />
  );

  const resumo = (
    <div className="liga-pagina">
      {d.preview && <p className="aviso-previa">{t("competicao.previa")}</p>}
      <div className="liga-topo">
        <Cartao titulo={t("separador.classificacao")}>
          <TabelaLiga page={d} />
        </Cartao>
        <div className="liga-destaques">
          <CartaoEquipas h={d.highlights} />
          <ListasDestaques h={d.highlights} quais={["scorers", "assists"]} />
        </div>
      </div>
      <div className="cartoes">
        <ListasDestaques h={d.highlights} quais={["rated", "yellow", "red"]} />
      </div>
      <Jornadas page={d} />
    </div>
  );

  return (
    <Ficha
      tipo="competicao"
      titulo={d.league}
      topo={topo}
      separadores={{
        resumo,
        clubes: (
          <Tabela id="competicao-clubes" nomeFicheiro={`clubs-${d.league}`} colunas={colunasClubes} linhas={d.clubs} chave={(c) => c.id} celula={{ club: (c) => <Ligacao k="clube" id={c.id}>{c.name}</Ligacao>, stadium: (c) => n.format(c.capacity) }} ordemInicial={{ coluna: "reputation", direcao: "desc" }} />
        ),
        historia: (
          <Cartao titulo={t("separador.historia")}>
            <Dados linhas={[]} />
            <p className="vazio">{t("competicao.semHistoria")}</p>
          </Cartao>
        ),
      }}
    />
  );
}
