#!/usr/bin/env python3
"""Junta os ficheiros-fonte (data/src) e gera data/clubes.csv, cidades.csv, distritos.csv, rivalidades.csv.
Corre: python3 tools/build_dados.py   (a partir da raiz do projeto)
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
SERIE_DE = {d: s for s, ds in SERIES.items() for d in ds}
DIVISOES = ["Primeira Liga", "Segunda Liga", "Terceira Liga", "Campeonato de Portugal", "Distrital"]
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

erros = []
def err(m): erros.append(m)

# ---------- concelhos ----------
conc = {}
for f in sorted(glob.glob(str(SRC / "concelhos_*.txt"))):
    for ln in lines(f):
        c, d, pop, s1, s2, polo = ln.split("|")
        if c in conc: err(f"concelho duplicado: {c}")
        conc[c] = dict(concelho=c, distrito=d, pop=int(pop), setor=s1, tag2=s2, polo=polo)

# ---------- clubes existentes ----------
exist = []
with open(SRC / "existentes_raw.csv", encoding="utf-8") as fh:
    rows = list(csv.reader(fh))
hdr = rows[0][:11]
ov = {}
for ln in lines(SRC / "existentes_overlay.txt"):
    q = ln.split("|"); ov[q[0]] = (q[1], q[2], q[3] if len(q) > 3 else None)
corrigidos = []
preenchidos = []
fill = {}
for ln in lines(SRC / "existentes_preenchimento.txt"):
    q = ln.split("|"); fill[q[0]] = (q[1], q[2])
for r in rows[1:]:
    r = [x.strip() for x in r[:11]]
    nome, cidade, div, dist, rep, fin, cap, est, cores, alc, masc = r
    for k, v in TYPOS.items():
        for fld_name, val in (("cores", cores), ("mascote", masc)):
            if val == k:
                corrigidos.append(f"{nome}: '{k}' -> '{v}'")
                if fld_name == "cores": cores = v
                else: masc = v
    if nome not in ov: err(f"sem overlay: {nome}"); continue
    c, rival, cid_ov = ov[nome]
    if cid_ov: cidade = cid_ov
    if nome in fill:
        fa, fm = fill[nome]
        if not alc and fa: alc = fa; preenchidos.append(nome)
        if not masc and fm: masc = fm; preenchidos.append(nome)
    exist.append(dict(nome=nome, cidade=cidade, concelho=c, divisao=div, liga=div, distrito=dist,
                      rep=int(rep), fin=int(fin), cap=int(cap), estadio=est, cores=cores,
                      alcunha=alc, mascote=masc, rival=rival, origem="existente"))
for n in ov:
    if n not in {e["nome"] for e in exist}: err(f"overlay sem clube: {n}")

# ---------- clubes novos ----------
novos = []
for f in sorted(glob.glob(str(SRC / "clubes_*.txt"))):
    sec = None
    for ln in lines(f):
        if ln.startswith("##"):
            sec = ln[2:].strip(); continue
        p = ln.split("|")
        if len(p) != 8: err(f"linha com {len(p)} campos: {ln[:60]}"); continue
        nome, loc, c, alc, masc, cores, est, rival = p
        if c not in conc: err(f"concelho em falta: {c} ({nome})"); continue
        d = conc[c]["distrito"]
        if sec.startswith("CP-"):
            div, liga = "Campeonato de Portugal", f"CP Série {sec[3:]}"
            if SERIE_DE[d] != sec[3:]: err(f"{nome}: distrito {d} não pertence à série {sec[3:]}")
        else:
            dd = sec.split("|")[1]
            div, liga = "Distrital", f"Distrital {dd}"
            if dd != d: err(f"{nome}: secção {dd} mas concelho {c} é de {d}")
        novos.append(dict(nome=nome, cidade=loc, concelho=c, divisao=div, liga=liga, distrito=d,
                          estadio=est, cores=cores, alcunha=alc, mascote=masc, rival=rival, origem="novo"))

# ---------- números para os clubes novos ----------
FAIXAS = {  # rep, finanças, capacidade
    "Campeonato de Portugal": ((2000, 2900), (150_000, 1_500_000), (1500, 4500)),
    "Distrital": ((800, 1800), (15_000, 250_000), (300, 2500)),
}
for c in novos:
    r = rng("clube:" + c["nome"])
    pop = conc[c["concelho"]]["pop"]
    popn = min(1, max(0, math.log(pop / 1000) / math.log(150)))
    s = 0.5 * r.random() + 0.5 * popn
    (rl, rh), (fl, fh), (cl, ch) = FAIXAS[c["divisao"]]
    c["rep"] = int(round((rl + s * (rh - rl)) / 10) * 10)
    s2 = min(1, max(0, 0.6 * s + 0.4 * r.random()))
    c["fin"] = int(math.exp(math.log(fl) + s2 * (math.log(fh) - math.log(fl))))
    cap = cl + (0.7 * s + 0.3 * r.random()) * (ch - cl)
    c["cap"] = int(max(150, min(cap, pop * 0.6)))

todos = exist + novos
# ---------- validações ----------
nomes = [c["nome"] for c in todos]
for n, k in Counter(nomes).items():
    if k > 1: err(f"nome duplicado: {n}")
S = set(nomes)
for c in todos:
    if c["rival"] not in S: err(f"rival inexistente: {c['nome']} -> {c['rival']}")
    if c["rival"] == c["nome"]: err(f"rival é o próprio: {c['nome']}")
    if c["concelho"] not in conc: err(f"concelho em falta: {c['concelho']} ({c['nome']})")
    elif conc[c["concelho"]]["distrito"] != c["distrito"]:
        err(f"{c['nome']}: distrito do ficheiro '{c['distrito']}' != concelho '{conc[c['concelho']]['distrito']}'")
cont = Counter(c["liga"] for c in todos)
for s in SERIES:
    if cont[f"CP Série {s}"] != 10: err(f"CP Série {s} tem {cont[f'CP Série {s}']} clubes")
for d in SERIE_DE:
    if cont[f"Distrital {d}"] != 10: err(f"Distrital {d} tem {cont[f'Distrital {d}']} clubes")
exp = {"Primeira Liga": 20, "Segunda Liga": 18, "Terceira Liga": 20}
for k, v in exp.items():
    if cont[k] != v: err(f"{k} tem {cont[k]} (esperado {v})")

if erros:
    print("ERROS:"); [print(" -", e) for e in erros]; sys.exit(1)

# ---------- cidades (concelhos) ----------
NOMES = ["António","João","Manuel","José","Carlos","Paulo","Rui","Fernando","Luís","Jorge","Pedro","Nuno","Miguel","Sérgio","Hugo","Tiago",
         "Maria","Ana","Teresa","Cristina","Paula","Sandra","Helena","Isabel","Carla","Susana","Rita","Marta","Filipa","Sofia","Inês","Lúcia"]
APELIDOS = ["Silva","Santos","Ferreira","Pereira","Oliveira","Costa","Rodrigues","Martins","Sousa","Fernandes","Gonçalves","Gomes","Lopes","Marques",
            "Alves","Almeida","Ribeiro","Pinto","Carvalho","Teixeira","Moreira","Correia","Mendes","Nunes","Soares","Vieira","Monteiro","Cardoso","Rocha","Neves"]
usados = defaultdict(list)
for c in todos: usados[c["concelho"]].append(c["nome"])
cidades = []
for cn, d in sorted(conc.items(), key=lambda kv: (kv[1]["distrito"], kv[0])):
    if cn not in usados: continue
    r = rng("autarca:" + cn)
    pop = d["pop"]
    percap = 1100 + 2500 / (1 + pop / 8000)
    # cultura de futebol (0-100): base + setor + melhor escalão local + ruído determinístico
    melhor = min(DIVISOES.index(c["divisao"]) for c in todos if c["concelho"] == cn)
    cultura = 35 + {"UNI": 5, "IND": 5, "MAR": 8, "INT": 8, "DOR": -10, "TUR": -3}.get(d["setor"], 0) \
              + [20, 14, 8, 4, 0][melhor] + max(-8, min(12, 6 * math.log10(max(pop, 1) / 20000))) + r.gauss(0, 8)
    cultura = max(5, min(95, int(round(cultura))))
    cidades.append(dict(concelho=cn, distrito=d["distrito"], populacao=pop, setor=d["setor"], tag2=d["tag2"],
                        polo=d["polo"], ilha="sim" if d["distrito"] in ("Açores", "Madeira") else "não",
                        orcamento_municipal=int(round(pop * percap / 100_000) * 100_000) or 100_000,
                        autarca=f"{r.choice(NOMES)} {r.choice(APELIDOS)} {r.choice(APELIDOS)}",
                        ambicao=r.randint(1, 10), apoio_desporto=r.randint(1, 10), vaidade=r.randint(1, 10),
                        paciencia=r.randint(1, 10), integridade=r.randint(1, 10), cultura_futebol=cultura,
                        clubes="; ".join(usados[cn])))
nao_usados = [c for c in conc if c not in usados]
if nao_usados: print("AVISO concelhos sem clube:", nao_usados)

# ---------- escrever ----------
def w(path, cols, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        wr = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore"); wr.writeheader(); wr.writerows(rows)

ordem = {d: i for i, d in enumerate(DIVISOES)}
todos.sort(key=lambda c: (ordem[c["divisao"]], c["liga"], -c["rep"], c["nome"]))
for c in todos:
    c["id"] = slug(c["nome"]); c["setor"] = conc[c["concelho"]]["setor"]
    c["tag2"] = conc[c["concelho"]]["tag2"]; c["polo"] = conc[c["concelho"]]["polo"]
    c["serie_cp"] = SERIE_DE[c["distrito"]]
    # propriedade do estádio: clube / municipal / partilhada (probabilidades por escalão; determinístico)
    pc, pm = {"Primeira Liga": (0.50, 0.40), "Segunda Liga": (0.35, 0.50), "Terceira Liga": (0.35, 0.50),
              "Campeonato de Portugal": (0.25, 0.60), "Distrital": (0.15, 0.75)}[c["divisao"]]
    x = rng("prop:" + c["nome"]).random()
    c["estadio_prop"] = "clube" if x < pc else "municipal" if x < pc + pm else "partilhada"
ids = Counter(c["id"] for c in todos)
for i, k in ids.items():
    if k > 1: print("AVISO id duplicado", i)

COLS = ["id","nome","cidade","concelho","distrito","divisao","liga","rep","fin","cap","estadio","cores","alcunha","mascote","rival","setor","tag2","polo","serie_cp","estadio_prop","origem"]
w(OUT / "clubes.csv", COLS, todos)
w(OUT / "cidades.csv", list(cidades[0].keys()), cidades)

dist_rows = []
for d, s in sorted(SERIE_DE.items(), key=lambda kv: (kv[1], kv[0])):
    row = dict(distrito=d, serie_cp=s)
    for dv in DIVISOES: row[dv] = sum(1 for c in todos if c["distrito"] == d and c["divisao"] == dv)
    row["total"] = sum(row[dv] for dv in DIVISOES)
    dist_rows.append(row)
w(OUT / "distritos.csv", ["distrito","serie_cp"] + DIVISOES + ["total"], dist_rows)

by = {c["nome"]: c for c in todos}
par = {}
for c in todos:
    a, b = sorted([c["nome"], c["rival"]])
    par.setdefault((a, b), []).append(c["nome"])
riv = []
for (a, b), quem in sorted(par.items()):
    A, B = by[a], by[b]
    riv.append(dict(clube_a=a, clube_b=b, mutua="sim" if len(quem) == 2 else "não",
                    mesmo_concelho="sim" if A["concelho"] == B["concelho"] else "não",
                    mesmo_distrito="sim" if A["distrito"] == B["distrito"] else "não",
                    mesmo_polo="sim" if A["polo"] == B["polo"] else "não",
                    mesma_divisao="sim" if A["divisao"] == B["divisao"] else "não"))
w(OUT / "rivalidades.csv", list(riv[0].keys()), riv)

print(f"OK: {len(todos)} clubes ({len(exist)} existentes + {len(novos)} novos), {len(cidades)} concelhos, {len(riv)} rivalidades")
print("Divisões:", {d: sum(1 for c in todos if c['divisao'] == d) for d in DIVISOES})
print("Corrigi no original:", corrigidos)
print("Campos preenchidos:", len(preenchidos))
