#!/usr/bin/env python3
"""Junta os ficheiros-fonte (data/src) e gera data/clubes.csv, cidades.csv, distritos.csv, rivalidades.csv.
Corre: python3 tools/build_data.py   (a partir da raiz do projeto)
Determinístico: os números gerados dependem só do nome do clube/concelho.
"""
import csv, glob, hashlib, math, random, re, sys, unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "src"
OUT = ROOT / "data"

SERIES = {  # série do Campeonato de Portugal -> distritos (promoção do campeão distrital)
    "A": ["Viana do Castelo", "Braga", "Porto", "Vila Real", "Bragança"],
    "B": ["Aveiro", "Viseu", "Guarda", "Coimbra", "Castelo Branco"],
    "C": ["Leiria", "Santarém", "Lisboa", "Setúbal", "Portalegre"],
    "D": ["Évora", "Beja", "Faro", "Açores", "Madeira"],
}
SERIES_OF = {d: s for s, ds in SERIES.items() for d in ds}
DIVISIONS = ["Primeira Liga", "Segunda Liga", "Terceira Liga", "Campeonato de Portugal", "Distrital"]
TYPOS = {"Brancho e Preto": "Branco e Preto", "Gverreiro bragado": "Guerreiro bragado",
         "Salmao e branco": "Salmão e branco", "azul e branco": "Azul e branco"}

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def rng(key):
    return random.Random(int(hashlib.md5(key.encode()).hexdigest()[:12], 16))

def lines(path):
    for ln in Path(path).read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if ln and (ln.startswith("##") or not ln.startswith("#")):
            yield ln

errors = []
def err(m): errors.append(m)

# ---------- concelhos ----------
municipalities = {}
for f in sorted(glob.glob(str(SRC / "municipalities_*.txt"))):
    for ln in lines(f):
        c, d, pop, s1, s2, hub = ln.split("|")
        if c in municipalities: err(f"concelho duplicado: {c}")
        municipalities[c] = dict(municipality=c, district=d, pop=int(pop), sector=s1, sector2=s2, hub=hub)

# ---------- clubes existentes ----------
existing = []
with open(SRC / "existing_raw.csv", encoding="utf-8") as fh:
    rows = list(csv.reader(fh))
header = rows[0][:11]
overlay = {}
for ln in lines(SRC / "existing_overlay.txt"):
    q = ln.split("|"); overlay[q[0]] = (q[1], q[2], q[3] if len(q) > 3 else None)
corrected = []
filled = []
fill = {}
for ln in lines(SRC / "existing_fill.txt"):
    q = ln.split("|"); fill[q[0]] = (q[1], q[2])
for r in rows[1:]:
    r = [x.strip() for x in r[:11]]
    name, city, division, district, reputation, finances, capacity, stadium_name, colours, nick, mascot_name = r
    for k, v in TYPOS.items():
        for fld_name, val in (("colours", colours), ("mascot", mascot_name)):
            if val == k:
                corrected.append(f"{name}: '{k}' -> '{v}'")
                if fld_name == "colours": colours = v
                else: mascot_name = v
    if name not in overlay: err(f"sem overlay: {name}"); continue
    c, rival, city_override = overlay[name]
    if city_override: city = city_override
    if name in fill:
        fa, fm = fill[name]
        if not nick and fa: nick = fa; filled.append(name)
        if not mascot_name and fm: mascot_name = fm; filled.append(name)
    existing.append(dict(name=name, city=city, municipality=c, division=division, league=division, district=district,
                      reputation=int(reputation), finances=int(finances), capacity=int(capacity), stadium=stadium_name, colours=colours,
                      nickname=nick, mascot=mascot_name, rival=rival, origin="existing"))
for n in overlay:
    if n not in {e["name"] for e in existing}: err(f"overlay sem clube: {n}")

# ---------- clubes novos ----------
new_clubs = []
for f in sorted(glob.glob(str(SRC / "clubs_*.txt"))):
    section = None
    for ln in lines(f):
        if ln.startswith("##"):
            section = ln[2:].strip(); continue
        p = ln.split("|")
        if len(p) != 8: err(f"linha com {len(p)} campos: {ln[:60]}"); continue
        name, place, c, nick, mascot_name, colours, stadium_name, rival = p
        if c not in municipalities: err(f"concelho em falta: {c} ({name})"); continue
        d = municipalities[c]["district"]
        if section.startswith("CP-"):
            division, league = "Campeonato de Portugal", f"CP Série {section[3:]}"
            if SERIES_OF[d] != section[3:]: err(f"{name}: distrito {d} não pertence à série {section[3:]}")
        else:
            dd = section.split("|")[1]
            division, league = "Distrital", f"Distrital {dd}"
            if dd != d: err(f"{name}: secção {dd} mas concelho {c} é de {d}")
        new_clubs.append(dict(name=name, city=place, municipality=c, division=division, league=league, district=d,
                          stadium=stadium_name, colours=colours, nickname=nick, mascot=mascot_name, rival=rival, origin="new"))

# ---------- números para os clubes novos ----------
BANDS = {  # rep, finanças, capacidade
    "Campeonato de Portugal": ((2000, 2900), (150_000, 1_500_000), (1500, 4500)),
    "Distrital": ((800, 1800), (15_000, 250_000), (300, 2500)),
}
for c in new_clubs:
    r = rng("clube:" + c["name"])
    pop = municipalities[c["municipality"]]["pop"]
    popn = min(1, max(0, math.log(pop / 1000) / math.log(150)))
    s = 0.5 * r.random() + 0.5 * popn
    (rl, rh), (fl, fh), (cl, ch) = BANDS[c["division"]]
    c["reputation"] = int(round((rl + s * (rh - rl)) / 10) * 10)
    s2 = min(1, max(0, 0.6 * s + 0.4 * r.random()))
    c["finances"] = int(math.exp(math.log(fl) + s2 * (math.log(fh) - math.log(fl))))
    capacity = cl + (0.7 * s + 0.3 * r.random()) * (ch - cl)
    c["capacity"] = int(max(150, min(capacity, pop * 0.6)))

all_clubs = existing + new_clubs
# ---------- validações ----------
names = [c["name"] for c in all_clubs]
for n, k in Counter(names).items():
    if k > 1: err(f"nome duplicado: {n}")
S = set(names)
for c in all_clubs:
    if c["rival"] not in S: err(f"rival inexistente: {c['name']} -> {c['rival']}")
    if c["rival"] == c["name"]: err(f"rival é o próprio: {c['name']}")
    if c["municipality"] not in municipalities: err(f"concelho em falta: {c['municipality']} ({c['name']})")
    elif municipalities[c["municipality"]]["district"] != c["district"]:
        err(f"{c['name']}: distrito do ficheiro '{c['district']}' != concelho '{municipalities[c['municipality']]['district']}'")
counts = Counter(c["league"] for c in all_clubs)
for s in SERIES:
    if counts[f"CP Série {s}"] != 10: err(f"CP Série {s} tem {counts[f'CP Série {s}']} clubes")
for d in SERIES_OF:
    if counts[f"Distrital {d}"] != 10: err(f"Distrital {d} tem {counts[f'Distrital {d}']} clubes")
expected = {"Primeira Liga": 20, "Segunda Liga": 20, "Terceira Liga": 20}
for k, v in expected.items():
    if counts[k] != v: err(f"{k} tem {counts[k]} (esperado {v})")


# ---------- localidades (aldeia / vila / cidade; RZ-136) ----------
# Estatuto inicial pela população. Os limiares repetem os de parametros.ts (localidade.*); o importador (TS) confirma que batem certo.
TOWN_THRESHOLD, CITY_THRESHOLD = 1500, 8000
def status(pop): return "city" if pop >= CITY_THRESHOLD else "town" if pop >= TOWN_THRESHOLD else "village"
def without_parenthesis(n): return re.sub(r"\s*\(.*\)$", "", n)
extra_localities = {}
for ln in lines(SRC / "localities.txt"):
    name_l, municipality_l, locality_population = ln.split("|")
    if municipality_l not in municipalities: err(f"localidades.txt: concelho inexistente {municipality_l} ({name_l})"); continue
    if (name_l, municipality_l) in extra_localities: err(f"localidades.txt: duplicada {name_l} / {municipality_l}")
    extra_localities[(name_l, municipality_l)] = int(locality_population)
localities = {}
used_extra = set()
for c in all_clubs:
    key = (c["city"], c["municipality"])
    c["locality_id"] = slug(c["city"]) + "@" + slug(c["municipality"])
    if key in localities: continue
    if key in extra_localities:
        locality_population = extra_localities[key]; used_extra.add(key); host = "no"
    elif c["city"] == without_parenthesis(c["municipality"]):
        p_club = municipalities[c["municipality"]]["pop"]
        f = 0.7 if p_club < 8000 else 0.55 if p_club < 30000 else 0.5 if p_club < 100000 else 0.75
        locality_population = int(round(p_club * f / 100) * 100); host = "yes"
    else:
        err(f"localidade sem população: {c['city']} / {c['municipality']} ({c['name']}) — acrescentar a data/src/localidades.txt"); continue
    if locality_population > municipalities[c["municipality"]]["pop"]: err(f"localidade maior do que o concelho: {c['city']} / {c['municipality']}")
    localities[key] = dict(id=c["locality_id"], name=c["city"], municipality=c["municipality"], district=c["district"],
                              population=locality_population, status=status(locality_population), host=host, clubs=[])
for k in extra_localities:
    if k not in used_extra: err(f"localidades.txt: localidade sem clube: {k[0]} / {k[1]}")
for c in all_clubs: localities[(c["city"], c["municipality"])]["clubs"].append(c["name"])

if errors:
    print("ERROS:"); [print(" -", e) for e in errors]; sys.exit(1)

# ---------- cidades (concelhos) ----------
FIRST_NAMES = ["António","João","Manuel","José","Carlos","Paulo","Rui","Fernando","Luís","Jorge","Pedro","Nuno","Miguel","Sérgio","Hugo","Tiago",
         "Maria","Ana","Teresa","Cristina","Paula","Sandra","Helena","Isabel","Carla","Susana","Rita","Marta","Filipa","Sofia","Inês","Lúcia"]
SURNAMES = ["Silva","Santos","Ferreira","Pereira","Oliveira","Costa","Rodrigues","Martins","Sousa","Fernandes","Gonçalves","Gomes","Lopes","Marques",
            "Alves","Almeida","Ribeiro","Pinto","Carvalho","Teixeira","Moreira","Correia","Mendes","Nunes","Soares","Vieira","Monteiro","Cardoso","Rocha","Neves"]
used = defaultdict(list)
for c in all_clubs: used[c["municipality"]].append(c["name"])
cities = []
for cn, d in sorted(municipalities.items(), key=lambda kv: (kv[1]["district"], kv[0])):
    if cn not in used: continue
    r = rng("autarca:" + cn)
    pop = d["pop"]
    percap = 1100 + 2500 / (1 + pop / 8000)
    # cultura de futebol (0-100): base + setor + melhor escalão local + ruído determinístico
    best = min(DIVISIONS.index(c["division"]) for c in all_clubs if c["municipality"] == cn)
    culture = 35 + {"UNI": 5, "IND": 5, "MAR": 8, "INT": 8, "DOR": -10, "TUR": -3}.get(d["sector"], 0) \
              + [20, 14, 8, 4, 0][best] + max(-8, min(12, 6 * math.log10(max(pop, 1) / 20000))) + r.gauss(0, 8)
    culture = max(5, min(95, int(round(culture))))
    cities.append(dict(municipality=cn, district=d["district"], population=pop, sector=d["sector"], sector2=d["sector2"],
                        hub=d["hub"], island="yes" if d["district"] in ("Açores", "Madeira") else "no",
                        municipal_budget=int(round(pop * percap / 100_000) * 100_000) or 100_000,
                        mayor=f"{r.choice(FIRST_NAMES)} {r.choice(SURNAMES)} {r.choice(SURNAMES)}",
                        ambition=r.randint(1, 10), sport_support=r.randint(1, 10), vanity=r.randint(1, 10),
                        patience=r.randint(1, 10), integrity=r.randint(1, 10), football_culture=culture,
                        clubs="; ".join(used[cn])))
unused = [c for c in municipalities if c not in used]
if unused: print("AVISO concelhos sem clube:", unused)

# ---------- escrever ----------
def w(path, cols, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        wr = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore"); wr.writeheader(); wr.writerows(rows)

order = {d: i for i, d in enumerate(DIVISIONS)}
all_clubs.sort(key=lambda c: (order[c["division"]], c["league"], -c["reputation"], c["name"]))
for c in all_clubs:
    c["id"] = slug(c["name"]); c["sector"] = municipalities[c["municipality"]]["sector"]
    c["sector2"] = municipalities[c["municipality"]]["sector2"]; c["hub"] = municipalities[c["municipality"]]["hub"]
    c["cp_series"] = SERIES_OF[c["district"]]
    # propriedade do estádio: clube / municipal / partilhada (probabilidades por escalão; determinístico)
    p_club, p_municipal = {"Primeira Liga": (0.50, 0.40), "Segunda Liga": (0.35, 0.50), "Terceira Liga": (0.35, 0.50),
              "Campeonato de Portugal": (0.25, 0.60), "Distrital": (0.15, 0.75)}[c["division"]]
    x = rng("prop:" + c["name"]).random()
    c["stadium_ownership"] = "club" if x < p_club else "municipal" if x < p_club + p_municipal else "shared"
    # localização e envolvente do estádio (estimativas determinísticas; ver docs/CITY.md §5.3)
    d = municipalities[c["municipality"]]; q = rng("est:" + c["name"])
    u = max(0.0, min(1.0, math.log10(max(d["pop"], 1) / 3000) / 2.3))        # urbanidade 0-1
    top_flight = c["division"] == "Primeira Liga"
    pp = 0.15 + 0.35 * u + (0.10 if top_flight else 0)                              # prob. periferia
    x2 = q.random()
    place = "outskirts" if x2 < pp else "near" if x2 < pp + 0.35 else "centre"
    km = {"centre": q.uniform(0.2, 1.0), "near": q.uniform(1.0, 2.5), "outskirts": q.uniform(2.5, 3 + 5 * u)}[place]
    pen = {"centre": 0, "near": 6, "outskirts": 18}[place]
    section = {d["sector"], d["sector2"]}
    clamp = lambda v: int(max(5, min(95, round(v))))
    c["stadium_location"] = place
    c["stadium_distance_km"] = round(km, 1)
    c["stadium_transport"] = clamp(20 + 55 * u + (10 if "LOG" in section else 0) - (10 if "INT" in section else 0)
                                 - (5 if d["district"] in ("Açores", "Madeira") else 0) - pen + q.gauss(0, 8))
    c["stadium_road_access"] = clamp(45 + (15 if place == "outskirts" else 0) - (8 if "INT" in section else 0) + q.gauss(0, 12))
    c["stadium_parking"] = clamp(30 + 40 * (1 - u) + {"centre": -5, "near": 5, "outskirts": 20}[place] + q.gauss(0, 10))
    c["stadium_parking_places"] = int(round(c["capacity"] * (0.04 + 0.20 * (1 - u) + (0.08 if place == "outskirts" else 0)) / 10) * 10)
    c["stadium_surroundings"] = clamp(15 + 60 * u + (10 if "TUR" in section else 0) - {"centre": 0, "near": 6, "outskirts": 18}[place] + q.gauss(0, 8))
    c["stadium_terrain"] = clamp({"centre": q.uniform(15, 40), "near": q.uniform(30, 60), "outskirts": q.uniform(55, 90)}[place]
                             + (8 if "INT" in section else 0) - 8 * u)
ids = Counter(c["id"] for c in all_clubs)
for i, k in ids.items():
    if k > 1: print("AVISO id duplicado", i)

COLS = ["id","name","city","municipality","district","division","league","reputation","finances","capacity","stadium","colours","nickname","mascot","rival","sector","sector2","hub","cp_series","stadium_ownership","stadium_location","stadium_distance_km","stadium_transport","stadium_road_access","stadium_parking","stadium_parking_places","stadium_surroundings","stadium_terrain","origin","locality_id"]
w(OUT / "clubs.csv", COLS, all_clubs)
w(OUT / "cities.csv", list(cities[0].keys()), cities)
locality_rows = sorted(localities.values(), key=lambda l: (l["district"], l["municipality"], l["name"]))
for l in locality_rows: l["clubs"] = "; ".join(l["clubs"])
w(OUT / "localities.csv", ["id","name","municipality","district","population","status","host","clubs"], locality_rows)

district_rows = []
for d, s in sorted(SERIES_OF.items(), key=lambda kv: (kv[1], kv[0])):
    row = dict(district=d, cp_series=s)
    for dv in DIVISIONS: row[dv] = sum(1 for c in all_clubs if c["district"] == d and c["division"] == dv)
    row["total"] = sum(row[dv] for dv in DIVISIONS)
    district_rows.append(row)
w(OUT / "districts.csv", ["district","cp_series"] + DIVISIONS + ["total"], district_rows)

by = {c["name"]: c for c in all_clubs}
pairs = {}
for c in all_clubs:
    a, b = sorted([c["name"], c["rival"]])
    pairs.setdefault((a, b), []).append(c["name"])
riv = []
for (a, b), who in sorted(pairs.items()):
    A, B = by[a], by[b]
    riv.append(dict(club_a=a, club_b=b, mutual="yes" if len(who) == 2 else "no",
                    same_municipality="yes" if A["municipality"] == B["municipality"] else "no",
                    same_district="yes" if A["district"] == B["district"] else "no",
                    same_hub="yes" if A["hub"] == B["hub"] else "no",
                    same_division="yes" if A["division"] == B["division"] else "no"))
w(OUT / "rivalries.csv", list(riv[0].keys()), riv)

print(f"OK: {len(all_clubs)} clubes ({len(existing)} existentes + {len(new_clubs)} novos), {len(cities)} concelhos, {len(riv)} rivalidades")
print("Divisões:", {d: sum(1 for c in all_clubs if c['division'] == d) for d in DIVISIONS})
print("Corrigi no original:", corrected)
print("Localidades:", Counter(l["status"] for l in locality_rows))
print("Campos preenchidos:", len(filled))
