"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveMeta } from "@/engine/api/contracts";
import { markExported } from "@/ui/backupReminder";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";

const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

/** Página dos saves (RZ-134): guardar agora, carregar, exportar, importar e apagar. */
export function Saves() {
  const { t, locale } = useT();
  const engine = useEngine();
  const [list, setList] = useState<SaveMeta[] | undefined>(undefined);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "erro"; text: string } | undefined>(undefined);
  const [confirm, setConfirm] = useState<{ action: "load" | "delete"; id: string } | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(() => { engine?.call("saves", null).then(setList).catch((e) => setMessage({ kind: "erro", text: String(e) })); }, [engine]);
  useEffect(() => { load(); }, [load]);

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setMessage(undefined);
    try { await job(); } catch (e) { setMessage({ kind: "erro", text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); setConfirm(undefined); }
  };
  const download = (filename: string, bytes: Uint8Array) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const gameDate = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  const saveNow = () => run(async () => {
    await engine?.call("saveGame", name.trim() ? { name: name.trim() } : {});
    setName("");
    setMessage({ kind: "ok", text: t("saves.saved") });
    load();
  });
  const exportOne = (id?: string) => run(async () => {
    const r = await engine?.call("exportSave", id ? { id } : {});
    if (r) { download(r.filename, r.bytes); markExported(); }
  });
  const loadOne = (id: string) => run(async () => {
    await engine?.call("loadSave", { id });
    window.location.reload();
  });
  const removeOne = (id: string) => run(async () => { await engine?.call("deleteSave", { id }); load(); });
  const importFile = (f: File) => run(async () => {
    await engine?.call("importSave", { bytes: new Uint8Array(await f.arrayBuffer()) });
    window.location.reload();
  });

  return (
    <section className="pagina-clube" data-testid="saves">
      <h1>{t("saves.title")}</h1>
      <p className="suave">{t("saves.reminder")}</p>
      <div className="cartao saves-guardar">
        <label>
          <span>{t("saves.nameLabel")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("saves.namePlaceholder")} maxLength={60} disabled={busy} data-testid="saves-nome" />
        </label>
        <button type="button" className="primario" onClick={() => void saveNow()} disabled={busy} data-testid="saves-guardar">{t("saves.saveNow")}</button>
        <button type="button" onClick={() => void exportOne()} disabled={busy} data-testid="saves-exportar-atual">{t("saves.exportCurrent")}</button>
        <button type="button" onClick={() => file.current?.click()} disabled={busy} data-testid="saves-importar">{t("saves.import")}</button>
        <input ref={file} type="file" accept=".raizes,.sqlite,application/octet-stream" hidden data-testid="saves-ficheiro" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
      </div>
      {message && <p className={message.kind === "erro" ? "erro" : "suave"} role="status" data-testid="saves-mensagem">{message.text}</p>}
      <h2>{t("saves.list")}</h2>
      {!list ? <p>{t("profile.loading")}</p> : list.length === 0 ? <p className="vazio" data-testid="saves-vazio">{t("saves.empty")}</p> : (
        <div className="tabela-caixa">
          <table className="tabela" data-testid="saves-lista">
            <thead><tr><th>{t("saves.col.save")}</th><th>{t("saves.col.club")}</th><th>{t("saves.col.game")}</th><th>{t("saves.col.saved")}</th><th>{t("saves.col.size")}</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td><span className="chip chip-suave">{t(`saves.kind.${s.kind}` as Key)}</span> {s.name ?? ""}</td>
                  <td>{s.club ?? "—"}</td>
                  <td>{gameDate(s.gameDate)} · {t("saves.season", { n: s.season })}</td>
                  <td>{date(s.createdAt)}</td>
                  <td>{kb(s.bytes)}</td>
                  <td className="acoes">
                    {confirm?.id === s.id ? (
                      <>
                        <span className="suave">{t(confirm.action === "load" ? "saves.confirmLoad" : "saves.confirmDelete")}</span>
                        <button type="button" className={confirm.action === "delete" ? undefined : "primario"} disabled={busy} onClick={() => void (confirm.action === "load" ? loadOne(s.id) : removeOne(s.id))} data-testid="saves-confirmar">{t("saves.yes")}</button>
                        <button type="button" onClick={() => setConfirm(undefined)}>{t("myClub.cancel")}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy} onClick={() => setConfirm({ action: "load", id: s.id })} data-testid="saves-carregar">{t("saves.load")}</button>
                        <button type="button" disabled={busy} onClick={() => void exportOne(s.id)}>{t("saves.export")}</button>
                        <button type="button" disabled={busy} onClick={() => setConfirm({ action: "delete", id: s.id })}>{t("saves.delete")}</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
