/// <reference lib="webworker" />
/**
 * Saves no browser (RZ-134): ficheiros `.raizes` no OPFS, numa pasta própria (fora da do SQLite), mais um `.json`
 * com o resumo de cada um para listar sem abrir. Sem OPFS, guarda em memória (perde-se ao fechar; o gamer pode exportar).
 */
import { MemorySaveStore, type Codec, type SaveMeta, type SaveStore } from "../saves/saves";

const DIR = "raizes-saves";

export const webCodec: Codec = {
  async compress(bytes) {
    return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  },
  async decompress(bytes) {
    return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  },
};

async function write(dir: FileSystemDirectoryHandle, name: string, bytes: Uint8Array): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const h = await file.createSyncAccessHandle();
  try {
    h.truncate(0);
    h.write(bytes, { at: 0 });
    h.flush();
  } finally {
    h.close();
  }
}

async function read(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | undefined> {
  let file: FileSystemFileHandle;
  try { file = await dir.getFileHandle(name); } catch { return undefined; }
  const h = await file.createSyncAccessHandle();
  try {
    const out = new Uint8Array(h.getSize());
    h.read(out, { at: 0 });
    return out;
  } finally {
    h.close();
  }
}

class OpfsSaveStore implements SaveStore {
  constructor(private readonly dir: FileSystemDirectoryHandle) {}
  async list(): Promise<SaveMeta[]> {
    const out: SaveMeta[] = [];
    // `values()` ainda não está nos tipos de DOM desta versão do TypeScript
    const entries = (this.dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
    for await (const e of entries) {
      if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
      const raw = await read(this.dir, e.name);
      if (!raw) continue;
      try { out.push(JSON.parse(new TextDecoder().decode(raw)) as SaveMeta); } catch { /* resumo ilegível: ignora */ }
    }
    return out;
  }
  async put(meta: SaveMeta, bytes: Uint8Array) {
    await write(this.dir, `${meta.id}.raizes`, bytes);
    await write(this.dir, `${meta.id}.json`, new TextEncoder().encode(JSON.stringify(meta)));
  }
  get(id: string) { return read(this.dir, `${id}.raizes`); }
  async remove(id: string) {
    for (const n of [`${id}.raizes`, `${id}.json`]) await this.dir.removeEntry(n).catch(() => undefined);
  }
}

export async function openSaveStore(): Promise<SaveStore> {
  try {
    const root = await self.navigator.storage.getDirectory();
    return new OpfsSaveStore(await root.getDirectoryHandle(DIR, { create: true }));
  } catch {
    return new MemorySaveStore();
  }
}
