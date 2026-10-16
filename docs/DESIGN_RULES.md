# Raízes — Regras de base: pirâmide, prémio do Estado, distritais e sinergias

> Estado: **proposta v1** (14-10-2026). Todos os números são pontos de partida para calibrar com simulações (ver BACKLOG). Os valores entre `PARÂMETRO` vivem num único ficheiro de configuração.

## 1. A pirâmide

| Escalão | Liga | Clubes | Sobem | Descem |
|---|---|---|---|---|
| 1 | Primeira Liga | 20 | — | 3 |
| 2 | Segunda Liga | 20 | 3 | 3 |
| 3 | Terceira Liga | 20 | 3 | 4 |
| 4 | Campeonato de Portugal (CP) | 4 séries × 10 = 40 | 4 (1 por série) | **8** (= promovidos da Fase de Promoção) |
| 5 | 20 ligas distritais | 10 inicial (8 a 14) | até 8, via **Fase de Promoção** | ver §4 |
| — | *Segunda distrital* (clubes que o jogo não simula) | variável | — | — |

**Distritos = 18 continentais + Açores + Madeira (20).** Tal como no ficheiro original, Açores e Madeira contam como um distrito cada (backlog: dividir os Açores pelas 3 associações).

### Séries do CP e grupos da Fase de Promoção (geográficos, 5 distritos cada)
| Série / Grupo | Distritos |
|---|---|
| A — Norte | Viana do Castelo, Braga, Porto, Vila Real, Bragança |
| B — Centro | Aveiro, Viseu, Guarda, Coimbra, Castelo Branco |
| C — Centro-Sul | Leiria, Santarém, Lisboa, Setúbal, Portalegre |
| D — Sul e Ilhas | Évora, Beja, Faro, Açores, Madeira |

A série D inclui as ilhas: voos e custos de viagem entram na simulação (sinergia `ILH`).

### Fase de Promoção (nova)
Os **20 campeões distritais** não sobem diretamente. Disputam, depois de acabarem as distritais, a **Fase de Promoção**:
- 4 grupos de 5 campeões (os mesmos das séries A-D), todos contra todos a uma volta (4 jogos cada, mando alternado).
- Os **2 primeiros de cada grupo** sobem ao CP, para a série correspondente: **8 promovidos por ano**.
- Critérios de classificação: pontos, confronto direto, diferença de golos, golos marcados; em empate total, ganha o de menor reputação (promoção) ou sorteio estável (liga). Ordem configurável em `desempate` (`parametros.ts`); o confronto direto usa mini-tabela entre os empatados e reaplica-se aos que continuam empatados (`src/engine/competicao/classificacao.ts`).
- Um campeão que não cumpra o licenciamento é substituído pelo 2.º classificado da sua distrital.
- `PARÂMETRO PROMO_POR_GRUPO = 2`.

Efeito no CP: saem 4 (sobem à Terceira Liga) + 8 (descem) = **12 de 40 (30%)**, e ficam 28; é próximo da realidade e deixa um clube recém-promovido fixar-se. Descidas por série: `descem_da_série = promovidos_para_a_série + descidos_da_Terceira_Liga_nessa_série − 1` (assim cada série volta aos 10 clubes; com 2 promovidos e 1 descido da Terceira Liga por série são 2 descidas).

## 2. Ordem de operações no fim da época

1. Fecham-se todas as classificações finais (incluindo distritais).
2. **Prémio do Estado por distrito** (§3), calculado sobre as classificações finais, antes de qualquer movimento.
3. **Fase de Promoção** dos 20 campeões distritais.
   - **Fase final do CP** (decidido a 16-10-2026): acabadas as séries (até 25 de abril), os quatro campeões de série jogam **meias-finais e final a jogo único**, em domingos, até maio. Meias-finais: melhor contra pior e segundo contra terceiro (pontos por jogo, diferença, golos, menor reputação), em casa o melhor classificado; empate decide-se nos penáltis. O vencedor é o **campeão do CP** (prémio extra, RZ-216). Os campeões de série sobem à Terceira Liga na mesma.
4. Movimentos entre escalões 1→2→3→CP (com os números da tabela); descidas do CP calculadas com a fórmula do §1.
5. Descidas do CP entram na liga distrital do **seu** distrito; promovidos saem da sua distrital para o CP.
6. Reajuste do tamanho das distritais (§4).
7. Licenciamento de estádios e requisitos por escalão (ver BACKLOG; por omissão, licença provisória de 1 época com coima).
8. Eleições autárquicas (de 4 em 4 anos), novos orçamentos e eventos de verão.

## 3. Prémio do Estado por distrito

`PARÂMETRO PREMIO_CLUBE = 2_000_000 €` · `PARÂMETRO PREMIO_CIDADE = 1_000_000 €`

- **Quem:** em cada um dos 20 distritos, o clube **mais bem classificado da pirâmide** nessa época.
- **Critério de "melhor classificado":** 1.º escalão mais alto; 2.º posição final na tabela (no CP, dentro da série); 3.º pontos por jogo; 4.º diferença de golos; 5.º golos marcados; 6.º, em empate total, ganha o clube de **menor reputação** (favorece o *underdog*).
- **Clube:** recebe `PREMIO_CLUBE` na tesouraria, **de uso totalmente livre** (decisão do Pedro).
- **Cidade:** a **Câmara do concelho do clube** recebe `PREMIO_CIDADE` no orçamento municipal. Não vai automaticamente para o clube: o presidente da Câmara decide, de acordo com a personalidade (`apoio_desporto`, `ambição`, `vaidade`) e com as promessas feitas. Cria jogo político: reunião, pedido de obra no estádio, ou o dinheiro desaparece numa rotunda.
- **Notícias e história:** evento "Melhor do distrito" no histórico e no jornal; contador de anos seguidos por distrito.

**Efeito esperado:** o valor é pequeno para quem já está na Primeira Liga (≈10% de um orçamento de 20 M€) mas enorme em baixo: **3× o orçamento mediano de um clube do CP e ~30× o de uma distrital**. Nos distritos sem grandes clubes, o melhor do distrito recebe um impulso real; em Lisboa e Porto o prémio cai quase sempre no mesmo sítio e vale pouco. Para a Câmara, 1 M€ pesa muito mais em concelhos pequenos (Corvo, Barrancos, Marvão) do que em Lisboa.

**Riscos a vigiar:** (a) bola de neve em distritos onde o mesmo clube ganha sempre; (b) inflação do prémio ao longo de décadas (ligar a um índice).

## 4. Distritais de tamanho variável

`PARÂMETROS DIST_ALVO=10, DIST_MIN=8, DIST_MAX=14`

Cada época, cada distrito perde **p** clubes (0 ou 1: o campeão, se subir na Fase de Promoção) e recebe **r** despromovidos do CP:

```
n_seguinte = n_atual − p + r
```

- **p=1, r=0**: a liga perde um clube (a tua regra original).
- **p=0, r=0 ou p=r**: fica igual.
- **r > p** (várias descidas do mesmo distrito): a liga **cresce, até `DIST_MAX`**. O excedente, os **piores classificados** dessa época (os acabados de chegar do CP ficam protegidos no 1.º ano), desce para a **segunda distrital** (divisões inferiores não simuladas, guardam a história e podem voltar).
- **Abaixo de `DIST_MIN`:** a liga é completada com clubes da segunda distrital desse distrito (os que desceram há menos tempo). Se a segunda distrital estiver vazia, **nasce um clube novo** (ver abaixo).
- Calendários com número ímpar de clubes têm folga por jornada.

### Como nasceria um clube novo
É só gerar um registo, não é uma simulação nova:
1. Escolher um concelho do distrito (pesos por população; quase todos já têm clube, mas muitos têm um segundo).
2. Nome por modelos (`GD/CD/AD/SC/Atlético/União` + localidade), cores e estádio genéricos, alcunha derivada do nome da terra.
3. Estatísticas pela mesma regra dos clubes distritais (reputação 800-1 800, finanças e capacidade em função da população), personalidade e presidente do clube gerados.
4. Notícia ("Nasceu o X, fundado por um grupo de amigos / pela junta de freguesia") e entrada no histórico.
Com a Fase de Promoção as promoções são em média 8 por ano em 20 distritos, por isso a segunda distrital chega quase sempre; o gerador é uma rede de segurança (backlog RZ-126). No MVP, se a segunda distrital estiver vazia, a liga joga com menos clubes (aviso só para developers). **O campeão sobe sempre**, mesmo que a liga fique abaixo do mínimo, por verdade desportiva (decidido a 16-10-2026).

**Segunda distrital:** não existe como competição no jogo, mas os clubes «sabem» que jogam nela; a interface mostra o clube nessa liga, sem ligação. **Se o clube do gamer cair para lá, é despedido automaticamente** e o clube deixa de ser jogável até voltar à pirâmide.

## 5. Sinergias clube ↔ cidade

Cada clube pertence a um **concelho** (= a Câmara e o orçamento municipal). Cada concelho tem **setor principal**, **setor secundário** (efeito a 50%) e **polo regional**. Açores e Madeira recebem automaticamente a marca `ILH`.

### 5.1 Setores (valores iniciais, a calibrar)
| Código | Setor | Efeitos principais no clube |
|---|---|---|
| TUR | Turismo/praia | Bilheteira de verão +15%, inverno −5%; patrocínios +10%; população flutuante |
| MAR | Mar/pesca/porto | Patrocínios estáveis e adeptos fiéis; mau tempo pode adiar jogos |
| IND | Indústria | Patrocínios +10%, mas evento "fecho de fábrica" (patrocínios −20%, assistência −10%) |
| AGR | Agricultura/vinho | Cooperativas patrocinam; assistência cai nas vindimas/colheitas |
| UNI | Universidade | Jovens baratos e mais olheiros; assistência segue o calendário letivo |
| LOG | Logística/caminho-de-ferro/aeroporto | Mais adeptos visitantes; acessos melhores; patrocínios de transportes |
| PAT | Património/cultura | Turismo cultural; obras no estádio demoram o dobro (licenças) |
| INT | Interior | Despovoamento lento, adeptos muito fiéis, apoios do Estado/UE ao Interior, viagens longas |
| FRO | Fronteira | Olheiros em Espanha −50% de custo; jogadores ibéricos disponíveis |
| TER | Termas/saúde | Lesões −10%; staff médico mais barato; estágios de pré-época |
| EMI | Emigração | Agosto: donativos e assistência +; sócios no estrangeiro |
| DOR | Dormitório/periferia | Muita população, pouca identidade: assistência/população baixa; adeptos "emprestados" aos grandes |
| ENE | Energia | Orçamento municipal maior; patrocínios de empresas de energia; sensível a política |
| SER | Serviços/administração | Patrocínios de valor alto; concorrência por atenção |
| MUL | Comunidades lusófonas/imigrantes | Rede informal de olheiros em países lusófonos (−30% custo); bacia de jovens diversa |
| ILH | (automático) Ilhas | Viagens ×2–3 (voos), apoio do Governo Regional, "dérbi das ilhas", jornadas agrupadas |

### 5.2 Ligações entre clubes e entre cidades
- **Rival (`rival` em clubes.csv; `rivalidades.csv` com os pares):** dérbi ×1.3 a ×1.6 de assistência (×1.6 se for mútuo), mais cartões e mais notícias. 208 pares, 90 mútuos.
- **Polo regional:** dois ou mais clubes do mesmo polo no mesmo escalão ou em escalões adjacentes criam um dérbi regional (+20% de assistência de visitantes). Com três ou mais no top 3 do polo ativa-se a **"Rota do Futebol"** (turismo e patrocínios partilhados no polo).
- **Concelho partilhado:** 2+ clubes sob a mesma Câmara (ex.: CD Charneca e UA Almada; UD Odemira e CA Zambujeira do Mar; Leixonense e Leça). O presidente da Câmara tem de repartir apoios; se um sobe e o outro não, a confiança do segundo desce.
- **Ilhas:** com 3+ clubes do mesmo grupo no mesmo escalão, desconto de viagem em voos partilhados.

### 5.3 Laços de retroalimentação
- Clube → cidade: resultados e obras sobem `orgulho` e `notoriedade`, que sobem turismo e população ao longo dos anos.
- Cidade → clube: `bacia de adeptos` (população × identidade), patrocínios (setor), apoio municipal (presidente da Câmara), viveiro de jovens.
- **Assistência (esqueleto):** `bacia × taxa_base × forma × importância × rivalidade × preço × transporte × clima × setor`, limitada pela capacidade do estádio. Importância: final ×2,5; decisão de subida/descida ×1,8; grande visitante ×(1 + 0,3 × rep_visitante/rep_casa); dérbi como acima.

## 6a. Taças (pedido do Pedro, 15-10-2026; RZ-140 a RZ-142)

- **Taça** (como a Taça de Portugal): todos os clubes, eliminatórias a jogo único com prolongamento e penáltis; os escalões altos entram mais tarde; o de escalão inferior joga em casa. **Supertaça**: campeão da Primeira Liga vs vencedor da Taça. **Taça Distrital**: uma por distrito, só com os clubes das distritais desse distrito. Taça da Liga, seleções e competições europeias ficam para depois (RZ-901, 902).

Implementação (motor, 16-10-2026): `src/engine/competition/format/` é um motor genérico de competições por fases (eliminatórias a uma ou duas mãos com entradas escalonadas e folgas, grupos, fase de liga «suíça» com potes — o formato antigo e o atual da Liga dos Campeões); cada taça é uma `CompetitionDef` em `season/competitions.ts`, com o estado guardado no save e as rondas marcadas à medida que as anteriores acabam. Datas: rondas à quarta-feira, em dias sem jogos das ligas nem pausas (`cups` em `parameters.ts`); a final da Taça é no primeiro domingo cinco dias depois do fim de tudo (ligas, Fase de Promoção e fase final do CP), por isso é o último jogo interno da época; a Supertaça joga-se seis dias antes da 1.ª jornada, entre o campeão da Primeira Liga e o vencedor da Taça (ou o finalista vencido, se for o mesmo clube); as finais da Taça e da Supertaça são em campo neutro (estádio maior que não seja de nenhum dos dois, receita repartida). Jogos a eliminar têm prolongamento (2×15') e penáltis guardados com o jogo; a fase final do CP usa o mesmo mecanismo.

## 6b. Calendário e ritmo (decidido a 15-10-2026)

- **Época:** agosto a maio, seguindo o calendário habitual da Liga Portuguesa (jornadas ao fim de semana, pausas de seleções e uma pequena pausa de Natal). As distritais e o CP seguem o mesmo ano; a **Fase de Promoção** joga-se no fim, em maio-junho.
- **Janelas de transferências:** **julho-agosto** e **janeiro**.
- **Botão Avançar:** passa **um dia** e **pára automaticamente nos eventos** (jogo do teu clube, proposta, reunião, lesão, notícia que exige resposta).
- Datas exatas e feriados ficam em parâmetros (RZ-006); o calendário de jornadas é gerado por RZ-102.

## 6. Dados incluídos (`data/`)
| Ficheiro | Conteúdo |
|---|---|
| `clubes.csv` | 300 clubes: 60 do ficheiro original + 240 novos (40 CP + 200 distritais) |
| `cidades.csv` | 276 concelhos com população, orçamento municipal, setores, polo e presidente da Câmara com 5 traços de personalidade |
| `distritos.csv` | Contagem por escalão e série do CP de cada distrito |
| `rivalidades.csv` | Pares de rivais com marcas de mútuo/mesmo concelho/mesmo polo |
| `src/` | Fontes editáveis; `python3 tools/build_data.py` regenera tudo e valida |

**Notas de honestidade:** a população dos concelhos é aproximada (Censos 2021 arredondados); os números de reputação, finanças e capacidade dos clubes novos são gerados por regras (e podem ser ajustados à mão em `data/src`); os presidentes da Câmara iniciais são fictícios; os clubes novos têm nomes inventados e inspirados em cada localidade, sem usar clubes reais.
No ficheiro original corrigi 4 gralhas (cores/mascote de Lourinhã FC, UD Santana, FC Varziela e CD Castelo de Óbidos), passei o **Serpa Atlético Clube** para a cidade de Serpa e preenchi 44 campos de alcunha/mascote que estavam vazios (sugestões rápidas em `data/src/existentes_preenchimento.txt`, para rever).

## Prémio por vencer cada competição (RZ-216)

Evento `PREMIO_COMPETICAO` ao vencedor (valores em `premios.competicoes`): Primeira Liga 10 M€; Segunda 2 M€; Terceira 500 k€; cada série do CP 100 k€ e +100 k€ ao campeão do CP (vencedor da final); Taça de Portugal 2 M€ (mais prémios por ronda); Supertaça 500 k€. Distritais (≈5 k€) e Fase de Promoção (≈10 k€) são valores médios multiplicados pelo fator do distrito: orçamento municipal total × apoio médio dos autarcas ao desporto, sobre a média dos distritos, entre 0,4 e 2,5 (`fatoresDeDistrito`). Taças Distritais ≈5 k€ pelo mesmo fator. O finalista vencido de uma taça recebe 25 %. O dinheiro só entra na tesouraria com as finanças (RZ-114).

## Finanças do clube (RZ-114 v1)

O dinheiro de cada clube é um livro: o saldo arranca no capital inicial do CSV e cada lançamento (receita positiva, despesa negativa) vai para uma categoria do mês (`bilheteira`, `patrocinios`, `comercial`, `premios`, `salarios`, `staff`, `estadio`, `fixos`). No dia 1 de cada mês o motor fecha o mês anterior de todos os clubes da pirâmide (os da segunda distrital não têm movimentos) e grava o evento privado `FECHO_FINANCEIRO`; os meses sem jogos (junho, julho) fecham ao mudar de época. Receitas: bilheteira por jogo em casa (assistência × preço do escalão; a assistência simples depende da ocupação do escalão, do valor do clube, da cultura de futebol da cidade, de dérbi, grande visitante e final), patrocínios e comercial a 1/12 por mês (base do escalão × valor do clube, `reputação / referência` elevada a 1,2, entre 0,5 e 3), prémios (Estado e competições). Despesas: salários dos contratos, staff, estádio (por lugar) e custos fixos. Valores em `parametros.financas.modelo`, calibrados (teste `financas.calibracao.test.ts`) para o clube mediano de cada escalão acabar a época perto do equilíbrio e menos de 5 % em negativo. O estado público (§5.1 de `HISTORICO_EVENTOS`) é uma palavra na ficha do clube; o teu clube vê também o saldo exato e o último fecho. Receitas de transmissões (RZ-218) e de empresas (RZ-219) substituem a categoria provisória `comercial`.

**Orçamento anual.** Cada época todos os clubes têm uma massa salarial máxima (por ano; por defeito o maior entre a massa atual e 70 % das receitas esperadas) e uma verba de transferências (35 % da folga de caixa acima de 3 meses de custos). O gamer pode alterar as duas no seu clube (a verba não passa da caixa); no arranque da época seguinte voltam ao defeito. O mercado (RZ-205 a RZ-207, RZ-213) paga e recebe pelas categorias `transferencias` (jogadores) e `compensacoes` (staff) e respeita o orçamento; os patrocínios reais (RZ-311, RZ-219) substituem a fórmula.
