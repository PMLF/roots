"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CatalogClub, CreatedWorldSummary, WorldProgress } from "@/engine/api/contracts";
import type { Tier } from "@/engine/config/parameters";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { Icon, type IconName } from "@/ui/components/Icon";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";

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
  { key: "prize", icon: "competitions" },
  { key: "calendar", icon: "matches" },
];

/** Assistente de nova save (RZ-138): como funciona → a pirâmide → escolher o clube; no fim cria o mundo e vai ao Início. */
export function Onboarding() {
  const { t } = useT();
  const engine = useEngine();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [catalog, setCatalog] = useState<CatalogClub[] | undefined>(undefined);
  const [existing, setExisting] = useState<CreatedWorldSummary | null | undefined>(undefined);
  const [chosen, setChosen] = useState<CatalogClub | undefined>(undefined);
  const [state, setState] = useState<{ phase: "idle" } | { phase: "creating"; progress?: WorldProgress } | { phase: "error"; error: string }>({ phase: "idle" });

  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("clubCatalog", null).then((c) => live && setCatalog(c)).catch((e) => live && setState({ phase: "error", error: String(e) }));
    engine.call("worldState", null).then((w) => live && setExisting(w)).catch(() => live && setExisting(null));
    return () => { live = false; };
  }, [engine]);

  const start = async () => {
    if (!engine || !chosen) return;
    setState({ phase: "creating" });
    try {
      const seed = newSeed();
      // recomeçar apaga o mundo atual: fica antes uma cópia nos saves (se não for possível guardar, segue)
      if (existing) await engine.call("saveGame", { name: t("new.backupName") }).catch(() => undefined);
      await engine.call(existing ? "restartWorld" : "createWorld", { seed }, (progress) => setState({ phase: "creating", progress }));
      await engine.call("chooseClub", { id: chosen.id, force: true });
      window.dispatchEvent(new Event("raizes:mundo"));
      window.dispatchEvent(new Event("raizes:meuClube"));
      window.dispatchEvent(new Event("raizes:tempo"));
      router.push("/");
    } catch (e) {
      setState({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  const phaseText = (phase: string) => ({ clubs: t("world.phase.clubs"), cities: t("world.phase.cities"), others: t("world.phase.others"), free: t("world.phase.free"), validate: t("world.phase.validate"), save: t("world.phase.save") })[phase] ?? t("world.creating");
  const creating = state.phase === "creating";
  const [replace, setReplace] = useState(false);

  if (existing && !replace && step === 1)
    return (
      <section className="novo-jogo" data-testid="novo-existente">
        <h1>{t("new.existing.title")}</h1>
        <p>{t("new.existing.text")}</p>
        <p className="acoes">
          <button type="button" className="primario" onClick={() => router.push("/")}>{t("new.existing.back")}</button>
          <button type="button" onClick={() => setReplace(true)} data-testid="novo-substituir">{t("new.existing.replace")}</button>
          <button type="button" onClick={() => router.push("/saves/")}>{t("new.existing.saves")}</button>
        </p>
      </section>
    );

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
      {step === 3 && <ChooseClub catalog={catalog} chosen={chosen} onChoose={setChosen} disabled={creating} />}

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
          <button type="button" className="primario" disabled={!chosen || creating} onClick={() => void start()} data-testid="novo-comecar">
            {chosen ? t("new.start", { club: chosen.name }) : t("new.startNone")}
          </button>
        )}
      </footer>
    </section>
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

type Filters = { text: string; tier: string; district: string; status: string; level: string; basin: string; finances: string; difficulty: string; stadium: boolean };
const NO_FILTERS: Filters = { text: "", tier: "", district: "", status: "", level: "", basin: "", finances: "", difficulty: "", stadium: false };

/** Lista com filtros e ficha-resumo do clube escolhido. */
function ChooseClub({ catalog, chosen, onChoose, disabled }: { catalog: CatalogClub[] | undefined; chosen: CatalogClub | undefined; onChoose: (c: CatalogClub) => void; disabled: boolean }) {
  const { t } = useT();
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const set = (k: keyof Filters, v: string | boolean) => setF((old) => ({ ...old, [k]: v }));
  const districts = useMemo(() => [...new Map((catalog ?? []).map((c) => [c.district.id, c.district.name] as const)).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt")), [catalog]);
  const visible = useMemo(() => {
    const q = norm(f.text.trim());
    return (catalog ?? []).filter((c) =>
      (!q || norm(c.name).includes(q) || norm(c.locality.name).includes(q) || norm(c.city).includes(q)) &&
      (!f.tier || c.tier === f.tier) && (!f.district || c.district.id === f.district) && (!f.status || c.locality.status === f.status) &&
      (!f.level || c.levelReputation === f.level) && (!f.basin || String(c.basin) === f.basin) && (!f.finances || String(c.finances) === f.finances) &&
      (!f.difficulty || c.difficulty === f.difficulty) && (!f.stadium || c.ownStadium));
  }, [catalog, f]);
  const sel = (k: keyof Filters, label: Key, options: [string, string][]) => (
    <label>
      <span>{t(label)}</span>
      <select value={String(f[k])} onChange={(e) => set(k, e.target.value)} disabled={disabled}>
        <option value="">{t("new.filter.any")}</option>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
  return (
    <>
      <h2>{t("new.choose.title")}</h2>
      <p>{t("new.choose.intro")}</p>
      <div className="novo-escolha">
        <div>
          <div className="novo-filtros">
            <label className="novo-pesquisa">
              <span>{t("new.filter.text")}</span>
              <input type="search" value={f.text} onChange={(e) => set("text", e.target.value)} placeholder={t("new.filter.textHint")} disabled={disabled} data-testid="novo-pesquisa" />
            </label>
            {sel("difficulty", "new.filter.difficulty", (["underdog", "balanced", "big"] as const).map((d) => [d, t(`new.difficulty.${d}` as Key)]))}
            {sel("tier", "new.filter.tier", TIERS.map((x) => [x, t(`tier.${x}` as Key)]))}
            {sel("district", "new.filter.district", districts)}
            {sel("status", "new.filter.status", (["village", "town", "city"] as const).map((x) => [x, t(`status.${x}` as Key)]))}
            {sel("level", "new.filter.reputation", LEVELS.map((x) => [x, t(`reputation.level.${x}` as Key)]))}
            {sel("basin", "new.filter.basin", ["1", "2", "3"].map((x) => [x, t(`new.basin.${x}` as Key)]))}
            {sel("finances", "new.filter.finances", ["1", "2", "3"].map((x) => [x, t(`new.finances.${x}` as Key)]))}
            <label className="novo-check"><input type="checkbox" checked={f.stadium} onChange={(e) => set("stadium", e.target.checked)} disabled={disabled} /> {t("new.filter.stadium")}</label>
          </div>
          {!catalog ? <p>{t("profile.loading")}</p> : (
            <>
              <p className="suave" aria-live="polite">{visible.length > RESULTS_MAX ? t("new.results.more", { shown: RESULTS_MAX, total: visible.length }) : t("new.results", { n: visible.length })}</p>
              <ul className="novo-lista" data-testid="novo-lista">
                {visible.slice(0, RESULTS_MAX).map((c) => (
                  <li key={c.id}>
                    <button type="button" className={c.id === chosen?.id ? "ativo" : undefined} aria-pressed={c.id === chosen?.id} onClick={() => onChoose(c)} disabled={disabled}>
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
        <aside className="cartao novo-ficha" aria-live="polite" data-testid="novo-ficha">
          {chosen ? <Summary club={chosen} /> : <p className="vazio">{t("new.choose.pick")}</p>}
        </aside>
      </div>
    </>
  );
}

function Summary({ club }: { club: CatalogClub }) {
  const { t } = useT();
  const rows: [Key, string][] = [
    ["new.sum.league", club.league],
    ["new.sum.place", `${club.locality.name} (${t(`status.${club.locality.status}` as Key)}) · ${club.city}`],
    ["new.sum.district", club.district.name],
    ["new.sum.reputation", t(`reputation.level.${club.levelReputation}` as Key)],
    ["new.sum.basin", t(`new.basin.${club.basin}` as Key)],
    ["new.sum.finances", t(`new.finances.${club.finances}` as Key)],
    ["new.sum.stadium", `${club.stadiumCapacity.toLocaleString("pt-PT")} · ${t(club.ownStadium ? "new.stadium.own" : "new.stadium.municipal")}`],
    ...(club.rival ? [["new.sum.rival", club.rival.name] as [Key, string]] : []),
  ];
  return (
    <>
      <h3><ClubSwatch colours={club.colours} /> {club.name}</h3>
      <p><span className={`chip novo-dif-${club.difficulty}`}>{t(`new.difficulty.${club.difficulty}` as Key)}</span></p>
      <p className="suave">{t(`new.difficulty.${club.difficulty}.hint` as Key)}</p>
      <dl className="novo-dados">
        {rows.map(([k, v]) => (<div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>))}
      </dl>
    </>
  );
}
