/**
 * Save num ficheiro local (RZ-501). Chrome/Edge: File System Access API, gravando sempre no mesmo ficheiro (a referência fica no
 * IndexedDB); Safari/Firefox: descarrega o ficheiro com o nome dado. Tudo é conveniência por pessoa e nunca entra no save.
 */
import { markExported } from "@/ui/backupReminder";
import { read, save } from "@/ui/storage";

const DB = "raizes.localFile";
const STORE = "handles";
const KEY = "current";

type FilePicker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;
const picker = (): FilePicker | undefined => (typeof window !== "undefined" ? (window as unknown as { showSaveFilePicker?: FilePicker }).showSaveFilePicker : undefined);

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const idb = async <T,>(mode: IDBTransactionMode, job: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> => {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => { const r = job(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  } catch { return undefined; }
};

export const canWriteInPlace = (): boolean => picker() !== undefined;

function download(filename: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const LAST_GAME_DATE = "raizes.localFile.gameDate";
const isString = (v: unknown): v is string => typeof v === "string";
/** Dia de jogo do último save gravado em ficheiro/descarregado: serve ao aviso de «tens progresso por guardar» ao sair. */
export const lastFileGameDate = (): string | undefined => read(LAST_GAME_DATE, isString);
export const rememberFileGameDate = (day: string): void => save(LAST_GAME_DATE, day);

/** Pede ao gamer o ficheiro onde guardar (precisa de um clique; por isso faz-se antes de criar o mundo). Devolve se ficou escolhido. */
export async function chooseFile(suggestedName: string): Promise<boolean> {
  const pick = picker();
  if (!pick) return false;
  try {
    const handle = await pick({ suggestedName, types: [{ description: "Raízes", accept: { "application/octet-stream": [".raizes"] } }] });
    await idb("readwrite", (s) => s.put(handle, KEY));
    return true;
  } catch { return false; }
}

/** Grava os bytes no ficheiro local. Devolve `"file"` (ficheiro fixo), `"download"` ou `"cancelled"`. */
export async function saveToDisk(filename: string, bytes: Uint8Array): Promise<"file" | "download" | "cancelled"> {
  const pick = picker();
  if (!pick) { download(filename, bytes); markExported(); return "download"; }
  try {
    let handle = await idb<FileSystemFileHandle>("readonly", (s) => s.get(KEY) as IDBRequest<FileSystemFileHandle>);
    // sem permissão ou sem ficheiro escolhido: pergunta onde guardar (uma vez)
    const hasAccess = async (h: FileSystemFileHandle) => (await (h as unknown as { requestPermission(o: { mode: "readwrite" }): Promise<PermissionState> }).requestPermission({ mode: "readwrite" })) === "granted";
    if (!handle || !(await hasAccess(handle))) {
      handle = await pick({ suggestedName: filename, types: [{ description: "Raízes", accept: { "application/octet-stream": [".raizes"] } }] });
      await idb("readwrite", (s) => s.put(handle as FileSystemFileHandle, KEY));
    }
    const w = await handle.createWritable();
    await w.write(bytes as BlobPart);
    await w.close();
    markExported();
    return "file";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    download(filename, bytes); markExported();
    return "download";
  }
}

/** Esquece o ficheiro fixo (para escolher outro na próxima gravação). */
export async function forgetFile(): Promise<void> { await idb("readwrite", (s) => s.delete(KEY)); }
