/**
 * Importador dos CSV de data/ para o modelo (RZ-007).
 * Valida as mesmas regras de tools/build_dados.py e mais algumas (coerência entre ficheiros).
 * Função pura: recebe o texto dos CSV e devolve os dados ou a lista completa de erros
 * (nunca falha à primeira). Os totais esperados vêm dos parâmetros (RZ-006).
 */
import { DEFAULT_PARAMETERS, type Tier, type Params } from "../config/parametros";
import { STATUSES, coherentStatus } from "../localidade/estatuto";
import { readTable, type LineCsv } from "./csv";
import type {
  BaseCity,
  BaseClub,
  BaseData,
  BaseDistrict,
  SourcesCsv,
  BaseLocality,
  Ownership,
  ImportResult,
  BaseRivalry,
  CpSeries,
  Zone,
} from "./tipos";

const TIERS: Record<string, Tier> = {
  "Primeira Liga": "firstLeague",
  "Segunda Liga": "secondLeague",
  "Terceira Liga": "thirdLeague",
  "Campeonato de Portugal": "cp",
  Distrital: "district",
};
const ZONES: readonly Zone[] = ["centro", "perto", "periferia", "away"];
const PROPERTIES: readonly Ownership[] = ["club", "municipal", "partilhada"];
const SERIES: readonly CpSeries[] = ["A", "B", "C", "D"];

const COLUMNS = {
  clubs: ["id", "name", "city", "concelho", "district", "division", "league", "rep", "end", "cap", "stadium", "colours", "nickname", "mascot", "rival", "sector", "tag2", "hub", "serie_cp", "estadio_prop", "est_local", "est_dist_km", "est_transportes", "est_acesso_rodov", "est_estacionamento", "est_lugares_estac", "est_envolvente", "est_terreno", "origin", "localidade_id"],
  cities: ["concelho", "district", "population", "sector", "tag2", "hub", "island", "orcamento_municipal", "mayor", "ambition", "apoio_desporto", "vanity", "patience", "integrity", "cultura_futebol", "clubs"],
  localities: ["id", "name", "concelho", "district", "population", "status", "host", "clubs"],
  rivalries: ["clube_a", "clube_b", "mutual", "mesmo_concelho", "mesmo_distrito", "mesmo_polo", "mesma_divisao"],
  districts: ["district", "serie_cp", "Primeira Liga", "Segunda Liga", "Terceira Liga", "Campeonato de Portugal", "Distrital", "total"],
} as const;

/** Identificador estável: minúsculas, sem acentos, hífens. */
export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Ctx = { errors: string[]; warnings: string[] };

function table(name: keyof typeof COLUMNS, text: string, ctx: Ctx): LineCsv[] {
  const t = readTable(text);
  t.errors.forEach((e) => ctx.errors.push(`${name}.csv ${e}`));
  const foul = COLUMNS[name].filter((c) => !t.columns.includes(c));
  if (foul.length > 0) {
    ctx.errors.push(`${name}.csv: colunas em falta: ${foul.join(", ")}`);
    return [];
  }
  return t.lines;
}

function reader(file: string, l: LineCsv, ctx: Ctx) {
  const where = `${file}.csv linha ${l.number}`;
  const get = (c: string): string => l.values[c] ?? "";
  return {
    where,
    txt(c: string): string {
      const v = get(c);
      if (v === "") ctx.errors.push(`${where}: "${c}" vazio`);
      return v;
    },
    optionTxt: (c: string): string => get(c),
    within(c: string, min: number, max: number, integer = false): number {
      const v = Number(get(c));
      if (get(c) === "" || !Number.isFinite(v) || (integer && !Number.isInteger(v)) || v < min || v > max) {
        ctx.errors.push(`${where}: "${c}" = "${get(c)}" fora de [${min}, ${max}]${integer ? " (inteiro)" : ""}`);
        return min;
      }
      return v;
    },
    yesNo(c: string): boolean {
      const v = get(c);
      if (v !== "sim" && v !== "não") ctx.errors.push(`${where}: "${c}" deve ser "sim" ou "não" (é "${v}")`);
      return v === "sim";
    },
    em<T extends string>(c: string, valid: readonly T[]): T {
      const v = get(c) as T;
      if (!valid.includes(v)) {
        ctx.errors.push(`${where}: "${c}" = "${v}" inválido (${valid.join("/")})`);
        return valid[0] as T;
      }
      return v;
    },
  };
}

function count<T>(xs: T[], rowKey: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(rowKey(x), (m.get(rowKey(x)) ?? 0) + 1);
  return m;
}

export function importData(sources: SourcesCsv, params: Params = DEFAULT_PARAMETERS): ImportResult {
  const ctx: Ctx = { errors: [], warnings: [] };
  const { errors } = ctx;

  // ---------- distritos ----------
  const districts: BaseDistrict[] = [];
  for (const l of table("districts", sources.districts, ctx)) {
    const r = reader("districts", l, ctx);
    const name = r.txt("district");
    const por = (c: string) => r.within(c, 0, 100, true);
    const fresh: BaseDistrict = {
      id: slug(name),
      name,
      cpSeries: r.em("serie_cp", SERIES),
      clubsPerTier: {
        firstLeague: por("Primeira Liga"),
        secondLeague: por("Segunda Liga"),
        thirdLeague: por("Terceira Liga"),
        cp: por("Campeonato de Portugal"),
        district: por("Distrital"),
      },
    };
    districts.push(fresh);
    const sum = Object.values(fresh.clubsPerTier).reduce((a, b) => a + b, 0);
    if (sum !== r.within("total", 0, 1000, true)) errors.push(`${r.where}: "total" não é a soma dos escalões (${sum})`);
  }
  if (districts.length !== params.pyramid.districts)
    errors.push(`distritos.csv: ${districts.length} distritos (esperado ${params.pyramid.districts})`);
  for (const [id, n] of count(districts, (d) => d.id)) if (n > 1) errors.push(`distrito duplicado: ${id}`);
  const districtByName = new Map(districts.map((d) => [d.name, d]));
  const usedSeries = new Set(districts.map((d) => d.cpSeries));
  if (usedSeries.size !== params.pyramid.cp.series)
    errors.push(`distritos.csv: ${usedSeries.size} séries do CP (esperado ${params.pyramid.cp.series})`);

  // ---------- clubes ----------
  const clubs: BaseClub[] = [];
  const declaredSeries = new Map<string, string>();
  for (const l of table("clubs", sources.clubs, ctx)) {
    const r = reader("clubs", l, ctx);
    const name = r.txt("name");
    const id = r.txt("id");
    const division = r.txt("division");
    const tier = TIERS[division];
    if (!tier) errors.push(`${r.where}: divisão desconhecida "${division}"`);
    const cap = r.within("cap", 100, 200_000, true);
    clubs.push({
      id,
      name,
      locality: r.txt("city"),
      localityId: r.txt("localidade_id"),
      city: slug(r.txt("concelho")),
      district: r.txt("district"),
      tier: tier ?? "district",
      league: r.txt("league"),
      reputation: r.within("rep", 0, 10_000, true),
      finances: r.within("end", 0, 1e10, true),
      stadium: {
        name: r.txt("stadium"),
        ownership: r.em("estadio_prop", PROPERTIES),
        capacity: cap,
        location: {
          zone: r.em("est_local", ZONES),
          centreDistanceKm: r.within("est_dist_km", 0, 200),
          transport: r.within("est_transportes", 0, 100),
          roadAccess: r.within("est_acesso_rodov", 0, 100),
          parking: r.within("est_estacionamento", 0, 100),
          parkingPlaces: r.within("est_lugares_estac", 0, 100_000, true),
          surroundings: r.within("est_envolvente", 0, 100),
          expansionTerrain: r.within("est_terreno", 0, 100),
        },
      },
      colours: r.txt("colours"),
      nickname: r.optionTxt("nickname"),
      mascot: r.optionTxt("mascot"),
      rival: r.txt("rival"), // nome; resolvido abaixo
      sector: r.txt("sector"),
      tag2: r.txt("tag2"),
      hub: r.txt("hub"),
      origin: r.em("origin", ["existing", "fresh"] as const),
    });
    declaredSeries.set(id, r.optionTxt("serie_cp"));
    if (r.optionTxt("nickname") === "" || r.optionTxt("mascot") === "")
      ctx.warnings.push(`${r.where}: ${name} sem alcunha ou mascote`);
  }

  const idByName = new Map<string, string>();
  for (const c of clubs) {
    if (idByName.has(c.name)) errors.push(`nome de clube duplicado: ${c.name}`);
    idByName.set(c.name, c.id);
  }
  for (const [id, n] of count(clubs, (c) => c.id)) if (n > 1) errors.push(`id de clube duplicado: ${id}`);
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  for (const c of clubs) {
    const rival = idByName.get(c.rival);
    if (!rival) errors.push(`rival inexistente: ${c.name} -> ${c.rival}`);
    else if (rival === c.id) errors.push(`rival é o próprio clube: ${c.name}`);
    c.rival = rival ?? c.rival;
  }

  // ---------- coerência clubes ↔ distritos ----------
  for (const c of clubs) {
    const d = districtByName.get(c.district);
    if (!d) {
      errors.push(`${c.name}: distrito "${c.district}" não existe em distritos.csv`);
      continue;
    }
    if (declaredSeries.get(c.id) !== d.cpSeries)
      errors.push(`${c.name}: serie_cp "${declaredSeries.get(c.id)}" != série do distrito ${d.name} (${d.cpSeries})`);
    if (c.tier === "cp" && c.league !== `CP Série ${d.cpSeries}`)
      errors.push(`${c.name}: distrito ${d.name} pertence à série ${d.cpSeries} mas a liga é "${c.league}"`);
    if (c.tier === "district" && c.league !== `Distrital ${d.name}`)
      errors.push(`${c.name}: liga "${c.league}" não corresponde ao distrito ${d.name}`);
  }

  // ---------- totais por competição (a partir dos parâmetros) ----------
  const pyramid = params.pyramid;
  const total = count(clubs, (c) => c.tier);
  const expected: [Tier, number][] = [
    ["firstLeague", pyramid.firstLeague.clubs],
    ["secondLeague", pyramid.secondLeague.clubs],
    ["thirdLeague", pyramid.thirdLeague.clubs],
    ["cp", pyramid.cp.series * pyramid.cp.clubsPerSeries],
    ["district", pyramid.districts * params.districtLeagues.target],
  ];
  for (const [e, n] of expected) if ((total.get(e) ?? 0) !== n) errors.push(`${e}: ${total.get(e) ?? 0} clubes (esperado ${n})`);
  const byLeague = count(clubs, (c) => c.league);
  for (const s of usedSeries)
    if ((byLeague.get(`CP Série ${s}`) ?? 0) !== pyramid.cp.clubsPerSeries)
      errors.push(`CP Série ${s} tem ${byLeague.get(`CP Série ${s}`) ?? 0} clubes (esperado ${pyramid.cp.clubsPerSeries})`);
  for (const d of districts)
    if ((byLeague.get(`Distrital ${d.name}`) ?? 0) !== params.districtLeagues.target)
      errors.push(`Distrital ${d.name} tem ${byLeague.get(`Distrital ${d.name}`) ?? 0} clubes (esperado ${params.districtLeagues.target})`);
  const byTierDistrict = count(clubs, (c) => `${c.district}|${c.tier}`);
  for (const d of districts)
    for (const [e, n] of Object.entries(d.clubsPerTier))
      if ((byTierDistrict.get(`${d.name}|${e}`) ?? 0) !== n)
        errors.push(`distritos.csv: ${d.name} ${e} = ${n} mas há ${byTierDistrict.get(`${d.name}|${e}`) ?? 0} clubes`);

  // ---------- cidades ----------
  const cities: BaseCity[] = [];
  const cityClubsNames: string[][] = [];
  for (const l of table("cities", sources.cities, ctx)) {
    const r = reader("cities", l, ctx);
    const name = r.txt("concelho");
    const x2 = (c: string) => r.within(c, 1, 10, true) * 2;
    const district = r.txt("district");
    if (!districtByName.has(district)) errors.push(`${r.where}: distrito "${district}" não existe`);
    cities.push({
      id: slug(name),
      name,
      district,
      population: r.within("population", 1, 10_000_000, true),
      sector: r.txt("sector"),
      tag2: r.txt("tag2"),
      hub: r.txt("hub"),
      island: r.yesNo("island"),
      municipalBudget: r.within("orcamento_municipal", 0, 1e10, true),
      mayor: {
        name: r.txt("mayor"),
        traits: { ambition: x2("ambition"), vanity: x2("vanity"), patience: x2("patience"), integrity: x2("integrity") },
        sportSupport: r.within("apoio_desporto", 1, 10, true),
      },
      footballCulture: r.within("cultura_futebol", 0, 100),
      clubs: [],
    });
    cityClubsNames.push(r.optionTxt("clubs").split(";").map((s) => s.trim()).filter(Boolean));
  }
  for (const [id, n] of count(cities, (c) => c.id)) if (n > 1) errors.push(`concelho duplicado: ${id}`);
  const cityById = new Map(cities.map((c) => [c.id, c]));
  cities.forEach((c, i) => {
    for (const name of cityClubsNames[i] ?? []) {
      const id = idByName.get(name);
      const club = id ? clubById.get(id) : undefined;
      if (!club) errors.push(`cidade ${c.name}: clube inexistente "${name}"`);
      else if (club.city !== c.id) errors.push(`cidade ${c.name}: o clube ${name} é de outro concelho (${club.city})`);
      else c.clubs.push(club.id);
    }
  });
  for (const c of clubs) {
    const city = cityById.get(c.city);
    if (!city) errors.push(`${c.name}: concelho "${c.city}" não existe em cidades.csv`);
    else {
      if (city.district !== c.district) errors.push(`${c.name}: distrito "${c.district}" != concelho ${city.name} ("${city.district}")`);
      if (!city.clubs.includes(c.id)) errors.push(`${c.name}: não consta na lista de clubes de ${city.name}`);
    }
  }

  // ---------- localidades (RZ-136) ----------
  const localities: BaseLocality[] = [];
  const localityClubsNames: string[][] = [];
  for (const l of table("localities", sources.localities, ctx)) {
    const r = reader("localities", l, ctx);
    const status = r.em("status", STATUSES);
    const population = r.within("population", 1, 5_000_000, true);
    const city = slug(r.txt("concelho"));
    localities.push({
      id: r.txt("id"),
      name: r.txt("name"),
      city,
      district: r.txt("district"),
      population,
      status,
      host: r.em("host", ["sim", "não"] as const) === "sim",
      clubs: [],
    });
    localityClubsNames.push(r.optionTxt("clubs").split(";").map((x) => x.trim()).filter(Boolean));
    const c = cityById.get(city);
    if (!c) errors.push(`${r.where}: concelho "${r.optionTxt("concelho")}" não existe em cidades.csv`);
    else {
      if (c.district !== r.optionTxt("district")) errors.push(`${r.where}: distrito "${r.optionTxt("district")}" != concelho ${c.name}`);
      if (population > c.population) errors.push(`${r.where}: a localidade (${population}) é maior do que o concelho ${c.name} (${c.population})`);
    }
    if (!coherentStatus(population, status, params))
      errors.push(`${r.where}: ${population} habitantes não é coerente com o estatuto "${status}" (limiares em parametros.localidade)`);
  }
  for (const [id, n] of count(localities, (x) => x.id)) if (n > 1) errors.push(`localidade duplicada: ${id}`);
  const localityById = new Map(localities.map((x) => [x.id, x]));
  localities.forEach((locality, i) => {
    for (const name of localityClubsNames[i] ?? []) {
      const id = idByName.get(name);
      const club = id ? clubById.get(id) : undefined;
      if (!club) errors.push(`localidade ${locality.name}: clube inexistente "${name}"`);
      else if (club.localityId !== locality.id) errors.push(`localidade ${locality.name}: o clube ${name} é de outra localidade (${club.localityId})`);
      else locality.clubs.push(club.id);
    }
  });
  for (const c of clubs) {
    const locality = localityById.get(c.localityId);
    if (!locality) errors.push(`${c.name}: localidade "${c.localityId}" não existe em localidades.csv`);
    else {
      if (locality.city !== c.city) errors.push(`${c.name}: a localidade ${locality.name} é de outro concelho (${locality.city})`);
      if (locality.name !== c.locality) errors.push(`${c.name}: nome de localidade "${c.locality}" != "${locality.name}"`);
      if (!locality.clubs.includes(c.id)) errors.push(`${c.name}: não consta na lista de clubes da localidade ${locality.name}`);
    }
  }

  // ---------- rivalidades ----------
  const rivalries: BaseRivalry[] = [];
  const edges = new Set<string>();
  for (const l of table("rivalries", sources.rivalries, ctx)) {
    const r = reader("rivalries", l, ctx);
    const a = idByName.get(r.txt("clube_a"));
    const b = idByName.get(r.txt("clube_b"));
    if (!a || !b) {
      errors.push(`${r.where}: clube inexistente (${r.optionTxt("clube_a")} / ${r.optionTxt("clube_b")})`);
      continue;
    }
    const rowKey = [a, b].sort().join("|");
    if (a === b) errors.push(`${r.where}: rivalidade de um clube consigo próprio`);
    if (edges.has(rowKey)) errors.push(`${r.where}: rivalidade duplicada`);
    edges.add(rowKey);
    const ca = clubById.get(a);
    const cb = clubById.get(b);
    if (!ca || !cb) continue;
    const rv: BaseRivalry = {
      a, b,
      mutual: r.yesNo("mutual"),
      sameMunicipality: r.yesNo("mesmo_concelho"),
      sameDistrict: r.yesNo("mesmo_distrito"),
      sameHub: r.yesNo("mesmo_polo"),
      sameDivision: r.yesNo("mesma_divisao"),
    };
    const expected: Record<string, boolean> = {
      mutual: ca.rival === b && cb.rival === a,
      sameMunicipality: ca.city === cb.city,
      sameDistrict: ca.district === cb.district,
      sameHub: ca.hub === cb.hub,
      sameDivision: ca.tier === cb.tier,
    };
    for (const k of Object.keys(expected))
      if ((rv as unknown as Record<string, boolean>)[k] !== expected[k]) errors.push(`${r.where}: "${k}" incoerente com os dados dos clubes`);
    rivalries.push(rv);
  }
  for (const c of clubs)
    if (!edges.has([c.id, c.rival].sort().join("|"))) errors.push(`${c.name}: o rival principal não consta em rivalidades.csv`);

  if (errors.length > 0) return { ok: false, errors };
  const data: BaseData = { districts, cities, localities, clubs, rivalries };
  return { ok: true, data, warnings: ctx.warnings };
}
