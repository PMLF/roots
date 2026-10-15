#!/usr/bin/env python3
"""Migração única: nomes de clubes novos mais realistas (sigla + localidade ou gentílico).
O humor e a identidade local ficam na alcunha e na mascote. Atualiza também os rivais
em data/src. Corre uma vez; depois: python3 tools/build_dados.py && python3 tools/build_xlsx.py"""
import hashlib, re, csv
from pathlib import Path
SRC = Path(__file__).resolve().parents[2] / "data" / "src"
MANTER = {"AD Mirandelense","AD Vilacondense","Vimaranense Atlético Clube","Bracarense Atlético Clube",
 "Maia Atlético Clube","Atlético Penafidelense","UD Vila-Realense","Ponte de Lima Atlético Clube",
 "Louletano Atlético","Barquense Desportivo","Lousada Desportivo","Trofa Atlético Clube","Amarense Clube",
 "Vila Flor Desportivo","Alfândega Fé Desportivo","Celorico Basto Desportivo","Mesão Frio Desportivo",
 "Alcains Atlético Clube","Samora Correia Atlético","Famalicense Operário FC","AD Melgacense"}
PRE = ["GD","CD","AD","UD","SC","FC","AC"]
EXTRA = ["Académico de {}","Juventude de {}","Sporting de {}","Operário de {}","Os Unidos de {}"]
NOMES = {"Corvo Corvos FC": "Corvos FC"}   # pedido do Pedro: só "Corvos FC", por ser a ilha
MASCOTES = {"Sofá Gigante":"Marceneiro","Sapato Gigante":"Mestre Sapateiro","Cadeira Falante":"Aprendiz de Marceneiro",
 "Duna Falante":"Pinheiro-manso","Escultura Ambulante":"Monge Beneditino","Presunto Saltitante":"Pescador do Minho",
 "Banhista de Roupão":"Banhista","Emigrante com Mala":"Emigrante","Tenda de Festival":"Guitarrista","Tapete Voador":"Bordadeira",
 "Turista de Chinelos":"Turista","Ferry-boat":"Barqueiro do Guadiana","Ficha de Casino":"Nadador-salvador"}
ALCUNHAS = {"Miranda Corvo Atlético": "Mirandenses"}
h = lambda s: int(hashlib.md5(s.encode()).hexdigest(), 16)

existentes = {r["Nome"] if "Nome" in r else list(r.values())[0] for r in csv.DictReader(open(SRC/"existentes_raw.csv", encoding="utf-8-sig"))}
usados = set(existentes) | MANTER | set(NOMES.values())
ficheiros = sorted(SRC.glob("clubes_*.txt"))
linhas = {f: f.read_text(encoding="utf-8").splitlines() for f in ficheiros}
mapa = {}
for f, ls in linhas.items():
    for ln in ls:
        if not ln or ln.startswith("#"): continue
        c = ln.split("|"); nome, loc, conc, alc = c[0], c[1], c[2], c[3]
        if nome in MANTER: continue
        if nome in NOMES: mapa[nome] = NOMES[nome]; continue
        loc = re.sub(r"\s*\(.*\)", "", loc)
        gent = alc[:-1] if alc.endswith("enses") and "-" not in alc and " " not in alc else None
        cands = []
        k = h(nome)
        base = PRE[k % len(PRE)]
        forms = []
        if gent and (k >> 3) % 2 == 0: forms += [f"{p} {gent}" for p in PRE[k % 7:] + PRE[:k % 7]]
        forms += [f"{p} {loc}" for p in PRE[k % 7:] + PRE[:k % 7]]
        forms += [e.format(loc) for e in EXTRA]
        forms += [f"{p} {loc} {conc}" for p in PRE]
        novo = next((x for x in forms if x not in usados), None)
        assert novo, nome
        usados.add(novo); mapa[nome] = novo

def trocar(campo): return mapa.get(campo, campo)
for f, ls in linhas.items():
    out = []
    for ln in ls:
        if not ln or ln.startswith("#"): out.append(ln); continue
        c = ln.split("|")
        if c[0] in ALCUNHAS: c[3] = ALCUNHAS[c[0]]
        c[4] = MASCOTES.get(c[4], c[4])
        c[0] = trocar(c[0]); c[7] = trocar(c[7]); out.append("|".join(c))
    f.write_text("\n".join(out) + "\n", encoding="utf-8")
ov = SRC / "existentes_overlay.txt"
out = []
for ln in ov.read_text(encoding="utf-8").splitlines():
    if not ln or ln.startswith("#"): out.append(ln); continue
    c = ln.split("|"); c[2] = trocar(c[2]); out.append("|".join(c))
ov.write_text("\n".join(out) + "\n", encoding="utf-8")
for a, b in mapa.items(): print(f"{a}  →  {b}")
print(len(mapa), "renomeados")
