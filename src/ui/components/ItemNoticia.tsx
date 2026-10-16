"use client";
import type { Noticia } from "@/engine/noticias/noticias";
import { Ligacao } from "@/ui/components/Ligacao";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Uma notícia ou mensagem: título, frase de apoio e ligações para as fichas. O texto vem das chaves `noticia.<tipo>.<n>.*`. */
export function ItemNoticia({ n, naoLida }: { n: Noticia; naoLida?: boolean }) {
  const { t } = useT();
  const tipo = n.tipo === "resultado" ? `resultado.${n.valores.resultado}` : n.tipo === "cidade_evento" ? `cidade.${n.valores.evento}` : n.tipo;
  const valores = { ...n.valores } as Record<string, string | number>;
  if (n.tipo === "localidade") {
    valores.de = t(`estatuto.${valores.de}` as Chave).toLowerCase();
    valores.para = t(`estatuto.${valores.para}` as Chave).toLowerCase();
  }
  const base = `noticia.${tipo}.${n.variante}`;
  return (
    <article className={`noticia${naoLida ? " nao-lida" : ""}${n.doTeuClube ? " do-teu-clube" : ""}`}>
      <h3>{naoLida && <span className="ponto" role="img" aria-label={t("caixa.naoLida")} />}{t(`${base}.titulo` as Chave, valores)}</h3>
      <p>{t(`${base}.corpo` as Chave, valores)}</p>
      <p className="suave noticia-rodape">
        {n.data} · {n.ligacoes.map((l, i) => <span key={`${l.k}-${l.id}`}>{i > 0 && " · "}<Ligacao k={l.k} id={l.id}>{l.nome}</Ligacao></span>)}
      </p>
    </article>
  );
}
