#!/usr/bin/env python3
"""Gera Clubs_Raizes.xlsx a partir dos CSV em data/. Corre depois de build_data.py."""
import csv
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data"
F = "Arial"
HDR = PatternFill("solid", start_color="1F3A5F")
INP = Font(name=F, size=10, color="0000FF")  # input (azul)
BASE = Font(name=F, size=10)

def rd(name):
    return list(csv.DictReader(open(D / name, encoding="utf-8-sig")))

def sheet(wb, title, cols, rows, widths, numfmt=None, first=False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append([c[0] for c in cols])
    for r in rows:
        ws.append([c[2](r[c[1]]) if c[2] else r[c[1]] for c in cols])
    for cell in ws[1]:
        cell.font = Font(name=F, size=10, bold=True, color="FFFFFF"); cell.fill = HDR
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for row in ws.iter_rows(min_row=2):
        for cell in row: cell.font = BASE
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    for col, fmt in (numfmt or {}).items():
        for c in ws[col][1:]: c.number_format = fmt
    ws.freeze_panes = "B2"; ws.auto_filter.ref = ws.dimensions; ws.row_dimensions[1].height = 30
    return ws

wb = Workbook()
I = int
clubs = rd("clubs.csv")
cols = [("Nome","name",None),("Cidade","city",None),("Concelho","municipality",None),("Distrito","district",None),
        ("Divisão","division",None),("Liga / Série","league",None),("Reputação","reputation",I),("Finanças Iniciais (€)","finances",I),
        ("Capacidade Estádio","capacity",I),("Estádio","stadium",None),("Cores do Clube","colours",None),("Alcunha","nickname",None),
        ("Mascote","mascot",None),("Rival","rival",None),("Setor","sector",None),("Setor 2","sector2",None),("Polo","hub",None),
        ("Série CP","cp_series",None),("Propriedade do estádio","stadium_ownership",None),("Localização do estádio","stadium_location",None),("Distância ao centro (km)","stadium_distance_km",float),("Transportes (0-100)","stadium_transport",I),("Acesso rodoviário (0-100)","stadium_road_access",I),("Estacionamento (0-100)","stadium_parking",I),("Lugares de estacionamento","stadium_parking_places",I),("Envolvente (0-100)","stadium_surroundings",I),("Terreno p/ expansão (0-100)","stadium_terrain",I),("Origem","origin",None),("ID","id",None)]
sheet(wb, "Clubes", cols, clubs, [34,24,24,17,22,26,11,16,13,32,26,18,22,32,8,8,22,9,14,13,12,12,12,12,12,12,10,30],
      {"G":"#,##0","H":"#,##0","I":"#,##0"}, first=True)

city_name = rd("cities.csv")
cols = [("Concelho","municipality",None),("Distrito","district",None),("População (aprox.)","population",I),("Setor","sector",None),
        ("Setor 2","sector2",None),("Polo","hub",None),("Ilha","island",None),("Orçamento municipal (€)","municipal_budget",I),
        ("Presidente da Câmara (fictício)","mayor",None),("Ambição","ambition",I),("Apoio ao desporto","sport_support",I),
        ("Vaidade","vanity",I),("Paciência","patience",I),("Integridade","integrity",I),("Cultura de futebol","football_culture",I),("Clubes","clubs",None)]
sheet(wb, "Cidades", cols, city_name, [26,17,13,8,8,22,6,16,30,9,11,9,10,11,11,60], {"C":"#,##0","H":"#,##0"})

# Distritos: contagens por fórmula, ligadas à folha Clubes
district = rd("districts.csv")
ws = wb.create_sheet("Distritos")
divs = ["Primeira Liga","Segunda Liga","Terceira Liga","Campeonato de Portugal","Distrital"]
ws.append(["Distrito","Série CP"] + divs + ["Total"])
for i, r in enumerate(district, start=2):
    row = [r["district"], r["cp_series"]]
    for j, dv in enumerate(divs):
        col = get_column_letter(3 + j)
        row.append(f'=COUNTIFS(Clubes!$D:$D,$A{i},Clubes!$E:$E,{col}$1)')
    row.append(f"=SUM(C{i}:G{i})")
    ws.append(row)
n = len(district) + 1
ws.append(["Total", ""] + [f"=SUM({get_column_letter(3+j)}2:{get_column_letter(3+j)}{n})" for j in range(6)])
for cell in ws[1]:
    cell.font = Font(name=F, size=10, bold=True, color="FFFFFF"); cell.fill = HDR
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
for row in ws.iter_rows(min_row=2):
    for c in row: c.font = Font(name=F, size=10, bold=(row[0].row == n + 1))
for i, w in enumerate([20,9,13,13,13,16,11,9], 1): ws.column_dimensions[get_column_letter(i)].width = w
ws.freeze_panes = "B2"; ws.row_dimensions[1].height = 30

riv = rd("rivalries.csv")
cols = [("Clube A","club_a",None),("Clube B","club_b",None),("Mútua","mutual",None),("Mesmo concelho","same_municipality",None),
        ("Mesmo distrito","same_district",None),("Mesmo polo","same_hub",None),("Mesma divisão","same_division",None)]
sheet(wb, "Rivalidades", cols, riv, [34,34,9,15,15,12,14])

# Parâmetros (azul = valor editável)
ws = wb.create_sheet("Parâmetros")
ws.append(["Parâmetro","Valor","Nota"])
P = [("PREMIO_CLUBE (€)",2000000,"Prémio do Estado ao melhor classificado de cada distrito"),
     ("PREMIO_CIDADE (€)",1000000,"Recebido pela Câmara do concelho do clube"),
     ("DIST_ALVO",10,"Tamanho inicial de cada liga distrital"),
     ("DIST_MIN",8,"Tamanho mínimo; abaixo disto entra a Bolsa / nasce clube novo"),
     ("DIST_MAX",14,"Tamanho máximo; excedente desce para a Bolsa distrital"),
     ("CP_SERIES",4,"Número de séries do Campeonato de Portugal"),
     ("CP_TAMANHO_SERIE",10,"Clubes por série do CP"),
     ("PROMO_POR_GRUPO",2,"Promovidos de cada grupo da Fase de Promoção (5 campeões distritais por grupo)"),
     ("Distritos",20,"18 continentais + Açores + Madeira")]
for p in P: ws.append(list(p))
ws.append(["Descem do CP por época (≈)","=B7*B9","Igual aos promovidos da Fase de Promoção, para o CP manter o tamanho"])
ws.append(["% do CP que sai por época","=(B11+B7)/(B7*B8)","Descem ≈8 e sobem 4 (1 por série): ficam 28 dos 40"])
ws["B12"].number_format = "0%"; ws["B2"].number_format = "#,##0"; ws["B3"].number_format = "#,##0"
for cell in ws[1]:
    cell.font = Font(name=F, size=10, bold=True, color="FFFFFF"); cell.fill = HDR
for row in ws.iter_rows(min_row=2):
    row[0].font = BASE; row[2].font = BASE
    row[1].font = INP if row[0].row <= 10 else BASE
for i, w in enumerate([32,14,70], 1): ws.column_dimensions[get_column_letter(i)].width = w
wb.save(ROOT / "Clubs_Raizes.xlsx")
print("ok")
