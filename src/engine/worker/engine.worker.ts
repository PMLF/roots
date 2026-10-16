/// <reference lib="webworker" />
import { handle, type Servicos } from "../api/handler";
import type { Message, EngineResponse } from "../api/contracts";
import { SqliteRepository } from "../persistence/repositorySqlite";
import { openWasm, publicUrl } from "./driverWasm";

// Casca fina: recebe pedidos da interface, chama o motor e responde. Toda a lógica está em ../api e no resto do motor.
const ctx = self as unknown as DedicatedWorkerGlobalScope;

let isOpen: ReturnType<Servicos["openRepository"]> | undefined;
const urlData = (f: string) => publicUrl(`data/${f}`);
const fetchText = async (f: string) => {
  const r = await fetch(urlData(f));
  if (!r.ok) throw new Error(`Não consegui carregar ${f} (${r.status})`);
  return r.text();
};

const servicos: Servicos = {
  async loadData() {
    const [clubs, cities, localities, rivalries, districts, countries] = await Promise.all(["clubs", "cities", "localities", "rivalries", "districts", "countries"].map((n) => fetchText(`${n}.csv`)));
    return { clubs: clubs as string, cities: cities as string, localities: localities as string, rivalries: rivalries as string, districts: districts as string, countries: countries as string };
  },
  // Abre a base uma só vez por worker. O save "ativo" por omissão chama-se "atual" (ranhuras: RZ-134).
  openRepository() {
    isOpen ??= openWasm("current").then((b) => ({
      repository: new SqliteRepository(b.driver),
      backend: b.backend,
      sqliteVersion: b.sqliteVersion,
      ...(b.memoryReason !== undefined ? { memoryReason: b.memoryReason } : {}),
    }));
    return isOpen;
  },
};

ctx.onmessage = async (ev: MessageEvent<Message>) => {
  const m = ev.data;
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
