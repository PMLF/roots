"use client";
import type { Noticia } from "@/engine/noticias/noticias";
import { Ligacao } from "@/ui/components/Ligacao";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Uma notícia ou mensagem: título, frase de apoio e ligações para as fichas. O texto vem das chaves `noticia.<tipo>.<n>.*`. */
export function ItemNoticia({ n, naoLida, compacto, aoAlternarLida }: { n: Noticia; naoLida?: boolean; compacto?: boolean; /** Na caixa de entrada: marcar como lida ou por ler. */ aoAlternarLida?: () => void }) {
  const { t, locale } = useT();
  const tipo = n.tipo === "resultado" ? `resultado.${n.valores.resultado}` : n.tipo === "cidade_evento" ? `cidade.${n.valores.evento}` : n.tipo;
  const valores = { ...n.valores } as Record<string, string | number>;
  if (n.tipo === "localidade") {
    valores.de = t(`estatuto.${valores.de}` as Chave).toLowerCase();
    valores.para = t(`estatuto.${valores.para}` as Chave).toLowerCase();
  }
  const base = `noticia.${tipo}.${n.variante}`;
  if (compacto) {
    return (
      <article className={`noticia noticia-compacta${naoLida ? " nao-lida" : ""}`}>
        <h3>{aoAlternarLida ? <button type="button" className={`ponto-alternar${naoLida ? " por-ler" : ""}`} onClick={aoAlternarLida} title={t(naoLida ? "caixa.marcarLida" : "caixa.marcarPorLer")} aria-label={t(naoLida ? "caixa.marcarLida" : "caixa.marcarPorLer")} /> : naoLida && <span className="ponto" role="img" aria-label={t("caixa.naoLida")} />}{t(`${base}.titulo` as Chave, valores)}</h3>
        <p className="suave">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${n.data}T00:00:00Z`))}</p>
      </article>
    );
  }
  return (
    <article className={`noticia${naoLida ? " nao-lida" : ""}${n.doTeuClube ? " do-teu-clube" : ""}`}>
      <h3>{naoLida && <span className="ponto" role="img" aria-label={t("caixa.naoLida")} />}{t(`${base}.titulo` as Chave, valores)}</h3>
      <p>{t(`${base}.corpo` as Chave, valores)}</p>
      <p className="suave noticia-rodape">
        {n.data} · {n.ligacoes.map((l, i) => <span key={`${l.k}-${l.id}`}>{i > 0 && " · "}<Ligacao k={l.k} id={l.id}>{l.nome}</Ligacao></span>)}
        {aoAlternarLida && <button type="button" className="ligacao-botao" onClick={aoAlternarLida}>{t(naoLida ? "caixa.marcarLida" : "caixa.marcarPorLer")}</button>}
      </p>
    </article>
  );
}
