# Competições europeias (RZ-246 / RZ-902)

Três competições à imagem das reais (formato 2024/25), sobre o motor genérico `competition/format`. Código em `src/engine/europe`.

## Formato
- **Liga dos Campeões** e **Liga Europa**: 36 clubes, 4 potes, fase de liga «suíça» de 8 jogos (2 contra cada pote, um em casa e outro fora), tabela única.
- **Liga Conferência**: 36 clubes, 6 potes, 6 jogos (1 contra cada pote).
- Nas três: 1.º–8.º vão direto aos oitavos; 9.º–24.º jogam o play-off a duas mãos (9.º–16.º, cabeças de série, fecham em casa); 25.º para baixo ficam fora. Oitavos, quartos e meias a duas mãos; final a uma mão em campo neutro. Sem golos fora: agregado empatado → prolongamento e penáltis na 2.ª mão (ou na final). Fase de liga e 1.ªs mãos nunca têm prolongamento nem penáltis.

## Quem joga
- Portugal (`europe.portugal`): Liga dos Campeões 2 (1.º e 2.º da Primeira Liga da época anterior), Liga Europa 2 (vencedor da Taça de Portugal + o seguinte), Liga Conferência 1. Na 1.ª época vale a reputação.
- O resto vem dos clubes estrangeiros inventados (`world/foreign.ts`, ids `x-…`, sem ficha), ordenados pela força do plantel. Um save antigo sem clubes estrangeiros suficientes não tem Europa.

## Calendário e prémios
Quartas-feiras (Champions) e quintas (Europa/Conferência) a partir de 15 de setembro, em `europe.calendar`/`europe.competitions`. Prémios por participação, vitória, empate, top 8 e cada ronda em `europe.competitions.*.prizes`; só os clubes portugueses recebem (`europe/announce.ts`).

## Vistas
`europeView` (tabela com zonas oitavos/play-off/eliminado + rondas), `europeCups`, `clubCompetitions` (posição na fase de liga e ronda) e `recentMatches` (códigos LC/LE/LCf).

## Notícias e mensagens (RZ-250)
Eventos `EUROPE_QUALIFIED` e `EUROPE_DRAW` (ao criar a competição, um por clube português: apuramento e os 8 adversários da fase de liga) e `EUROPE_LEAGUE_PHASE` (fim da fase de liga: posição e zona direct/playoff/out). Viram notícias `europe_qualified|europe_draw|europe_phase`; para o clube do gamer aparecem na Inbox como cartão alto (`TallCard`).
