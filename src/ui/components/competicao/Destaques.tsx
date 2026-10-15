"use client";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Cartao, Dados } from "@/ui/components/Cartao";
import { Ligacao } from "@/ui/components/Ligacao";
import { useT } from "@/ui/i18n/LocaleProvider";

type Lista = CompetitionPage["highlights"]["topScorers"];

function ListaJogadores({ titulo, itens, formato }: { titulo: string; itens: Lista; formato?: (v: number) => string }) {
  const { t } = useT();
  return (
    <Cartao titulo={titulo}>
      {itens.length === 0 ? (
        <p className="vazio">{t("destaques.semDados")}</p>
      ) : (
        <ol className="destaque-lista">
          {itens.map((p) => (
            <li key={p.player}>
              <span><Ligacao k="pessoa" id={p.player}>{p.name}</Ligacao> <span className="suave">· <Ligacao k="clube" id={p.club}>{p.clubName}</Ligacao></span></span>
              <b>{formato ? formato(p.value) : p.value}</b>
            </li>
          ))}
        </ol>
      )}
    </Cartao>
  );
}

/** Melhor ataque e melhor defesa. */
export function CartaoEquipas({ h }: { h: CompetitionPage["highlights"] }) {
  const { t } = useT();
  const semDados = <span className="suave">—</span>;
  const clube = (c: { club: string; name: string; value: number } | undefined) => (c ? <><Ligacao k="clube" id={c.club}>{c.name}</Ligacao> <b>{c.value}</b></> : semDados);
  return (
    <Cartao titulo={t("destaques.equipas")}>
      <Dados linhas={[{ rotulo: t("destaques.melhorAtaque"), valor: clube(h.bestAttack) }, { rotulo: t("destaques.melhorDefesa"), valor: clube(h.bestDefence) }]} />
    </Cartao>
  );
}

export function ListasDestaques({ h, quais }: { h: CompetitionPage["highlights"]; quais: ("scorers" | "assists" | "rated" | "yellow" | "red")[] }) {
  const { t } = useT();
  const nota = (v: number) => v.toFixed(2);
  return (
    <>
      {quais.includes("scorers") && <ListaJogadores titulo={t("destaques.marcadores")} itens={h.topScorers} />}
      {quais.includes("assists") && <ListaJogadores titulo={t("destaques.assistentes")} itens={h.topAssists} />}
      {quais.includes("rated") && <ListaJogadores titulo={t("destaques.melhoresJogadores")} itens={h.bestRated} formato={nota} />}
      {quais.includes("yellow") && <ListaJogadores titulo={t("destaques.amarelos")} itens={h.mostYellow} />}
      {quais.includes("red") && <ListaJogadores titulo={t("destaques.vermelhos")} itens={h.mostRed} />}
    </>
  );
}
