# Competições europeias (RZ-246 / RZ-902)

Três competições à imagem das reais (formato 2024/25), sobre o motor genérico `competition/format`. Código em `src/engine/europe`.

## Formato
- **Liga dos Campeões** e **Liga Europa**: 36 clubes, 4 potes, fase de liga «suíça» de 8 jogos (2 contra cada pote, um em casa e outro fora), tabela única.
- **Liga Conferência**: 36 clubes, 6 potes, 6 jogos (1 contra cada pote).
- Nas três: 1.º–8.º vão direto aos oitavos; 9.º–24.º jogam o play-off a duas mãos (9.º–16.º, cabeças de série, fecham em casa); 25.º para baixo ficam fora. Oitavos, quartos e meias a duas mãos; final a uma mão em campo neutro. Sem golos fora: agregado empatado → prolongamento e penáltis na 2.ª mão (ou na final). Fase de liga e 1.ªs mãos nunca têm prolongamento nem penáltis.

## Quem joga
- **Vagas de Portugal (RZ-252)**: dependem do lugar de Portugal no ranking de associações (`europe.access`). O coeficiente de cada país é a média de pontos por clube (vitória 2, empate 1) nas últimas 5 épocas; as épocas em falta usam um valor inicial (Portugal: `portugalQuality`; os outros, a qualidade média dos clubes). A faixa (`bands`) onde cai Portugal dá as vagas {Champions direta, Champions pré-eliminatória, Liga Europa, Conferência}; ex.: 5.º–7.º lugar = 2 diretas + 1 pré-eliminatória + 1 + 1 (o 3.º vai à pré-eliminatória, o 4.º à Liga Europa, o 5.º à Conferência). As vagas da época seguinte guardam-se em `europe.slots.<época>` (meta) e usam-se com a classificação final da liga.
- **Confirmado nas regras reais**: o campeão vai direto à Champions; o 2.º vai à pré-eliminatória. Os números exatos de Liga Europa/Conferência por faixa **não foram confirmados** em fonte: são parâmetros editáveis.
- **Cascata** (`europe/access.ts`, `allocateEntries`): os vencedores da Champions e da Liga Europa entram na Champions e o da Conferência na Liga Europa, mesmo sem vaga pela liga; o vencedor da Taça entra na fase de liga da Liga Europa. Se o clube já tinha vaga igual ou melhor pela liga, a vaga passa ao clube seguinte da tabela que ainda não está apurado e as restantes descem um lugar.
- **Pré-eliminatória da Champions**: resolvida automaticamente (sorteio ponderado pela força, `qualifierSensitivity`); quem perde cai para a Liga Europa; evento `EUROPE_QUALIFIER`. Ainda não é jogável (RZ-253).
- **Zonas nas tabelas**: Champions a azul (exceto o 1.º, que é campeão), pré-eliminatória a azul menos vivo, Liga Europa a tijolo, Conferência a verde (`europe/zones.ts`; `zoneOf`).
- O resto vem dos clubes estrangeiros inventados (`world/foreign.ts`, ids `x-…`, sem ficha), ordenados pela força do plantel. Um save antigo sem clubes estrangeiros suficientes não tem Europa.

## Calendário e prémios
Quartas-feiras (Champions) e quintas (Europa/Conferência) a partir de 15 de setembro, em `europe.calendar`/`europe.competitions`. Prémios por participação, vitória, empate, top 8 e cada ronda em `europe.competitions.*.prizes`; só os clubes portugueses recebem (`europe/announce.ts`).

## Vistas
`europeView` (tabela com zonas oitavos/play-off/eliminado + rondas), `europeCups`, `clubCompetitions` (posição na fase de liga e ronda) e `recentMatches` (códigos LC/LE/LCf).

## Notícias e mensagens (RZ-250)
Eventos `EUROPE_QUALIFIED` e `EUROPE_DRAW` (ao criar a competição, um por clube português: apuramento e os 8 adversários da fase de liga) e `EUROPE_LEAGUE_PHASE` (fim da fase de liga: posição e zona direct/playoff/out). Viram notícias `europe_qualified|europe_draw|europe_phase`; para o clube do gamer aparecem na Inbox como cartão alto (`TallCard`).
