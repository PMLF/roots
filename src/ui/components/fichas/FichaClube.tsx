"use client";
import type { FichaClubeDados } from "@/engine/api/contratos";
import type { PessoaVista } from "@/engine/vista/tipos";
import { Ficha } from "@/ui/components/Ficha";
import { Ligacao } from "@/ui/components/Ligacao";
import { Tabela } from "@/ui/components/Tabela";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Coluna } from "@/ui/tabela/logica";
import { usePaises } from "@/ui/usePaises";

export function FichaClube({ d }: { d: FichaClubeDados }) {
  const { t, locale } = useT();
  const pais = usePaises();
  const n = new Intl.NumberFormat(locale);

  const plantel: Coluna<PessoaVista>[] = [
    { id: "nome", titulo: t("coluna.nome"), valor: (p) => p.nomeDesportivo },
    { id: "idade", titulo: t("coluna.idade"), valor: (p) => p.idade, numerica: true },
    { id: "pos", titulo: t("coluna.posicao"), valor: (p) => p.jogador?.posicao ?? "" },
    { id: "pais", titulo: t("coluna.pais"), valor: (p) => pais(p.nacionalidade) },
    { id: "pe", titulo: t("coluna.pe"), valor: (p) => p.jogador?.pe ?? "" },
    { id: "altura", titulo: t("coluna.altura"), valor: (p) => p.jogador?.alturaCm ?? 0, numerica: true },
  ];
  const staff: Coluna<PessoaVista>[] = [
    { id: "nome", titulo: t("coluna.nome"), valor: (p) => p.nomeDesportivo },
    { id: "funcao", titulo: t("coluna.funcao"), valor: (p) => (p.funcao ? t(`funcao.${p.funcao}` as Chave) : "") },
    { id: "idade", titulo: t("coluna.idade"), valor: (p) => p.idade, numerica: true },
    { id: "pais", titulo: t("coluna.pais"), valor: (p) => pais(p.nacionalidade) },
  ];
  const nome = (p: PessoaVista) => <Ligacao k="pessoa" id={p.id}>{p.nomeDesportivo}</Ligacao>;
  const presidente = d.cargos.find((c) => c.funcao === "presidente");

  return (
    <Ficha
      tipo="clube"
      titulo={d.nome}
      subtitulo={d.liga}
      numeros={[
        { rotulo: t("clube.reputacao"), valor: n.format(d.reputacao) },
        { rotulo: t("clube.estadio"), valor: `${d.estadio.nome} (${n.format(d.estadio.capacidade)})` },
        { rotulo: t("clube.plantel"), valor: d.plantel.length },
      ]}
      separadores={{
        resumo: (
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("clube.localidade")}</th><td><Ligacao k="localidade" id={d.localidade.id}>{d.localidade.nome}</Ligacao> <span className="suave">({t(`estatuto.${d.localidade.estatuto}` as Chave).toLowerCase()})</span></td></tr>
              <tr><th scope="row">{t("clube.concelho")}</th><td><Ligacao k="cidade" id={d.cidade.id}>{d.cidade.nome}</Ligacao> ({d.distrito})</td></tr>
              <tr><th scope="row">{t("clube.cores")}</th><td>{d.cores}</td></tr>
              <tr><th scope="row">{t("clube.alcunha")}</th><td>{d.alcunha} · {d.mascote}</td></tr>
              {d.rival && <tr><th scope="row">{t("clube.rival")}</th><td><Ligacao k="clube" id={d.rival.id}>{d.rival.nome}</Ligacao></td></tr>}
            </tbody>
          </table>
        ),
        plantel: d.plantel.length > 0 ? (
          <Tabela id="plantel" nomeFicheiro={`plantel-${d.id}`} colunas={plantel} linhas={d.plantel} chave={(p) => p.id} celula={{ nome }} ordemInicial={{ coluna: "pos", direcao: "asc" }} />
        ) : (
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
        staff: d.cargos.length > 0 ? (
          <Tabela id="staff" nomeFicheiro={`staff-${d.id}`} colunas={staff} linhas={d.cargos} chave={(p) => p.id} celula={{ nome }} />
        ) : (
          <p className="vazio">{t("clube.semMundo")}</p>
        ),
      }}
      lateral={
        <ul className="ligacoes">
          <li><Ligacao k="localidade" id={d.localidade.id}>{d.localidade.nome}</Ligacao></li>
          <li><Ligacao k="cidade" id={d.cidade.id}>{d.cidade.nome}</Ligacao></li>
          {d.rival && <li><Ligacao k="clube" id={d.rival.id}>{d.rival.nome}</Ligacao></li>}
          {presidente && <li><Ligacao k="pessoa" id={presidente.id}>{presidente.nomeDesportivo}</Ligacao> <span className="suave">· {t("funcao.presidente")}</span></li>}
        </ul>
      }
    />
  );
}
