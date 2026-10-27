"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogClub, CreatedWorldSummary, WorldProgress } from "@/engine/api/contracts";
import type { Tier } from "@/engine/config/parameters";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { Icon, type IconName } from "@/ui/components/Icon";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";
import { enterGame, rememberOpened } from "@/ui/session";

const TIERS: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
const LEVELS = ["worldClass", "continental", "national", "regional", "local", "obscure"] as const;
const RESULTS_MAX = 60;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Semente nova para cada save: cada save é um mundo único. */
const newSeed = () => {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(7, "0")).join("").slice(0, 10);
};

const CARDS: { key: string; icon: IconName }[] = [
  { key: "city", icon: "city" },
  { key: "talent", icon: "search" },
  { key: "council", icon: "club" },
  { key: "legends", icon: "star" },
  { key: "prize", icon: "competitions" },
  { key: "calendar", icon: "matches" },
];
/** O ciclo que faz clube e cidade crescerem juntos. */
const CYCLE: { key: string; icon: IconName }[] = [
  { key: "results", icon: "matches" },
  { key: "fans", icon: "squad" },
  { key: "city", icon: "city" },
  { key: "club", icon: "growth" },
];

/** Assistente de nova save (RZ-138): como funciona → a pirâmide → escolher o clube; no fim cria o mundo e vai ao Início. */
export function Onboarding() {
  const { t } = useT();
  const engine = useEngine();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [catalog, setCatalog] = useState<CatalogClub[] | undefined>(undefined);
  const [existing, setExisting] = useState<CreatedWorldSummary | null | undefined>(undefined);
  const [startChoice, setStartChoice] = useState<Start | undefined>(undefined);
  const [state, setState] = useState<{ phase: "idle" } | { phase: "creating"; progress?: WorldProgress } | { phase: "error"; error: string }>({ phase: "idle" });

  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("clubCatalog", null).then((c) => live && setCatalog(c)).catch((e) => live && setState({ phase: "error", error: String(e) }));
    engine.call("worldState", null).then((w) => live && setExisting(w)).catch(() => live && setExisting(null));
    return () => { live = false; };
  }, [engine]);

  const start = async () => {
    if (!engine || !startChoice) return;
    setState({ phase: "creating" });
    try {
      const seed = newSeed();
      // recomeçar apaga o mundo atual: fica antes uma cópia nos saves (se não for possível guardar, segue)
      if (existing) await engine.call("saveGame", { name: t("new.backupName") }).catch(() => undefined);
      await engine.call(existing ? "restartWorld" : "createWorld", { seed }, (progress) => setState({ phase: "creating", progress }));
      if (startChoice.kind === "club") await engine.call("chooseClub", { id: startChoice.club.id, force: true });
      else await engine.call("startUnemployed", { region: startChoice.region });
      window.dispatchEvent(new Event("raizes:mundo"));
      window.dispatchEvent(new Event("raizes:meuClube"));
      window.dispatchEvent(new Event("raizes:tempo"));
      enterGame();
      rememberOpened({ kind: "current" });
      router.push("/");
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const phaseText = (phase: string) => ({ clubs: t("world.phase.clubs"), cities: t("world.phase.cities"), others: t("world.phase.others"), free: t("world.phase.free"), validate: t("world.phase.validate"), save: t("world.phase.save") })[phase] ?? t("world.creating");
  const creating = state.phase === "creating";

  return (
    <section className="novo-jogo" data-testid="novo-jogo">
      <header className="novo-topo">
        <h1>{t("app.name")}</h1>
        <ol className="novo-passos" aria-label={t("new.steps")}>
          {[1, 2, 3].map((n) => (
            <li key={n} aria-current={n === step ? "step" : undefined} className={n < step ? "feito" : undefined}>{t(`new.step.${n}` as Key)}</li>
          ))}
        </ol>
      </header>

      {step === 1 && (
        <>
          <div className="novo-heroi" data-testid="novo-objetivo">
            <div>
              <h2>{t("new.how.goal.title")}</h2>
              <p>{t("new.how.goal.text")}</p>
            </div>
            <GrowthArt />
          </div>
          <ol className="novo-ciclo" aria-label={t("new.how.cycle.label")}>
            {CYCLE.map((c) => (
              <li key={c.key}>
                <Icon name={c.icon} />
                <span>{t(`new.how.cycle.${c.key}` as Key)}</span>
              </li>
            ))}
          </ol>
          <h2>{t("new.how.title")}</h2>
          <ul className="novo-cartoes">
            {CARDS.map((c) => (
              <li key={c.key} className="cartao">
                <Icon name={c.icon} />
                <h3>{t(`new.how.${c.key}.title` as Key)}</h3>
                <p>{t(`new.how.${c.key}.text` as Key)}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 2 && <Pyramid catalog={catalog} />}
      {step === 3 && <ChooseClub catalog={catalog} start={startChoice} onStart={setStartChoice} disabled={creating} />}

      {state.phase === "error" && <p className="erro" data-testid="novo-erro">{t("world.error", { error: state.error })}</p>}
      {creating && (
        <p data-testid="novo-progresso">
          {state.progress ? phaseText(state.progress.phase) : t("world.creating")} <progress max={state.progress?.total ?? 1} value={state.progress?.done ?? 0} />
        </p>
      )}

      <footer className="novo-rodape">
        {step > 1 && <button type="button" onClick={() => setStep(step - 1)} disabled={creating}>{t("new.back")}</button>}
        {step < 3 ? (
          <button type="button" className="primario" onClick={() => setStep(step + 1)} data-testid="novo-seguinte">{t("new.next")}</button>
        ) : (
          <button type="button" className="primario" disabled={!startChoice || creating} onClick={() => void start()} data-testid="novo-comecar">
            {startChoice?.kind === "club" ? t("new.start", { club: startChoice.club.name }) : startChoice ? t("new.startUnemployed") : t("new.startNone")}
          </button>
        )}
      </footer>
    </section>
  );
}

/** Raízes a crescer por baixo da cidade e do clube (decorativo). */
function GrowthArt() {
  return (
    <svg className="novo-arte" viewBox="0 0 360 200" role="img" aria-hidden="true" focusable="false">
      <g className="arte-cidade">
        <path d="M30 120V80l22-10v50M52 120V56l26 12v52M78 120V90l20 8v22M20 120h92" />
      </g>
      <g className="arte-clube">
        <path d="M270 40l-40 16v34c0 26 17 44 40 56 23-12 40-30 40-56V56z" />
        <path d="M270 62v62M246 86h48" />
      </g>
      <g className="arte-raizes">
        <path d="M66 120c0 20 14 30 40 36s64 4 84 22M96 120c0 18 20 26 44 30M270 146c0 14-14 22-40 28-24 6-44 4-56 18M270 146c0 10 10 16 26 20M190 178v16M150 150v14" />
      </g>
      <g className="arte-brotos">
        <path d="M196 120v-20M196 108c0-9 7-15 16-15 0 9-7 15-16 15zM196 114c0-8-6-13-14-13 0 8 6 13 14 13z" />
      </g>
    </svg>
  );
}

/** A pirâmide dos escalões com o número de clubes de cada um e as setas de subida e descida. */
function Pyramid({ catalog }: { catalog: CatalogClub[] | undefined }) {
  const { t } = useT();
  const count = (tier: Tier) => catalog?.filter((c) => c.tier === tier).length ?? 0;
  return (
    <>
      <h2>{t("new.pyramid.title")}</h2>
      <p>{t("new.pyramid.intro")}</p>
      <ol className="piramide" data-testid="novo-piramide">
        {TIERS.map((tier, i) => (
          <li key={tier} style={{ width: `${46 + i * 13.5}%` }}>
            <strong>{t(`tier.${tier}` as Key)}</strong>
            <span className="suave">{t("new.pyramid.clubs", { n: count(tier) })}</span>
          </li>
        ))}
      </ol>
      <p className="piramide-setas suave"><span aria-hidden="true">▲</span> {t("new.pyramid.up")} · <span aria-hidden="true">▼</span> {t("new.pyramid.down")}</p>
      <p>{t("new.pyramid.note")}</p>
    </>
  );
}

type Filters = { text: string; league: string; region: string; district: string; status: string; level: string; basin: string; finances: string; difficulty: string; stadium: boolean };
const NO_FILTERS: Filters = { text: "", league: "", region: "", district: "", status: "", level: "", basin: "", finances: "", difficulty: "", stadium: false };

/** Como começa o jogo: com um clube ou sem clube (e então a região onde vives dá as primeiras ofertas). */
export type Start = { kind: "club"; club: CatalogClub } | { kind: "unemployed"; region: string };

const pickOne = <T,>(list: T[]): T | undefined => {
  if (list.length === 0) return undefined;
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return list[b[0]! % list.length];
};

/** Escolha do arranque (RZ-501): clube (por liga, região, cidade ou ao acaso) ou sem clube; ficha do clube e da cidade ao lado. */
function ChooseClub({ catalog, start, onStart, disabled }: { catalog: CatalogClub[] | undefined; start: Start | undefined; onStart: (s: Start | undefined) => void; disabled: boolean }) {
  const { t, locale } = useT();
  const [mode, setMode] = useState<"club" | "unemployed">(start?.kind ?? "club");
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [random, setRandom] = useState(false);
  const chosen = start?.kind === "club" ? start.club : undefined;
  const set = (k: keyof Filters, v: string | boolean) => { setRandom(false); setF((old) => ({ ...old, [k]: v })); };
  const regions = useMemo(() => [...new Set((catalog ?? []).map((c) => c.region))].sort((a, b) => a.localeCompare(b, "pt")), [catalog]);
  const districts = useMemo(() => [...new Map((catalog ?? []).map((c) => [c.district.id, c.district.name] as const)).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt")), [catalog]);
  const leagues = useMemo(() => {
    const all = [...new Map((catalog ?? []).map((c) => [c.league, c.tier] as const)).entries()];
    const group = (tier: Tier[]) => all.filter(([, x]) => tier.includes(x)).map(([l]) => l).sort((a, b) => a.localeCompare(b, "pt"));
    return { national: group(["firstLeague", "secondLeague", "thirdLeague"]), cp: group(["cp"]), district: group(["district"]) };
  }, [catalog]);
  const matches = useCallback((c: CatalogClub, g: Filters) => {
    const q = norm(g.text.trim());
    return (!q || norm(c.name).includes(q) || norm(c.locality.name).includes(q) || norm(c.city).includes(q)) &&
      (!g.league || c.league === g.league) && (!g.region || c.region === g.region) && (!g.district || c.district.id === g.district) && (!g.status || c.locality.status === g.status) &&
      (!g.level || c.levelReputation === g.level) && (!g.basin || String(c.basin) === g.basin) && (!g.finances || String(c.finances) === g.finances) &&
      (!g.difficulty || c.difficulty === g.difficulty) && (!g.stadium || c.ownStadium);
  }, []);
  const visible = useMemo(() => (catalog ?? []).filter((c) => matches(c, f)), [catalog, f, matches]);
  const shown = useMemo(() => (chosen && !visible.some((c) => c.id === chosen.id) ? [chosen, ...visible] : visible), [chosen, visible]);
  const choose = (c: CatalogClub, byRandom = false) => { setRandom(byRandom); onStart({ kind: "club", club: c }); };
  /** O sorteio escolhe de um conjunto e deixa o clube selecionado (não escolhido), bem à vista na lista. */
  const draw = (pool: CatalogClub[]) => { const c = pickOne(pool); if (c) choose(c, true); };
  const sel = (k: keyof Filters, label: Key, options: [string, string][]) => (
    <label>
      <span>{t(label)}</span>
      <select value={String(f[k])} onChange={(e) => set(k, e.target.value)} disabled={disabled}>
        <option value="">{t("new.filter.any")}</option>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
  const region = start?.kind === "unemployed" ? start.region : "";
  const regionClubs = (catalog ?? []).filter((c) => c.region === region);
  return (
    <>
      <h2>{t("new.choose.title")}</h2>
      <div className="novo-modo" role="tablist" aria-label={t("new.mode.label")}>
        <button type="button" role="tab" aria-selected={mode === "club"} className={mode === "club" ? "ativo" : undefined} disabled={disabled} onClick={() => { setMode("club"); onStart(undefined); }} data-testid="novo-modo-clube">{t("new.mode.club")}</button>
        <button type="button" role="tab" aria-selected={mode === "unemployed"} className={mode === "unemployed" ? "ativo" : undefined} disabled={disabled} onClick={() => { setMode("unemployed"); onStart(undefined); }} data-testid="novo-modo-desempregado">{t("new.mode.unemployed")}</button>
      </div>
      <p>{t(mode === "club" ? "new.choose.intro" : "new.unemployed.intro")}</p>
      <div className="novo-escolha">
        {mode === "club" ? (
          <div>
            <div className="novo-filtros">
              <label className="novo-pesquisa">
                <span>{t("new.filter.text")}</span>
                <input type="search" value={f.text} onChange={(e) => set("text", e.target.value)} placeholder={t("new.filter.textHint")} disabled={disabled} data-testid="novo-pesquisa" />
              </label>
              <label>
                <span>{t("new.filter.league")}</span>
                <select value={f.league} onChange={(e) => set("league", e.target.value)} disabled={disabled} data-testid="novo-liga">
                  <option value="">{t("new.filter.any")}</option>
                  <optgroup label={t("new.league.national")}>{leagues.national.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
                  <optgroup label={t("tier.cp")}>{leagues.cp.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
                  <optgroup label={t("tier.district")}>{leagues.district.map((l) => <option key={l} value={l}>{l}</option>)}</optgroup>
                </select>
              </label>
              {sel("region", "new.filter.region", regions.map((r) => [r, r]))}
              {sel("district", "new.filter.district", districts)}
            </div>
            <details className="novo-mais">
              <summary>{t("new.filter.more")}</summary>
              <div className="novo-filtros">
                {sel("difficulty", "new.filter.difficulty", (["underdog", "balanced", "big"] as const).map((d) => [d, t(`new.difficulty.${d}` as Key)]))}
                {sel("status", "new.filter.status", (["village", "town", "city"] as const).map((x) => [x, t(`status.${x}` as Key)]))}
                {sel("level", "new.filter.reputation", LEVELS.map((x) => [x, t(`reputation.level.${x}` as Key)]))}
                {sel("basin", "new.filter.basin", ["1", "2", "3"].map((x) => [x, t(`new.basin.${x}` as Key)]))}
                {sel("finances", "new.filter.finances", ["1", "2", "3"].map((x) => [x, t(`new.finances.${x}` as Key)]))}
                <label className="novo-check"><input type="checkbox" checked={f.stadium} onChange={(e) => set("stadium", e.target.checked)} disabled={disabled} /> {t("new.filter.stadium")}</label>
              </div>
            </details>
            <div className="novo-aleatorio" data-testid="novo-aleatorio">
              <b>{t("new.random.title")}</b>
              <div className="novo-aleatorio-botoes">
                <button type="button" disabled={disabled || !catalog} onClick={() => { setF(NO_FILTERS); draw(catalog ?? []); }} data-testid="novo-aleatorio-todas">{t("new.random.any")}</button>
                <button type="button" disabled={disabled || !f.league} onClick={() => draw(visible.filter((c) => c.league === f.league))} data-testid="novo-aleatorio-liga">{t("new.random.league")}</button>
                <button type="button" disabled={disabled || visible.length === 0} onClick={() => draw(visible)} data-testid="novo-aleatorio-lista">{t("new.random.list")}</button>
              </div>
              <div className="novo-aleatorio-escaloes">
                {TIERS.map((x) => (
                  <label key={x}><input type="checkbox" checked={tiers.includes(x)} disabled={disabled} onChange={(e) => setTiers((old) => (e.target.checked ? [...old, x] : old.filter((y) => y !== x)))} /> {t(`tier.${x}` as Key)}</label>
                ))}
                <button type="button" disabled={disabled || tiers.length === 0} onClick={() => { setF(NO_FILTERS); draw((catalog ?? []).filter((c) => tiers.includes(c.tier))); }} data-testid="novo-aleatorio-escaloes">{t("new.random.tiers")}</button>
              </div>
            </div>
            {!catalog ? <p>{t("profile.loading")}</p> : (
              <>
                <p className="suave" aria-live="polite">{visible.length > RESULTS_MAX ? t("new.results.more", { shown: RESULTS_MAX, total: visible.length }) : t("new.results", { n: visible.length })}</p>
                <ul className="novo-lista" data-testid="novo-lista">
                  {shown.slice(0, RESULTS_MAX + 1).map((c) => (
                    <li key={c.id}>
                      <button type="button" className={c.id === chosen?.id ? "ativo" : undefined} aria-pressed={c.id === chosen?.id} onClick={() => choose(c)} disabled={disabled} ref={(el) => { if (el && c.id === chosen?.id && random) el.scrollIntoView({ block: "nearest" }); }}>
                        <ClubSwatch colours={c.colours} /> <b>{c.name}</b> <span className="suave">{c.league} · {c.locality.name}</span>
                        <span className={`chip novo-dif-${c.difficulty}`}>{t(`new.difficulty.${c.difficulty}` as Key)}</span>
                      </button>
                    </li>
                  ))}
                  {visible.length === 0 && <li className="vazio">{t("myClub.noResults")}</li>}
                </ul>
              </>
            )}
          </div>
        ) : (
          <div>
            <label className="novo-regiao">
              <span>{t("new.unemployed.region")}</span>
              <select value={region} onChange={(e) => onStart(e.target.value ? { kind: "unemployed", region: e.target.value } : undefined)} disabled={disabled || !catalog} data-testid="novo-regiao">
                <option value="">{t("new.unemployed.pick")}</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
        )}
        <aside className="cartao novo-ficha" aria-live="polite" data-testid="novo-ficha">
          {mode === "club" ? (
            chosen ? <Summary club={chosen} random={random} locale={locale} /> : <p className="vazio">{t("new.choose.pick")}</p>
          ) : region ? (
            <>
              <h3>{region}</h3>
              <p className="suave">{t("new.unemployed.card", { n: regionClubs.length })}</p>
              <p>{t("new.unemployed.how")}</p>
            </>
          ) : <p className="vazio">{t("new.unemployed.cardEmpty")}</p>}
        </aside>
      </div>
    </>
  );
}

function Summary({ club, random, locale }: { club: CatalogClub; random: boolean; locale: string }) {
  const { t } = useT();
  const n = new Intl.NumberFormat(locale);
  const rows: [Key, string][] = [
    ["new.sum.league", club.league],
    ["new.sum.place", `${club.locality.name} (${t(`status.${club.locality.status}` as Key)})`],
    ["new.sum.district", club.district.name],
    ["new.sum.reputation", t(`reputation.level.${club.levelReputation}` as Key)],
    ["new.sum.basin", t(`new.basin.${club.basin}` as Key)],
    ["new.sum.finances", t(`new.finances.${club.finances}` as Key)],
    ["new.sum.stadium", `${n.format(club.stadiumCapacity)} · ${t(club.ownStadium ? "new.stadium.own" : "new.stadium.municipal")}`],
    ...(club.rival ? [["new.sum.rival", club.rival.name] as [Key, string]] : []),
  ];
  const city: [Key, string][] = [
    ["new.city.name", club.city],
    ["new.city.region", club.region],
    ["new.city.population", n.format(club.cityInfo.population)],
    ["new.city.sector", t(`sector.${club.cityInfo.sector}` as Key)],
  ];
  return (
    <>
      <h3><ClubSwatch colours={club.colours} /> {club.name}</h3>
      <p>
        <span className={`chip novo-dif-${club.difficulty}`}>{t(`new.difficulty.${club.difficulty}` as Key)}</span>
        {random && <span className="chip chip-suave" data-testid="novo-sorteado"> {t("new.random.drawn")}</span>}
      </p>
      <p className="suave">{t(`new.difficulty.${club.difficulty}.hint` as Key)}</p>
      <dl className="novo-dados">
        {rows.map(([k, v]) => (<div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>))}
      </dl>
      <h4>{t("new.city.title")}</h4>
      <dl className="novo-dados">
        {city.map(([k, v]) => (<div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>))}
      </dl>
    </>
  );
}
