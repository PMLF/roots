"use client";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Cartao } from "@/ui/components/Cartao";
import { ListaJogadores } from "@/ui/components/competicao/Destaques";
import { Ligacao } from "@/ui/components/Ligacao";
import { Tabela } from "@/ui/components/Tabela";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { siglaPosicao } from "@/ui/i18n/posicao";
import type { Coluna } from "@/ui/tabela/logica";

type Player = CompetitionPage["players"][number];
type TeamRow = CompetitionPage["table"][number];

/** Separador Estatísticas de uma competição: top 10 de cada lista, todas as equipas e todos os jogadores, ordenáveis. */
export function Estatisticas({ page }: { page: CompetitionPage }) {
  const { t, locale } = useT();
  const h = page.highlights;
  const nota = (v: number) => v.toFixed(2);
  const dec = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const perGame = (v: number, jogos: number) => (jogos > 0 ? v / jogos : 0);

  const equipas: Coluna<TeamRow>[] = [
    { id: "club", titulo: t("lab.col.clube"), valor: (r) => r.name },
    { id: "played", titulo: t("lab.col.jogos"), valor: (r) => r.played, numerica: true },
    { id: "gf", titulo: t("lab.col.gm"), valor: (r) => r.goalsFor, numerica: true },
    { id: "ga", titulo: t("lab.col.gs"), valor: (r) => r.goalsAgainst, numerica: true },
    { id: "gf-game", titulo: t("coluna.golosJogo"), valor: (r) => perGame(r.goalsFor, r.played), numerica: true },
    { id: "ga-game", titulo: t("coluna.sofridosJogo"), valor: (r) => perGame(r.goalsAgainst, r.played), numerica: true },
    { id: "gd", titulo: t("lab.col.dif"), valor: (r) => r.goalDifference, numerica: true },
  ];
  const jogadores: Coluna<Player>[] = [
    { id: "player", titulo: t("coluna.jogador"), valor: (p) => p.name },
    { id: "club", titulo: t("lab.col.clube"), valor: (p) => p.clubName },
    { id: "pos", titulo: t("coluna.posicao"), valor: (p) => siglaPosicao(t, p.position) },
    { id: "age", titulo: t("coluna.idade"), valor: (p) => p.age, numerica: true },
    { id: "games", titulo: t("coluna.jogos"), valor: (p) => p.games, numerica: true },
    { id: "minutes", titulo: t("coluna.minutos"), valor: (p) => p.minutes, numerica: true },
    { id: "goals", titulo: t("coluna.golos"), valor: (p) => p.goals, numerica: true },
    { id: "assists", titulo: t("coluna.assistencias"), valor: (p) => p.assists, numerica: true },
    { id: "rating", titulo: t("coluna.nota"), valor: (p) => p.rating ?? "", numerica: true },
    { id: "yellow", titulo: t("coluna.amarelos"), valor: (p) => p.yellow, numerica: true },
    { id: "red", titulo: t("coluna.vermelhos"), valor: (p) => p.red, numerica: true },
  ];

  return (
    <div className="estatisticas">
      <div className="estatisticas-tops">
        {([
          ["destaques.marcadores", h.topScorers, undefined],
          ["destaques.assistentes", h.topAssists, undefined],
          ["destaques.melhoresJogadores", h.bestRated, nota],
          ["destaques.amarelos", h.mostYellow, undefined],
          ["destaques.vermelhos", h.mostRed, undefined],
        ] as const).map(([chave, itens, fmt]) => (
          <Cartao key={chave}>
            <ListaJogadores titulo={t(chave as Chave)} itens={[...itens]} {...(fmt ? { fmt } : {})} />
          </Cartao>
        ))}
      </div>
      <Cartao titulo={t("estatisticas.equipas")} larga>
        <Tabela
          id="estatisticas-equipas"
          nomeFicheiro={`teams-${page.league}`}
          colunas={equipas}
          linhas={page.table}
          chave={(r) => r.club}
          celula={{
            club: (r) => <Ligacao k="clube" id={r.club}>{r.name}</Ligacao>,
            "gf-game": (r) => dec.format(perGame(r.goalsFor, r.played)),
            "ga-game": (r) => dec.format(perGame(r.goalsAgainst, r.played)),
          }}
          ordemInicial={{ coluna: "gf", direcao: "desc" }}
        />
      </Cartao>
      <Cartao titulo={t("estatisticas.jogadores")} larga>
        {page.players.length === 0 ? (
          <p className="vazio">{t("destaques.semDados")}</p>
        ) : (
          <Tabela
            id="estatisticas-jogadores"
            nomeFicheiro={`players-${page.league}`}
            colunas={jogadores}
            linhas={page.players}
            chave={(p) => p.player}
            celula={{
              player: (p) => <Ligacao k="pessoa" id={p.player}>{p.name}</Ligacao>,
              club: (p) => <Ligacao k="clube" id={p.club}>{p.clubName}</Ligacao>,
              rating: (p) => (p.rating !== undefined ? nota(p.rating) : "—"),
            }}
            ordemInicial={{ coluna: "goals", direcao: "desc" }}
          />
        )}
      </Cartao>
    </div>
  );
}
