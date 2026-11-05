/**
 * Saves (RZ-134): cópias do mundo guardadas à parte, para carregar, exportar e voltar atrás. Cada save é um ficheiro
 * `.raizes` = o SQLite do mundo comprimido (gzip). Quem guarda os bytes é um `SaveStore` (OPFS no browser, memória
 * nos testes); este módulo só decide o que guardar, quando e quantos ficam.
 */
import type { Params } from "../config/parameters";
import { addDays } from "../calendar/dates";
import type { IsoDate } from "../persistence/types";

/** `manual` = o gamer guardou; `auto` = a cada N dias de jogo (rotativos); `season` = no início de cada época; `backup` = cópia de segurança antes de carregar ou recomeçar. */
export type SaveKind = "manual" | "auto" | "season" | "backup";

export type SaveMeta = {
  id: string;
  kind: SaveKind;
  /** Nome dado pelo gamer (só nos manuais) ou escrito pelo jogo. */
  name?: string;
  /** Quando se guardou (relógio real, ISO). */
  createdAt: string;
  /** Clube do gamer e dia do jogo no momento. */
  club?: string;
  gameDate: IsoDate;
  season: number;
  /** Tamanho do ficheiro comprimido. */
  bytes: number;
};

export interface SaveStore {
  list(): Promise<SaveMeta[]>;
  put(meta: SaveMeta, bytes: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | undefined>;
  remove(id: string): Promise<void>;
}

/** Store em memória: testes e fallback quando o browser não tem OPFS. */
export class MemorySaveStore implements SaveStore {
  private readonly items = new Map<string, { meta: SaveMeta; bytes: Uint8Array }>();
  async list() { return [...this.items.values()].map((x) => x.meta); }
  async put(meta: SaveMeta, bytes: Uint8Array) { this.items.set(meta.id, { meta, bytes }); }
  async get(id: string) { return this.items.get(id)?.bytes; }
  async remove(id: string) { this.items.delete(id); }
}

/** Compressão (gzip) injetada por quem corre o motor: o motor puro não depende de APIs do browser nem do Node. */
export interface Codec {
  compress(bytes: Uint8Array): Promise<Uint8Array>;
  decompress(bytes: Uint8Array): Promise<Uint8Array>;
}

const MAGIC = [..."SQLite format 3"].map((c) => c.charCodeAt(0));

/** Lê um ficheiro `.raizes` (ou um `.sqlite` simples) e devolve o SQLite; lança erro se não parecer um save. */
export async function readSaveFile(file: Uint8Array, codec: Codec): Promise<Uint8Array> {
  let bytes = file;
  if (file[0] === 0x1f && file[1] === 0x8b) {
    try { bytes = await codec.decompress(file); } catch { throw new Error("Ficheiro de save danificado"); }
  }
  if (!MAGIC.every((c, i) => bytes[i] === c)) throw new Error("Este ficheiro não é um save do Raízes");
  return bytes;
}

export type SaveContext = {
  store: SaveStore;
  codec: Codec;
  /** SQLite do mundo atual. */
  exportCurrent(): Promise<Uint8Array>;
  /** Estado do mundo (para o resumo): `club` já com o nome. */
  state(): { club?: string; gameDate: IsoDate; season: number; seed?: string };
  now(): Date;
};

const newId = (now: Date, rand = Math.random) => `${now.getTime().toString(36)}${Math.floor(rand() * 1296).toString(36).padStart(2, "0")}`;

/** Guarda uma cópia do mundo atual. */
export async function createSave(ctx: SaveContext, kind: SaveKind, name?: string): Promise<SaveMeta> {
  const bytes = await ctx.codec.compress(await ctx.exportCurrent());
  const s = ctx.state();
  const meta: SaveMeta = { id: newId(ctx.now()), kind, ...(name ? { name } : {}), createdAt: ctx.now().toISOString(), ...(s.club ? { club: s.club } : {}), gameDate: s.gameDate, season: s.season, bytes: bytes.byteLength };
  await ctx.store.put(meta, bytes);
  return meta;
}

/** Os saves mais recentes primeiro. */
export async function listSaves(store: SaveStore): Promise<SaveMeta[]> {
  return (await store.list()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** Quantos de cada tipo automático se guardam. */
const KEEP_BACKUPS = 2;

/** Apaga os automáticos, de época e cópias de segurança a mais (os manuais nunca se apagam sozinhos). */
export async function prune(store: SaveStore, params: Params): Promise<void> {
  const all = await listSaves(store);
  const limits: [SaveKind, number][] = [["auto", params.saves.rotatingAutosaves], ["season", params.saves.keepSeasonSaves], ["backup", KEEP_BACKUPS]];
  for (const [kind, keep] of limits) for (const old of all.filter((x) => x.kind === kind).slice(keep)) await store.remove(old.id);
}

export type AutosaveState = { lastAuto?: IsoDate; lastSeason?: number };

/**
 * Chamado depois de o tempo avançar: guarda um automático se passaram `daysAutosave` dias de jogo desde o último e um de
 * época se mudou a época (desde que a opção esteja ligada). Devolve o que guardou e o estado novo.
 */
export async function autosaveIfDue(ctx: SaveContext, params: Params, prev: AutosaveState): Promise<{ saved: SaveMeta[]; state: AutosaveState }> {
  const s = ctx.state();
  const saved: SaveMeta[] = [];
  const state = { ...prev };
  if (params.saves.saveAtSeasonStart && state.lastSeason !== undefined && s.season > state.lastSeason) {
    saved.push(await createSave(ctx, "season", `Início da época ${s.season}`));
    state.lastAuto = s.gameDate;
  } else if (state.lastAuto === undefined || s.gameDate >= addDays(state.lastAuto, params.saves.daysAutosave)) {
    // o primeiro avanço só marca o ponto de partida
    if (state.lastAuto !== undefined) saved.push(await createSave(ctx, "auto"));
    state.lastAuto = s.gameDate;
  }
  state.lastSeason = s.season;
  if (saved.length > 0) await prune(ctx.store, params);
  return { saved, state };
}
