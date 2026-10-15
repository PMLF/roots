"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Chave } from "@/ui/i18n";
import { SEPARADORES, type TipoEntidadeFicha } from "@/ui/ligacoes";

export type Numero = { rotulo: string; valor: ReactNode };
export type Separadores = Partial<Record<string, ReactNode>>;

type Props = {
  tipo: TipoEntidadeFicha;
  titulo: string;
  subtitulo?: ReactNode;
  numeros?: Numero[];
  /** Cabeçalho próprio (nome + cartão de identidade); sem ele, usa-se título, subtítulo e números-chave. */
  topo?: ReactNode;
  /** Conteúdo por separador; os que faltam aparecem como "em breve", na ordem fixa do tipo. */
  separadores: Separadores;
};

/** Estrutura comum a todas as entidades (TOM_E_UX §3.2): cabeçalho, números-chave, separadores fixos, ligações. */
export function Ficha({ tipo, titulo, subtitulo, numeros = [], topo, separadores }: Props) {
  const { t } = useT();
  const ids = SEPARADORES[tipo];
  const router = useRouter();
  const caminho = usePathname();
  const params = useSearchParams();
  // O separador vive no URL (`sep`) e cada mudança entra no histórico: «Voltar» regressa ao mesmo separador.
  const pedido = params.get("sep");
  const ativo = pedido && ids.includes(pedido) ? pedido : (ids[0] as string);
  const setAtivo = (id: string) => {
    if (id === ativo) return;
    const novos = new URLSearchParams(params.toString());
    novos.set("sep", id);
    novos.delete("ord");
    router.push(`${caminho}?${novos.toString()}`, { scroll: false });
  };
  const rotulo = (id: string) => t(`separador.${id}` as Chave);

  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ids.indexOf(ativo);
    if (e.key === "ArrowRight") setAtivo(ids[(i + 1) % ids.length] as string);
    else if (e.key === "ArrowLeft") setAtivo(ids[(i - 1 + ids.length) % ids.length] as string);
  };

  return (
    <article className="ficha" data-tipo={tipo}>
      {topo ?? (
        <header className="ficha-cabecalho">
          <p className="ficha-tipo">{t(`entidade.${tipo}` as Chave)}</p>
          <h1>{titulo}</h1>
          {subtitulo && <p className="suave">{subtitulo}</p>}
          <dl className="ficha-numeros">
            {numeros.map((n) => (
              <div key={n.rotulo}>
                <dt>{n.rotulo}</dt>
                <dd>{n.valor}</dd>
              </div>
            ))}
          </dl>
        </header>
      )}
      <div className="ficha-corpo">
        <div className="ficha-principal" onKeyDown={teclas}>
          <div role="tablist" aria-label={t("ficha.separadores")} className="separadores">
            {ids.map((id) => (
              <button key={id} role="tab" type="button" id={`sep-${id}`} aria-selected={ativo === id} aria-controls={`painel-${id}`} tabIndex={ativo === id ? 0 : -1} onClick={() => setAtivo(id)}>
                {rotulo(id)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`painel-${ativo}`} aria-labelledby={`sep-${ativo}`} className="separador-corpo">
            {separadores[ativo] ?? <p className="vazio">{t("ficha.embreve")}</p>}
          </div>
        </div>
      </div>
    </article>
  );
}
