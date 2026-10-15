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
| ataque | finalização, drible, desmarcação, velocidade, técnica | ST 1, RW/LW 0,8, AM 0,7, CM 0,3 |
| controlo | passe, visão, controlo de bola, decisão, trabalho de equipa | CM 1, DM/AM 0,8, extremos 0,3, laterais 0,2 |
| defesa | desarme, marcação, posicionamento, antecipação | CB 1, DM 0,8, laterais 0,7, CM 0,3 |
| guarda-redes | reflexos, manuseamento, posicionamento, saídas | o GK |

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
5. **Golo** com `logit(xG / (1 − pBloqueado)) + peso.finalizacao · (finalização − 10)/10 − peso.guardaRedes · (GK − 10)/10`. Assim, em média, golos = xG; um bom finalizador ou um mau guarda-redes desviam-no.
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
- **Por jogador:** minutos, golos, assistências, remates, à baliza, xG, penáltis falhados, faltas, defesas (GK) e golos sofridos (GK), mais a **nota**.
- **Nota (1-10):** base 6 + ações (golo, assistência, remate à baliza, grande ocasião falhada, penálti falhado, falta, penálti concedido, defesas do GR) + defesa (golos sofridos, baliza a zero, com peso por posição) + resultado (vitória/derrota) + um ruído estável tirado da seed e do id do jogo. Valores em `parametros.jogo.notas`. A nota vai para `participacao.nota` quando se passa o relatório a `registoDoJogo`.
- **Homem do jogo:** a melhor nota; desempata por golos + assistências, xG e id.
- **Momentos-chave:** golos com contexto (*abertura, empate, vantagem, reviravolta, redução, alargou*; reviravolta = passar para a frente depois de ter estado a perder), penáltis falhados (defendidos ou ao lado), grandes defesas e grandes ocasiões falhadas (xG ≥ `momentos.xgGrande`). São estruturados; `src/ui/jogo/momentos.ts` escreve-os em pt-PT e inglês (chaves `momento.*`). O comentário minuto a minuto continua a ser o RZ-131.
- **Cartões e lesões:** entram no relatório com RZ-106 e RZ-107, quando o motor os gerar.

## 7. Táticas (RZ-108)

Código: `formacoes.ts` (formações e efeitos, sem dependências), `tatica.ts` (treinador), parâmetros em `parametros.tatica`. `EquipaJogo.tatica` é opcional; sem ela usa-se `TATICA_PADRAO` (4-3-3, equilibrado, tudo a 3, fair play normal), que não muda nada.

**Uma tática** = formação + estilo + intensidade, linha e ritmo (1-5, 3 = normal) + fair play (1 cavalheiro · 2 limpo · 3 normal · 4 duro · 5 agressivo).

- **8 formações:** 4-3-3, 4-4-2, 4-2-3-1, 4-1-4-1, 3-5-2, 5-3-2, 3-4-3, 4-3-1-2. O efeito vem das posições realmente em campo (quanto é defesa, meio e ataque, com extremos e MO partidos ao meio e laterais a alas nos sistemas de três centrais), em pontos de força relativos ao 4-3-3. Cada formação tem um perfil diferente (há um teste).
- **Estilo:** *bonito* (mais bola, menos faltas; só rende com técnica, escala com o controlo da equipa), *equilibrado*, *direto* (menos bola, mais cantos com remate de cabeça, mais faltas; ganha ataque contra linhas altas) e *contra-ataque* (cede bola; ganha ataque e defesa quanto mais controlo o adversário tem). Assim o contra-ataque rende ao mais fraco e o bonito ao mais forte.
- **Intensidade:** mais controlo e defesa e mais faltas, mas **cansa**: a força cai depois do minuto 30, mais com intensidade e ritmo altos (`fadiga`).
- **Linha:** alta dá controlo e ataque mas expõe a defesa.
- **Ritmo:** mais oportunidades para os dois lados (a média dos dois ritmos).
- **Fair play:** multiplica as faltas (0,7 … 1,45) e dá ou tira pontos de defesa. Os custos — cartões, lesões do adversário, relação com árbitros e imagem — chegam com RZ-106, RZ-107 e o árbitro do RZ-127; até lá o fair play duro sai-lhe barato.
- **Calibração** (`tatica.test.ts`): entre equipas iguais, nenhuma tática muda os pontos por jogo em mais de 0,3; o contra-ataque dá mais pontos ao mais fraco e o jogo bonito ao mais forte.

**Treinador.** `perfilTreinador(seed, id, personalidade, qualidadeTática)` deriva as preferências, de forma estável: 3 **formações favoritas** (ambicioso e vaidoso → ofensivas), estilo (vaidoso → bonito; impaciente → direto; modesto → contra-ataque), intensidade (ambição), linha (ambição + vaidade), ritmo (impaciência), fair play (temperamento alto e integridade baixa → duro) e **flexibilidade** (qualidade tática alta e vaidade baixa). `escolherEquipa` escolhe a formação que maximiza o valor médio do onze mais um bónus pela preferência (1.º favorito 100 %, 2.º 66 %, 3.º 33 %) multiplicado por `1 − flexibilidade`: o teimoso insiste nas favoritas mesmo com o plantel errado, o flexível escolhe o melhor onze. As preferências ainda não são guardadas na base de dados (derivam da seed, do id e da personalidade); evoluem e ficam guardadas com RZ-208/209.

## 8. Cartões e castigos (RZ-106)

**No jogo** (`simulador.ts`, `parametros.jogo.cartoes`). Cada falta pode dar cartão: vermelho direto (raro; mais provável num penálti), senão amarelo; quem já tem amarelo e vê outro é expulso (evento `cartao` amarelo seguido de vermelho com `segundoAmarelo`). A probabilidade escala com o **fair play** da equipa (0,5 … 1,8) e com a agressividade do infrator. Quem já tem amarelo joga com mais cuidado (menos faltas, menos cartões). O expulso sai do onze, não volta com `alterarEquipa` e a equipa perde pontos de ataque, controlo e defesa por cada jogador a menos (`penalizacaoExpulso`); se for o guarda-redes, fica sem guarda-redes (ainda sem banco). Calibração (`cartoes.test.ts`): ≈ 4,1 amarelos e ≈ 0,18 vermelhos por jogo; com dez, a equipa marca menos e sofre mais.

**Relatório e registo.** Os cartões entram no `RelatorioJogo` (`cartoes`, amarelos e vermelhos por jogador, minutos até à expulsão, nota, momento-chave «expulsão»). `registoDoJogo` guarda factos `CA` e `CV` (`extra` «2A» no vermelho por segundo amarelo) e os minutos jogados do expulso.

**Castigos** (`src/engine/disciplina/castigos.ts`, `parametros.disciplina`). Derivam dos factos, nada se apaga:
- amarelos acumulam por competição e época; de 5 em 5, um jogo de suspensão;
- vermelho por segundo amarelo: 1 jogo; vermelho direto: 1 jogo e, com 35 % de probabilidade, mais um (até 4), sorteado de forma estável por seed, jogo e jogador;
- cumpre-se nos jogos seguintes **do clube na mesma competição**; quem está suspenso não joga nem acumula cartões; um castigo pendente passa para a época seguinte (`pendenteInicial`).

`estadoDisciplinar` (puro) e `suspensosDoClube` (lê `Repositorio.cartoes` e `jornadasJogadas`) dizem quem falha o próximo jogo; `semSuspensos` tira-os dos candidatos ao onze. Quem chama (loop de jogos, RZ-109/119) filtra o plantel antes de montar a equipa.

## 9. Lesões e forma (RZ-107)

Código em `src/engine/lesoes/` (`lesao.ts`, `forma.ts`, `estado.ts`), parâmetros em `parametros.lesoes`.

- **Risco** (`riscoPor90`): base ≈ 1,6 % por jogador e jogo (≈ 0,36 lesões por jogo, as duas equipas), multiplicada por: **forma** baixa (fadiga e calendário apertado), **relvado** mau (0-1, `EntradaJogo.relvado`), aptidão física baixa, **staff médico** fraco (`EquipaJogo.medico`, 1-20), **fair play duro do adversário** (1 cavalheiro ×0,75 … 5 agressivo ×1,5), **intensidade** alta, **cansaço** durante o jogo e **recaída** (quem regressou há menos de 28 dias da mesma lesão: `JogadorEmCampo.recaida`).
- **Lesão** (`sortearLesao`): gravidade 1 ligeira (40 %, 3-10 dias) · 2 moderada (33 %, 10-28) · 3 grave (18 %, 28-70) · 4 muito grave (7 %, 70-180) · 5 gravíssima (2 %, 180-300); o tipo depende da gravidade (pancada, muscular, entorse, tendão, ligamentos, fratura). Staff médico bom encurta a paragem (±2 % por ponto); uma recaída é do mesmo tipo e dura ×1,35.
- **No jogo:** o lesionado sai e não volta (nem com `alterarEquipa`). Se há `banco`, entra o suplente da mesma posição (guarda-redes só por guarda-redes) e há um evento `substituicao`; sem suplente a equipa joga com menos um (mesma penalização de um expulso). A escolha livre de substituições e o limite de 5 continuam no RZ-215.
- **Relatório e registo:** minutos de quem saiu e de quem entrou, lesão por jogador, momento-chave «lesão»; factos `L` (`gravidade:n`) e `S` (`sai:<id>`); participações dos suplentes (`titular: false`); `registoDoJogo` devolve os eventos `LESAO` para acrescentar com `acrescentarEvento`.
- **Histórico e estado** (`estado.ts`): cada lesão é um evento público `LESAO` (`{ tipo, gravidade, dias, ate, recaida, jogo?, minuto? }`, entidades pessoa «lesionado» + clube + jogo). `estadoFisico` diz se está lesionado hoje, quantos dias faltam, se regressou há pouco (risco de recaída) e quantas lesões tem; `lesionadosDoClube` e `semLesionados` filtram o plantel antes de montar o onze.
- **Forma** (`formaDoJogador`): 1 descansado; cada jogo e cada 90 minutos nos últimos 14 dias cansam, os dias de descanso recuperam; quem regressa de lesão volta a 0,8 e sobe 0,02 por dia. Vai para `JogadorEmCampo.forma`.
- **Ainda por ligar** (loop de dias, RZ-109/119): sortear lesões de **treino** (`pTreinoPorDia`) e escrever os eventos; calcular a forma e o `recaida` de cada jogador antes de cada jogo.

## 10. Níveis de detalhe e histórias (RZ-109)

Código: `jogo/detalhe.ts` (`nivelDoJogo`, `jogarJogo`), `jogo/historias.ts`, parâmetros em `parametros.historias`.

**Um só motor.** Medido com o mundo gerado (298 clubes, jogos entre clubes de todos os escalões, a escrever no repositório em memória): **≈ 0,6 ms por jogo**, 4 500 jogos (uma época de todo o mundo) em ≈ 3 s. Não compensa manter um segundo simulador «estatístico» que divergisse do primeiro, por isso os níveis mudam **o que se devolve e guarda**, não como se joga:

| | nível 0 (jogos do clube do gamer) | nível 1 (todos os outros) |
|---|---|---|
| eventos minuto a minuto | devolvidos (jogo ao vivo, comentário) | não |
| relatório | completo: estatísticas e nota de cada jogador, todos os momentos | público: golos, cartões, lesões, estatísticas das equipas, homem do jogo |
| `participacao.nota` | todos | só o homem do jogo |
| factos (G, A, P, CA, CV, L, S), participações, eventos `LESAO` | iguais | iguais |
| histórias | iguais | iguais |

Assim os resultados, marcadores, castigos e lesões são **exatamente** os mesmos em qualquer nível (há um teste), e as histórias surgem em todo o lado. `nivelDoJogo(casa, fora, clubeGamer)` dá 0 se o jogo envolve o clube do gamer e 1 nos restantes. Ligas estrangeiras e agregados («só números», lod 2-3) chegam com o RZ-403, com o seu próprio modelo.

**Histórias** (`historiasDoJogo`, eventos públicos para acrescentar a seguir ao `registarJogo`): `HATTRICK` (3 golos), `CARTAO_VERMELHO`, `GOLEADA` (4 de diferença), `GOLO_NOTAVEL` (reviravolta de quem chegou a perder por 2; golo nos últimos 3 minutos que decide o jogo ou salva o empate). Frequências por jogo, entre equipas iguais: hat-trick ≈ 1,6 %, goleada ≈ 4 %, vermelho ≈ 19 %, golo notável ≈ 4 %. Lesões têm os seus eventos (§9).

## 11. Ligação ao resto

- `registoDoJogo(...)` converte o resultado em `JogoNovo` + factos (G, A, P) + participações, prontos para `Repositorio.registarJogo` (RZ-122 liga isto ao calendário).
- Fora desta tarefa, de propósito: jogo ao vivo com ritmo e pausa (RZ-130) e comentário (RZ-131). Os eventos já trazem os dados de que precisam.

## 12. Classificações e jornadas (RZ-110)
- `competicao/classificacao.ts`: `ordenarClassificacao(linhas, jogos, criterios, ctx)` aplica os critérios de `desempate.liga|promocao` por ordem. Confronto direto = mini-tabela só com os jogos entre os empatados, reaplicada aos subgrupos que continuam empatados; `sorteio` é determinístico (seed + competição + época + clube); `reputacaoMenor` favorece o clube de menor reputação. Cada linha indica `desempatePor` (o critério que o separou).
- `competicao/jornadas.ts`: `estadoCompeticao` (jornada atual, jogos por jogar, atrasos, próxima data, terminada) e `jogosParaJogar` (o que o loop de dias deve jogar hoje, atrasados primeiro). Um jogo jogado tem o mesmo id do `JogoAgendado`.
- `competicao/tabela.ts`: fachada sobre o `Repositorio` (`tabelaDaCompeticao`, `estadoDaCompeticao`); inclui clubes que ainda não jogaram.

## 13. Laboratório (RZ-139)
`src/engine/laboratorio/`: `jogoLab` (um jogo entre dois clubes, com formação e estilo por equipa, nível 0) e `ligaLab` (uma liga inteira ao nível 1, calendário real, tabela com desempates, artilheiros, médias). Lê o mundo do save, **não grava nada** (a liga corre num repositório em memória). Interface em `/laboratorio`. Serve para dar feedback e calibrar à vista enquanto o ciclo de dias (RZ-119) não existe.
