"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CreatedWorldSummary, SaveMeta } from "@/engine/api/contracts";
import pkg from "../../../package.json";
import { Icon } from "@/ui/components/Icon";
import { useEngine } from "@/ui/EngineProvider";
import { LOCALES, type Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { enterGame, leaveGame, lastOpened, rememberOpened } from "@/ui/session";
import { read, save } from "@/ui/storage";

const MIN_SPINNER_MS = 700;

/**
 * Ecrã inicial (RZ-501): continuar o último save, novo jogo, carregar um save, importar um ficheiro e definições.
 * Abrir um save mostra um indicador a rodar e entra no Início.
 */
export function TitleScreen() {
  const { t, locale, setLocale } = useT();
  const engine = useEngine();
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [world, setWorld] = useState<CreatedWorldSummary | null | undefined>(undefined);
  const [saves, setSaves] = useState<SaveMeta[] | undefined>(undefined);
  const [panel, setPanel] = useState<"none" | "load" | "settings">("none");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const gameDate = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  useEffect(() => { leaveGame(); }, []);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("worldState", null).then((w) => live && setWorld(w)).catch(() => live && setWorld(null));
    engine.call("saves", null).then((s) => live && setSaves(s)).catch(() => live && setSaves([]));
    return () => { live = false; };
  }, [engine]);

  const open = useCallback(async (job: () => Promise<void>) => {
    setOpening(true);
    setError(undefined);
    const started = Date.now();
    try {
      await job();
      await new Promise((r) => window.setTimeout(r, Math.max(0, MIN_SPINNER_MS - (Date.now() - started))));
      enterGame();
      window.dispatchEvent(new Event("raizes:mundo"));
      window.dispatchEvent(new Event("raizes:meuClube"));
      window.dispatchEvent(new Event("raizes:tempo"));
      router.push("/");
    } catch (e) {
      setOpening(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [router]);

  const last = lastOpened();
  const lastSave = last?.kind === "save" ? saves?.find((s) => s.id === last.id) : undefined;
  const canContinue = !!world;
  const continueGame = () => open(async () => { rememberOpened({ kind: "current" }); });
  const loadSave = (id: string) => open(async () => { await engine?.call("loadSave", { id }); rememberOpened({ kind: "save", id }); });
  const importFile = (f: File) => open(async () => { await engine?.call("importSave", { bytes: new Uint8Array(await f.arrayBuffer()) }); rememberOpened({ kind: "current" }); });
  const setTheme = (v: string) => { save("raizes.theme", v); window.dispatchEvent(new Event("raizes:tema")); };

  return (
    <section className="inicio-jogo" data-testid="ecra-inicial">
      <div className="inicio-marca">
        <span className="marca-sinal"><Icon name="root" /></span>
        <h1>{t("app.name")}</h1>
        <p className="suave">{t("app.subtitle")}</p>
      </div>

      <div className="inicio-botoes">
        {canContinue && (
          <button type="button" className="primario inicio-continuar" disabled={opening} onClick={() => void continueGame()} data-testid="inicio-continuar">
            <span>{t("title.continue")}</span>
            <small>{lastSave ? t("title.continueSave", { name: lastSave.name ?? t(`saves.kind.${lastSave.kind}` as Key), date: gameDate(lastSave.gameDate) }) : t("title.continueCurrent")}</small>
          </button>
        )}
        <button type="button" disabled={opening} onClick={() => router.push("/new/")} data-testid="inicio-novo">{t("title.new")}</button>
        <button type="button" disabled={opening} aria-expanded={panel === "load"} onClick={() => setPanel(panel === "load" ? "none" : "load")} data-testid="inicio-carregar">{t("title.load")}</button>
        <button type="button" disabled={opening} onClick={() => file.current?.click()} data-testid="inicio-importar">{t("title.import")}</button>
        <button type="button" disabled={opening} aria-expanded={panel === "settings"} onClick={() => setPanel(panel === "settings" ? "none" : "settings")} data-testid="inicio-definicoes">{t("title.settings")}</button>
        <input ref={file} type="file" accept=".raizes,.sqlite,application/octet-stream" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
      </div>

      {error && <p className="erro" role="alert">{error}</p>}

      {panel === "load" && (
        <div className="cartao inicio-painel" data-testid="inicio-lista">
          <h2>{t("title.load")}</h2>
          {!saves ? <p>{t("profile.loading")}</p> : saves.length === 0 ? <p className="vazio">{t("saves.empty")}</p> : (
            <ul className="inicio-saves">
              {[...saves].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => (
                <li key={s.id}>
                  <button type="button" disabled={opening} onClick={() => void loadSave(s.id)} data-testid="inicio-save">
                    <b><span className="chip chip-suave">{t(`saves.kind.${s.kind}` as Key)}</span> {s.name ?? ""}</b>
                    <span className="suave">{s.club ?? "—"} · {gameDate(s.gameDate)} · {t("saves.season", { n: s.season })}</span>
                    <span className="suave">{t("title.savedAt", { date: date(s.createdAt) })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {panel === "settings" && (
        <div className="cartao inicio-painel" data-testid="inicio-opcoes">
          <h2>{t("title.settings")}</h2>
          <div className="definicoes-linha">
            <span>{t("language.label")}</span>
            <select value={locale} aria-label={t("language.label")} onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}>
              {LOCALES.map((l) => <option key={l} value={l}>{t(`language.${l}` as Key)}</option>)}
            </select>
          </div>
          <div className="definicoes-linha">
            <span>{t("theme.label")}</span>
            <select defaultValue={read("raizes.theme", (v): v is string => typeof v === "string") ?? "auto"} onChange={(e) => setTheme(e.target.value)} aria-label={t("theme.label")}>
              {(["auto", "light", "dark"] as const).map((v) => <option key={v} value={v}>{t(`theme.${v}` as Key)}</option>)}
            </select>
          </div>
        </div>
      )}

      <footer className="inicio-rodape suave">
        <span>{t("title.version", { version: pkg.version })}</span>
        <span>{t("title.news")}</span>
      </footer>

      {opening && (
        <div className="inicio-a-abrir" role="status" aria-live="polite" data-testid="inicio-a-abrir">
          <span className="rodar" aria-hidden="true" /> {t("title.opening")}
        </div>
      )}
    </section>
  );
}
