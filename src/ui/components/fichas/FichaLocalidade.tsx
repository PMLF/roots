"use client";
import type { FichaLocalidadeDados } from "@/engine/api/contratos";
import { Ficha } from "@/ui/components/Ficha";
import { Ligacao } from "@/ui/components/Ligacao";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Ficha de uma aldeia, vila ou cidade (RZ-136): estatuto e população atuais, clubes e mudanças de estatuto. */
export function FichaLocalidade({ d }: { d: FichaLocalidadeDados }) {
  const { t, locale } = useT();
  const n = new Intl.NumberFormat(locale);
  const estatuto = (e: string) => t(`estatuto.${e}` as Chave);
  return (
    <Ficha
      tipo="localidade"
      titulo={d.nome}
      subtitulo={`${estatuto(d.estatuto)} · ${d.cidade.nome} (${d.distrito})`}
      numeros={[
        { rotulo: t("localidade.populacao"), valor: n.format(d.populacao) },
        { rotulo: t("localidade.estatuto"), valor: estatuto(d.estatuto) },
        { rotulo: t("localidade.sede"), valor: d.sede ? t("localidade.sim") : t("localidade.nao") },
      ]}
      separadores={{
        resumo: (
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("localidade.concelho")}</th><td><Ligacao k="cidade" id={d.cidade.id}>{d.cidade.nome}</Ligacao> ({d.distrito})</td></tr>
              <tr><th scope="row">{t("localidade.desde")}</th><td>{d.desde}</td></tr>
            </tbody>
          </table>
        ),
        clubes: d.clubes.length > 0 ? (
          <ul className="ligacoes">
            {d.clubes.map((c) => <li key={c.id}><Ligacao k="clube" id={c.id}>{c.nome}</Ligacao> <span className="suave">· {c.liga}</span></li>)}
          </ul>
        ) : (
          <p className="vazio">{t("localidade.semClubes")}</p>
        ),
        historia: d.historico.length > 0 ? (
          <ul>
            {d.historico.map((h, i) => (
              <li key={i}>{t("localidade.mudou", { data: h.data, de: estatuto(h.de), para: estatuto(h.para), populacao: h.populacao })}</li>
            ))}
          </ul>
        ) : (
          <p className="vazio">{t("localidade.semHistoria")}</p>
        ),
      }}
    />
  );
}
