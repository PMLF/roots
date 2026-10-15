# Raízes — Motor de jogo (RZ-104)

Código em `src/engine/jogo/`. Puro, determinístico e sem DOM nem base de dados; os números de regras vivem em `parametros.jogo` (`src/engine/config/parametros.ts`).

## 1. Ideia

Um jogo é uma sequência de **oportunidades** (≈24 por equipa num jogo equilibrado). Cada oportunidade passa por filtros com probabilidades que dependem dos atributos dos onze: chega a remate? com que xG? bloqueado? golo? defendido? canto? Sem motor visual.

Cada **minuto** é um passo independente cujo fluxo aleatório vem de `jogo/<id>/m<minuto>` (`Rng.derivar`). Consequências:

- **Retomável.** `simularAte(45)` e depois `simularAte(90)` dá o mesmo jogo que `simularAte(90)`. É a base do jogo ao vivo (RZ-130).
- **Mudanças a meio.** `alterarEquipa(lado, equipa)` (substituições, tática: RZ-108/215) só afeta os minutos seguintes.
- **Reprodutível.** Mesma seed + mesmo `id` de jogo + mesmas equipas = mesmo jogo.

## 2. Da equipa à força

`forcaEquipa(onze)` resume os onze em quatro números (escala 1-20), ponderados por posição:

| | atributos | posições (peso) |
|---|---|---|
| ataque | finalização, drible, desmarcação, velocidade, técnica | PL 1, ED/EE 0,8, MO 0,7, MC 0,3 |
| controlo | passe, visão, controlo de bola, decisão, trabalho de equipa | MC 1, MDC/MO 0,8, extremos 0,3, laterais 0,2 |
| defesa | desarme, marcação, posicionamento, antecipação | DC 1, MDC 0,8, laterais 0,7, MC 0,3 |
| guarda-redes | reflexos, manuseamento, posicionamento, saídas | o GR |

A `forma` de cada jogador (0,7-1,1; por omissão 1) multiplica os seus atributos (fadiga e lesões: RZ-107).

`onzeAutomatico` escolhe o melhor onze para a formação (4-3-3 enquanto não há táticas): cada posição fica com quem lá rende mais, com a aptidão da posição incluída. É o que o jogo usa até o gamer escolher.

## 3. Um minuto

1. **Posse:** a equipa «dona» do minuto sai de um sorteio com a quota de controlo (logística de `controlo + vantagemCasa − controlo adversário`, escala `escalaControlo`). A posse final é a fração de minutos.
2. **Oportunidades:** cada equipa tem probabilidade `2 · oportunidadesPorEquipa · quota / duração` de ter uma oportunidade.
3. **Faltas:** `faltas.porEquipa / duração` por minuto; o infrator pesa agressividade e falta de desarme; uma fração (`penalti.pPorFalta`) dá **penálti**, outra (`faltas.pLivreRemate`) um **livre** perigoso.

## 4. Uma oportunidade

1. Chega a remate com `pRemateBase`, ajustada pela diferença ataque − defesa; senão é um **lance** (pode dar canto).
2. **xG** do remate = `base + amplitude · u^expoente` (u uniforme), deslocado em logit pela diferença ataque − defesa e limitado a `[min, max]`. O xG é a probabilidade de golo antes de bloqueios.
3. **Finalizador** por posição (`pesoRemate`) e finalização²; **assistente** (72 %) por posição e passe + visão + criatividade, nunca o próprio.
4. **Bloqueado** com `pBloqueado` (não há bloqueios em penáltis; pode dar canto).
5. **Golo** com `logit(xG / (1 − pBloqueado)) + peso.finalizacao · (finalização − 10)/10 − peso.guardaRedes · (GR − 10)/10`. Assim, em média, golos = xG; um bom finalizador ou um mau guarda-redes desviam-no.
6. Não golo: **defendido** (à baliza) ou **fora**, segundo `aBaliza`. Defendido pode dar canto.
7. **Canto:** pode dar remate de cabeça (`cantos.pRemate`; cabeceamento × altura × posição) com xG mais baixo e, no máximo, mais um canto.

Eventos: `lance`, `remate` (resultado, origem, xG, finalizador, assistente, guarda-redes), `canto`, `falta`.

## 5. Calibração (RZ-104; o harness completo é RZ-123)

`calibracao.test.ts` joga 4 000 jogos de equipas iguais e confere os números de um jogo normal:

| | alvo | obtido |
|---|---|---|
| golos por jogo | 2,3-3,0 | ≈ 2,6 |
| remates por equipa / à baliza | 10-15 / 3,5-6 | ≈ 12,5 / 4,3 |
| cantos por jogo | 8-13 | ≈ 9,4 |
| faltas por jogo | 21-27 | ≈ 24 |
| penáltis por jogo | 0,15-0,45 | ≈ 0,29 |
| casa / empate / fora | 40-50 % / 22-32 % / — | ≈ 43 / 27 / 30 % |
| xG vs golos | diferença < 8 % | < 1 % |

E que a força conta: com +2 pontos de qualidade a equipa da casa ganha ≈ 68 %, com +3 ≈ 78 %, com +6 mais de 85 %, e o mais fraco ainda ganha alguns jogos. `mundo.test.ts` confirma com o mundo gerado: a força média cresce a cada escalão, e um Primeira Liga ganha a um distrital mais de 75 % das vezes.

## 6. Estatísticas pós-jogo (RZ-105)

`relatorioDoJogo(entrada, equipas, eventos, resumo, params)` (`jogo/estatisticas.ts`) transforma o jogo no relatório da ficha do jogo. Não escreve texto: dá dados e a interface escreve.

- **Por equipa:** o `ResumoJogo` (golos, remates, à baliza, bloqueados, xG, cantos, faltas, posse) e os golos ao intervalo.
- **Golos:** lista por ordem com minuto, marcador, assistente, origem (jogada, canto, livre, penálti) e o marcador depois de cada um.
- **Por jogador:** minutos, golos, assistências, remates, à baliza, xG, penáltis falhados, faltas, defesas (GR) e golos sofridos (GR), mais a **nota**.
- **Nota (1-10):** base 6 + ações (golo, assistência, remate à baliza, grande ocasião falhada, penálti falhado, falta, penálti concedido, defesas do GR) + defesa (golos sofridos, baliza a zero, com peso por posição) + resultado (vitória/derrota) + um ruído estável tirado da seed e do id do jogo. Valores em `parametros.jogo.notas`. A nota vai para `participacao.nota` quando se passa o relatório a `registoDoJogo`.
- **Homem do jogo:** a melhor nota; desempata por golos + assistências, xG e id.
- **Momentos-chave:** golos com contexto (*abertura, empate, vantagem, reviravolta, redução, alargou*; reviravolta = passar para a frente depois de ter estado a perder), penáltis falhados (defendidos ou ao lado), grandes defesas e grandes ocasiões falhadas (xG ≥ `momentos.xgGrande`). São estruturados; `src/ui/jogo/momentos.ts` escreve-os em pt-PT e inglês (chaves `momento.*`). O comentário minuto a minuto continua a ser o RZ-131.
- **Cartões e lesões:** entram no relatório com RZ-106 e RZ-107, quando o motor os gerar.

## 7. Ligação ao resto

- `registoDoJogo(...)` converte o resultado em `JogoNovo` + factos (G, A, P) + participações, prontos para `Repositorio.registarJogo` (RZ-122 liga isto ao calendário).
- Fora desta tarefa, de propósito: cartões e castigos (RZ-106), lesões (RZ-107), tática e formações (RZ-108), nível de detalhe (RZ-109), jogo ao vivo com ritmo e pausa (RZ-130) e comentário (RZ-131). Os eventos já trazem os dados de que precisam.
