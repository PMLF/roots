"use client";
import type { FichaPessoaDados } from "@/engine/api/contratos";
import type { Conhecimento } from "@/engine/vista/tipos";
import { Ficha } from "@/ui/components/Ficha";
import { Ligacao } from "@/ui/components/Ligacao";
import { Tabela } from "@/ui/components/Tabela";
import { Valor } from "@/ui/components/Valor";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { nomePosicao } from "@/ui/i18n/posicao";
import type { Coluna } from "@/ui/tabela/logica";
import { usePaises } from "@/ui/usePaises";
import { mostrarEstimativa } from "@/ui/valor";

type LinhaAtributo = { id: string; nome: string; est: Conhecimento["campos"][string] };

export function FichaPessoa({ d }: { d: FichaPessoaDados }) {
  const { t } = useT();
  const pais = usePaises();
  const { publico: p, atributos, potencial, personalidade } = d.ficha;
  const j = p.jogador;

  const linhas: LinhaAtributo[] = atributos ? Object.entries(atributos.campos).map(([id, est]) => ({ id, nome: t(`atributo.${id}` as Chave), est })) : [];
  const colunas: Coluna<LinhaAtributo>[] = [
    { id: "nome", titulo: t("coluna.atributo"), valor: (l) => l.nome },
    { id: "valor", titulo: t("coluna.valor"), valor: (l) => l.est.valor, numerica: true },
  ];

  const conhecimento = (
    <>
      {!atributos && !potencial && !personalidade && <p className="vazio">{t("pessoa.naoObservado")}</p>}
      {potencial?.campos.potencial && (
        <p>
          {t("pessoa.potencial")}: <Valor v={mostrarEstimativa(potencial.campos.potencial, potencial.campos.potencial)} />
        </p>
      )}
      {personalidade && (
        <p>
          {t("pessoa.personalidade")}:{" "}
          {personalidade.rotulos.length > 0
            ? personalidade.rotulos.map((r) => t(`traco.${r.traco}.${r.faixa}` as Chave)).join(" · ")
            : t("pessoa.semTracosMarcados")}
          {personalidade.desatualizado && <small className="valor-nota"> · {t("valor.vistoHa", { epocas: personalidade.epocasDesde })}</small>}
        </p>
      )}
      {atributos && (
        <Tabela
          id="atributos"
          nomeFicheiro={`atributos-${p.id}`}
          colunas={colunas}
          linhas={linhas}
          chave={(l) => l.id}
          celula={{ valor: (l) => <Valor v={mostrarEstimativa(l.est, l.est)} /> }}
          ordemInicial={{ coluna: "valor", direcao: "desc" }}
        />
      )}
    </>
  );

  return (
    <Ficha
      tipo="pessoa"
      titulo={p.nomeDesportivo}
      subtitulo={p.nome}
      numeros={[
        { rotulo: t("coluna.idade"), valor: p.idade },
        ...(j ? [{ rotulo: t("coluna.posicao"), valor: nomePosicao(t, j.posicao) }] : p.funcao ? [{ rotulo: t("coluna.funcao"), valor: t(`funcao.${p.funcao}` as Chave) }] : []),
        { rotulo: t("coluna.pais"), valor: pais(p.nacionalidade) },
        ...(d.clube ? [{ rotulo: t("entidade.clube"), valor: <Ligacao k="clube" id={d.clube.id}>{d.clube.nome}</Ligacao> }] : []),
      ]}
      separadores={{
        resumo: (
          <table className="tabela">
            <tbody>
              <tr><th scope="row">{t("pessoa.nascimento")}</th><td>{p.nascimento}</td></tr>
              {d.naturalDe && <tr><th scope="row">{t("pessoa.naturalDe")}</th><td><Ligacao k="cidade" id={d.naturalDe.id}>{d.naturalDe.nome}</Ligacao></td></tr>}
              {j && <tr><th scope="row">{t("pessoa.corpo")}</th><td>{j.alturaCm} cm · {j.pesoKg} kg · {t(`pe.${j.pe}` as Chave)}</td></tr>}
              {j && <tr><th scope="row">{t("pessoa.estado")}</th><td>{t(`estado.${j.estado}` as Chave)}</td></tr>}
            </tbody>
          </table>
        ),
        conhecimento,
      }}
      lateral={
        <ul className="ligacoes">
          {d.clube && <li><Ligacao k="clube" id={d.clube.id}>{d.clube.nome}</Ligacao></li>}
          {d.naturalDe && <li><Ligacao k="cidade" id={d.naturalDe.id}>{d.naturalDe.nome}</Ligacao></li>}
        </ul>
      }
    />
  );
}
