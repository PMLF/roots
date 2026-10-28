# Relatório de calibração a 50 épocas (RZ-237, 28-10-2026)

Corrida: `successCalibration.slow.test.ts`, 50 épocas sem gamer, seed `success`; passou sem erros. Dados época a época em `docs/calibration-50-seasons.json`.

## Caixa mediana por clube (milhões de euros, médias de blocos de épocas)

| Escalão | Época 1 | 1–5 | 11–20 | 21–30 | 31–40 | 41–50 | p10 / p90 (ép. 50) | Clubes negativos (41–50) |
|---|---|---|---|---|---|---|---|---|
| 1.ª Liga | 8,4 | 12,8 | 28,4 | 30,4 | 32,3 | 31,0 | 14,3 / 112,6 | 0 % |
| 2.ª Liga | 3,0 | 4,6 | 15,0 | 17,3 | 16,9 | 16,8 | 6,3 / 31,3 | 1 % |
| 3.ª Liga | 1,6 | 2,1 | 3,4 | 3,5 | 3,7 | 3,4 | 1,7 / 14,4 | 2,5 % |
| CP | 0,6 | 0,8 | 2,0 | 2,2 | 2,2 | 2,2 | 0,5 / 3,3 | 0,5 % |
| Distritais | 0,10 | 0,18 | 0,41 | 0,44 | 0,44 | 0,45 | 0,26 / 0,70 | 0,2 % |

As medianas sobem até à época ~10–15 (3 a 4× o valor inicial) e depois ficam estáveis até à 50.ª, dentro de ±5 %. A dispersão entre clubes continua grande (p90/p10 de 8× na 1.ª Liga).

## Outros indicadores
- Mobilidade: sempre 36 clubes (12 %) por época, como desenhado.
- População das cidades: mediana 0,88 do inicial na época 50; extremos de 0,47 a 2,08.
- Empresas: 986 → 976.

## O que mudou para chegar aqui
1. Teto à massa salarial por defeito (`finances.budget.wageShareMax`), sem baixar da massa atual.
2. Vendas ao estrangeiro (1,2–1,6× o valor) e compras lá fora com mais scouting (`squadCycle.abroad`, `squad/abroad.ts`).
3. Patrocínios novos maiores nos escalões altos, para campeões e promovidos (`companies.sponsorship.boost`).
4. Clubes de IA investem em infraestruturas o excedente acima de 3 anos de custos, 25 % ao ano (`finances.surplus`).
5. Calendário: quartas-feiras livres quando taças e pausas comem fins de semana (a época 14 falhava).

## Limitações
- A reputação dos clubes é estática; a caixa mediana estabiliza num nível 3–4× o inicial, o que se deve ao investimento de excedentes e não a custos de sucesso mais fortes.
- Os parâmetros novos são valores iniciais; podem afinar-se para um nível de estabilização mais baixo.
