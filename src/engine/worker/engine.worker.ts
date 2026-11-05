/// <reference lib="webworker" />
import { handle, type Servicos } from "../api/handler";
import type { Message, EngineResponse } from "../api/contracts";
import { SqliteRepository } from "../persistence/repositorySqlite";
import { openWasm, publicUrl } from "./driverWasm";
import { openSaveStore, webCodec } from "./saveStore";
import type { SaveStore } from "../saves/saves";

// Casca fina: recebe pedidos da interface, chama o motor e responde. Toda a lógica está em ../api e no resto do motor.
const ctx = self as unknown as DedicatedWorkerGlobalScope;

let isOpen: ReturnType<Servicos["openRepository"]> | undefined;
const urlData = (f: string) => publicUrl(`data/${f}`);
const fetchText = async (f: string) => {
  const r = await fetch(urlData(f));
  if (!r.ok) throw new Error(`Não consegui carregar ${f} (${r.status})`);
  return r.text();
};

const storeOpening = openSaveStore();
let storeReady: SaveStore | undefined;

const open = (bytes?: Uint8Array) =>
  openWasm("current", bytes ? { bytes } : {}).then((b) => ({
    repository: new SqliteRepository(b.driver),
    backend: b.backend,
    sqliteVersion: b.sqliteVersion,
    ...(b.memoryReason !== undefined ? { memoryReason: b.memoryReason } : {}),
  }));

const servicos: Servicos = {
  codec: webCodec,
  get saves() {
    return storeReady;
  },
  async exportCurrent() {
    const { repository } = await servicos.openRepository();
    return (repository as SqliteRepository).exportSqlite();
  },
  async replaceCurrent(bytes) {
    // valida primeiro numa base em memória: um ficheiro estragado não pode substituir o mundo
    const check = await openWasm("verificacao", { bytes, memoryOnly: true });
    try {
      if (check.driver.all("SELECT value FROM meta WHERE key = 'seed'").length === 0) throw new Error("Este ficheiro não tem um mundo do Raízes");
    } finally {
      check.driver.close();
    }
    const current = await servicos.openRepository();
    (current.repository as SqliteRepository).close();
    isOpen = open(bytes);
    await isOpen;
  },
  async loadData() {
    const [clubs, cities, localities, rivalries, districts, countries] = await Promise.all(["clubs", "cities", "localities", "rivalries", "districts", "countries"].map((n) => fetchText(`${n}.csv`)));
    return { clubs: clubs as string, cities: cities as string, localities: localities as string, rivalries: rivalries as string, districts: districts as string, countries: countries as string };
  },
  // Abre a base uma só vez por worker. O save "ativo" chama-se "current"; os outros saves são cópias (`saves/`).
  openRepository() {
    // um erro (ex.: outro separador com o jogo aberto) não pode ficar em cache: tenta de novo no pedido seguinte
    isOpen ??= open().catch((e) => { isOpen = undefined; throw e; });
    return isOpen;
  },
};

ctx.onmessage = async (ev: MessageEvent<Message>) => {
  const m = ev.data;
  storeReady ??= await storeOpening;
  let response: EngineResponse;
  let last = 0;
  try {
    // o progresso vai-se emitindo (no máximo ~10 por segundo) enquanto o pedido corre
    const progress = (p: { phase: string; done: number; total: number }) => {
      const now = Date.now();
      if (now - last < 100 && p.done < p.total) return;
      last = now;
      ctx.postMessage({ id: m.id, progress: p } satisfies EngineResponse);
    };
    response = { id: m.id, ok: true, output: await handle(m, servicos, progress) };
  } catch (e) {
    response = { id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  ctx.postMessage(response);
};
