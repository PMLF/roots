"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type KeyboardEvent, type ReactNode } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";
import { TABS, TAB_URL, urlTab, type ProfileEntityType } from "@/ui/links";

export type NumberValue = { label: string; value: ReactNode };
export type Tabs = Partial<Record<string, ReactNode>>;

type Props = {
  type: ProfileEntityType;
  title: string;
  subtitle?: ReactNode;
  numbers?: NumberValue[];
  /** Cabeçalho próprio (nome + cartão de identidade); sem ele, usa-se título, subtítulo e números-chave. */
  top?: ReactNode;
  /** Conteúdo por separador; os que faltam aparecem como "em breve", na ordem fixa do tipo. */
  tabs: Tabs;
  /** Separadores que esta ficha não tem (por exemplo «Carreira» nas pessoas que não são jogadores). */
  omit?: readonly string[];
};

/** Estrutura comum a todas as entidades (TOM_E_UX §3.2): cabeçalho, números-chave, separadores fixos, ligações. */
export function Profile({ type, title, subtitle, numbers = [], top, tabs, omit = [] }: Props) {
  const { t } = useT();
  const ids = TABS[type].filter((id) => !omit.includes(id));
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  // O separador vive no URL (`tab`) e a mudança substitui a entrada do histórico: «Voltar» sai da ficha em vez de saltar entre separadores.
  const pendingRequest = urlTab(params.get("tab"));
  const active = pendingRequest && ids.includes(pendingRequest) ? pendingRequest : (ids[0] as string);
  const setActive = (id: string) => {
    if (id === active) return;
    const fresh = new URLSearchParams(params.toString());
    fresh.set("tab", TAB_URL[id] ?? id);
    fresh.delete("sort");
    router.replace(`${path}?${fresh.toString()}`, { scroll: false });
  };
  const label = (id: string) => t(`tab.${id}` as Key);

  const hotkeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ids.indexOf(active);
    if (e.key === "ArrowRight") setActive(ids[(i + 1) % ids.length] as string);
    else if (e.key === "ArrowLeft") setActive(ids[(i - 1 + ids.length) % ids.length] as string);
  };

  return (
    <article className="ficha" data-tipo={type}>
      {top ?? (
        <header className="ficha-cabecalho">
          <p className="ficha-tipo">{t(`entity.${type}` as Key)}</p>
          <h1>{title}</h1>
          {subtitle && <p className="suave">{subtitle}</p>}
          <dl className="ficha-numeros">
            {numbers.map((n) => (
              <div key={n.label}>
                <dt>{n.label}</dt>
                <dd>{n.value}</dd>
              </div>
            ))}
          </dl>
        </header>
      )}
      <div className="ficha-corpo">
        <div className="ficha-principal" onKeyDown={hotkeys}>
          <div role="tablist" aria-label={t("profile.tabs")} className="separadores">
            {ids.map((id) => (
              <button key={id} role="tab" type="button" id={`sep-${id}`} aria-selected={active === id} aria-controls={`painel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => setActive(id)}>
                {label(id)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`painel-${active}`} aria-labelledby={`sep-${active}`} className="separador-corpo">
            {tabs[active] ?? <p className="vazio">{t("profile.soon")}</p>}
          </div>
        </div>
      </div>
    </article>
  );
}
