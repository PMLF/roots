# Raízes — A cidade, o estádio e a política

Decisões do Pedro a 15-10-2026. Complementa `DESIGN_REGRAS` §5 (setores e sinergias) e `PERSONALIDADE` §5.3 (autarca).

## 1. Princípios

1. **A cidade é um painel de variáveis e de projetos** (D7), não um *city builder*. O mapa da cidade (RZ-506) é só de visualização, para a cidade do gamer.
2. **O gamer influencia, não manda.** É presidente do clube, não da Câmara. Propõe, negoceia, cofinancia, promete. Quem decide é o autarca, segundo a personalidade dele.
3. **Níveis de detalhe.** A cidade do gamer atualiza **todos os meses**; as outras 276 **uma vez por ano**, de forma mais simples.
4. **Tem lado negativo.** Cidades encolhem, fábricas fecham, obras atrasam e geram queixas. Os clubes **não desaparecem** no MVP (crise → coima, vendas); falência e refundação ficam em RZ-908.

## 2. Variáveis da cidade

| Variável | Escala | Ritmo (cidade do gamer) | O que a move |
|---|---|---|---|
| `populacao` | habitantes | anual | natalidade, migração, setor, emprego, orgulho/notoriedade |
| `emprego` | 0-100 | mensal | setor, eventos económicos (fecho de fábrica) |
| `economia` | 0-100 | mensal | setor, turismo, fundos, política |
| `turismo` | 0-100 | mensal (sazonal) | setor `TUR`, notoriedade, transportes, clima |
| `transportes` | 0-100 | projetos | obras, apoio municipal |
| `estacionamento` | 0-100 | projetos | obras, valor do solo |
| `habitacao` (valor do solo) | 0-100 | anual | população, estádio e obras na zona |
| `orgulho` | 0-100 | mensal | resultados, derbis, subidas, escândalos |
| `notoriedade` | 0-100 | mensal | resultados, imprensa, história |
| `cultura_futebol` | 0-100 | anual | tradição, resultados, escolinhas; ver §6 |
| `financas_municipais` | receita, dívida | anual | orçamento (`data/cidades.csv`), eleições, prémio do Estado |
| `apoio_desporto` | 0-100 | eleições | atitude do autarca e da Câmara |

Derivado: **bacia de adeptos** = população × `cultura_futebol` × identidade × proximidade (§5).

## 3. O que o gamer pode fazer na cidade

- **Propor projetos** à Câmara: acessos ao estádio, estacionamento, transportes, um hotel, melhoria do relvado municipal.
- **Cofinanciar** (clube paga parte; Câmara, Estado/UE ou patrocinadores pagam o resto).
- **Reuniões** com autarca, empresários, associação de adeptos e imprensa local, com escolhas e consequências.
- **Promessas** (cumprir ou falhar altera confiança, `PERSONALIDADE` §4).
- **Programas comunitários:** escolinhas, jogos solidários, dia do clube.
- **Pedir licenças e autorizações** para obras.

O autarca decide pela função de utilidade da personalidade (custo, visibilidade para a vaidade, duração para a paciência, legalidade para a integridade, retorno eleitoral perto das eleições).

## 4. Propriedade do estádio

Cada estádio é **do clube, municipal ou partilhado** (`estadio_prop` em `data/clubes.csv`, valor inicial por escalão, a rever).

| Propriedade | Efeitos |
|---|---|
| Clube | Controla obras e receitas, paga a manutenção; precisa só de licenças |
| Municipal | Paga renda (ou cedência simbólica), **precisa de autorização da Câmara** para obras, depende do autarca |
| Partilhada | Obras por acordo; receitas e custos repartidos; tensões na renegociação |

Valores iniciais: Primeira Liga ~50 % clube; Distritais ~75 % municipais. A propriedade pode mudar por evento (compra, cedência, transferência).

## 5. Construir ou mudar de estádio

Um **novo estádio** (ou grande reconstrução) passa por etapas, todas com decisão do gamer:

1. **Necessidade:** licença em risco, lotações esgotadas, estado do estádio, ambição.
2. **Projeto:** capacidade, tipo, serviços (VIP, centro de treinos, loja).
3. **Local**, entre as opções disponíveis na cidade (§5.1).
4. **Financiamento:** clube, Câmara, Estado/UE, patrocinador (naming rights), venda do terreno antigo.
5. **Aprovação e licenciamento** (setor `PAT` duplica os prazos; estádio municipal precisa da Câmara).
6. **Construção por fases.**
7. **Onde jogar durante a obra** (§5.2).
8. **Inauguração** (evento, notícia, impacto nos adeptos).

### 5.1 Onde construir

A cidade só oferece algumas opções (depende da densidade, do valor do solo, do setor e do autarca): **mesmo local**, **perto** (até ~2 km), **periferia ou fora do centro**.

| | Mesmo local | Perto (≤ ~2 km) | Periferia / fora do centro |
|---|---|---|---|
| Custo do terreno | baixo (já é teu ou municipal) | médio | baixo a médio |
| Prazo | longo (demolir e reconstruir) | médio | médio |
| Jogos durante a obra | **noutro estádio** | **no antigo** até inaugurar | **no antigo** até inaugurar |
| Capacidade máxima | limitada pelo espaço | média | **alta** |
| Relação com os adeptos | **mantém identidade** (+) | ligeira perda (−) | **perda notória** (−), depende da fidelidade; protestos possíveis |
| Transportes públicos | existentes (+) | bons, a ajustar | **fracos** sem investimento |
| Estacionamento e acessos de carro | limitados | médios | **bons** |
| Terreno antigo | — | pode ser vendido/reconvertido | pode ser vendido; financia parte da obra |
| Vizinhança e queixas | altas durante a obra | médias | baixas |
| Valor do solo à volta | sobe com a obra | sobe | **cai** na zona antiga |

A **assistência** passa a incluir um fator de **distância** ao centro e à população: `assistencia ∝ bacia × f(distancia, transportes, estacionamento)`. Mudar para fora gera, no primeiro ano, queda; recupera se houver transportes.

### 5.3 Estatísticas de localização e envolvente do estádio

Todos os estádios têm estas estatísticas (`MODELO_DADOS` §4, valores iniciais em `data/clubes.csv`):

| Campo | O que mede | Efeitos principais |
|---|---|---|
| `zona` + `distanciaCentroKm` | proximidade do centro (centro, perto, periferia, fora) | assistência (adeptos a pé), identidade, valor do solo, protestos se mudar |
| `transportes` | qualidade dos transportes públicos até ao estádio | assistência (especialmente jogos grandes), visitantes, jovens |
| `acessoRodoviario` | estradas e acessos de carro | assistência de fora do concelho, visitantes, trânsito |
| `estacionamento` + lugares | quantidade e qualidade | assistência de carro, receitas de parque, queixas |
| `envolvente` | infraestrutura à volta (hotéis, bares, comércio) | receitas de dia de jogo, turismo de jogo, notoriedade |
| `terrenoExpansao` | espaço para ampliar | capacidade máxima da obra, custo, opções de local |
| `vizinhanca` | densidade residencial perto | queixas, restrições de ruído e horários, custo das obras |

- **Inicial:** gerado por cidade e clube: cidades maiores têm melhores transportes e envolvente, mas pior estacionamento e menos terreno; estádios na periferia têm mais acessos de carro, estacionamento e terreno; Interior e ilhas têm piores transportes.
- **Evolução:** a cidade melhora ou degrada (RZ-304, obras e projetos); o clube investe (RZ-303); mudar de estádio (§5.1) reinicia estas estatísticas.
- **Assistência:** `assistencia ∝ bacia × forma × importância × f(zona, transportes, acessoRodoviario, estacionamento, envolvente) × …`; jogos com muito público ou visitantes grandes dependem mais de transportes e acessos.
- **Visibilidade:** estas estatísticas são **públicas** (qualquer pessoa vê o estádio), exceto detalhes de estado técnico, que exigem observação.

### 5.2 Jogar durante a obra

Se o estádio antigo é demolido ou fica em obras, o clube joga num **estádio temporário**: outro estádio da cidade (partilhado com um clube local, se existir), de uma cidade vizinha (renda + viagem) ou um recinto menor. Efeitos: capacidade reduzida, `distancia_km`, renda, queda de assistência e de receitas, desgaste de relação com os adeptos. A escolha é do gamer, com as opções que existirem.

## 6. Cultura de futebol e jogadores da terra

- Cada concelho tem `cultura_futebol` (0-100). Valor inicial em `data/cidades.csv`: base 35 + setor + melhor escalão local + tamanho + ruído. **São estimativas**, a rever.
- Pesa, junto com a população, em **quantos jogadores nascem** no concelho e na qualidade do viveiro (RZ-103, RZ-212).
- Alimenta o regresso à terra (RZ-207), o arquivo dos que escaparam (RZ-204) e a bacia de adeptos.

## 6b. Localidades: aldeia, vila e cidade (RZ-136)

O **concelho** é a «cidade» do jogo (Câmara, orçamento, autarca); o clube vive numa **localidade** dentro dele. O Sporting Moita dos Ferreiros é de uma aldeia do concelho da Lourinhã; o CD Matelense, da aldeia de Matela, em Vimioso. Cada localidade tem:

- `população` e `estatuto`: **aldeia**, **vila** ou **cidade**. Dados de arranque em `data/localidades.csv` (gerado por `tools/build_data.py` a partir de `data/src/localidades.txt`); a sede do concelho tem população estimada a partir do concelho. O estatuto de arranque deriva da população (limiares abaixo), por isso pode diferir do estatuto oficial real.
- **Limiares** em `parametros.localidade`: vila a partir de 1 500 habitantes, cidade a partir de 8 000, com **histerese de 10 %** (`avaliarEstatuto` em `src/engine/localidade/estatuto.ts`): uma aldeia só passa a vila ao chegar a 1 650 e uma vila só volta a aldeia ao cair abaixo de 1 350. Assim o estatuto não oscila de época para época.
- **Evolução** (RZ-309, ainda por fazer): uma vez por época, a população de cada localidade reage ao clube — assistência média e adeptos que o jogo traz, financiamento do clube e da Câmara, estádio, jogadores da terra. O motor chama `avaliarEstatuto` e `atualizarLocalidade`; uma mudança de estatuto grava o evento público `LOCALIDADE_ESTATUTO` (notícia: «Matela sobe a vila»). O concelho continua a ser a unidade das variáveis da §2.
- No MVP cada localidade tem pelo menos um clube; as sedes sem clube e as freguesias vizinhas entram com o gerador de clubes novos (RZ-126).

Em dados: um clube pertence a **uma** localidade (`clube.localidade_id`), e esta a **um** concelho. Várias localidades do mesmo concelho podem ter clube (Lourinhã e Moita dos Ferreiros).

## 7. Empresas

No MVP, os **patrocínios dependem do setor** da cidade (sem empresas individuais). **Empresários com nome e personalidade** (RZ-311) são das primeiras coisas a entrar a seguir ao MVP.

## 8. Política

- **Sem partidos reais.** Partidos fictícios ou listas independentes com um eixo simples (esquerda, centro, direita). O autarca tem uma tendência que influencia apoios e conflitos.
- **Eleições autárquicas de 4 em 4 anos:** um autarca novo pode cortar ou aumentar o apoio, segundo o humor da cidade.
- **Eventos fictícios mas credíveis:** fundos europeus, orçamento do Estado, crises, novas autoestradas, fecho de fábricas, regras das SAD.
- **Região (polo)** — explicação: hoje o `polo` é só uma etiqueta que agrupa concelhos próximos (ex.: "Ria de Aveiro"). A opção adotada é que um **evento regional** (fundos europeus para o Alentejo Central, uma autoestrada nova) afeta todos os concelhos do polo, e que a "Rota do Futebol" funciona entre eles. A alternativa, mais pesada e adiada, seria cada região ser um **ator** com orçamento e presidente próprios, a repartir fundos entre concelhos (e o Governo Regional dos Açores e da Madeira com personalidade própria). Fica no parking lot.

## 9. Dados e estimativas

- População, setores, polos e orçamento municipal (`data/cidades.csv`) são **estimativas**, aceites para já. Possível melhoria: importar os Censos 2021 do INE.
- `cultura_futebol` e `estadio_prop` são novos e deterministas (mesmo resultado a cada geração), a rever.

## 10. O que entra em cada fase

| Fase | Entra |
|---|---|
| F1 (MVP) | Página da cidade: variáveis estáticas e evolução anual simples, autarca, clubes, sinergias básicas (RZ-133); propriedade do estádio; obra de ampliação simples (RZ-116) |
| F3 | Modelo completo (RZ-301), sinergias (302), infraestruturas (303-304), propriedade e licenciamento (305, 315), pessoas e reuniões (306), prémio e Câmara (307), política (308), novo estádio com escolha do local (314), efeitos cidade ↔ clube (309-310) |
| Depois do MVP, prioridade alta | Empresários e patrocínios locais (311) |
| P3 | Mapa visual da cidade do gamer (506), regiões como atores |

## 11. A cidade no MVP (RZ-133) — decisões do Pedro a 16-10-2026

- **Visibilidade:** os números verdadeiros (0-100) ficam escondidos, como as finanças dos rivais. A interface vê **cinco níveis em palavras** (muito baixo … muito alto), a **tendência** face à época anterior (sobe, estável, desce) e o histórico por época. A **população é pública** (número exato). O orçamento da Câmara aparece em palavras, relativo às outras cidades (por habitante).
- **Variáveis acompanhadas:** população, economia, emprego, turismo, orgulho no clube, notoriedade e cultura de futebol. Transportes, estacionamento e valor do solo ficam para os projetos (RZ-303/304).
- **Evolução anual, para as 276 cidades**, no fecho de época (a 1 de julho começa a seguinte): cada indicador regride 20 % para um **alvo** (setor, tamanho e melhor clube da terra) com ruído; **título**, **subida** e **descida** de clubes da terra mexem no orgulho e na cultura de futebol; a população varia por setor, economia e orgulho, no máximo ±3 % ao ano. Parâmetros em `parametros.cidade`.
- **Acontecimentos aleatórios já no MVP** (probabilidade anual por cidade e por polo; pesos por setor): fecho e abertura de fábricas, fundos europeus, autoestrada nova, festival, mau ano agrícola, crise regional, incêndios, expansão da universidade e hotel novo. Os **regionais** atingem todos os concelhos do polo. Cada um é um evento público `CIDADE_EVENTO` (vira notícia) e mexe nos indicadores desse ano. Efeitos diretos nos clubes (patrocínios, assistência) ficam para RZ-310.
- **Autarca:** nome, mandato e atitude em palavras (apoio ao desporto; «vaidoso», «discreto», «ambicioso» só como reputação pública). Os traços finos descobrem-se por conversas e reuniões (RZ-165). **Mandato fixo** (2025-2029) até haver eleições (RZ-308), que têm de chegar antes de 2029.
- **Outras cidades:** a ficha é igual para todas e só mostra o que é público; nada de finanças do clube nem relações internas (coerente com a demissão, RZ-118).
- **Armazenamento:** sem tabela nova. O estado de cada cidade é o último evento **privado** `CIDADE_EPOCA` (números verdadeiros, `valida` = época a que se aplica); antes do primeiro fecho, o estado de arranque reconstrói-se da seed. Tudo reconstruível a partir do log.
- **Fora do MVP, por decisão:** localidades dentro do concelho continuam com a evolução própria (RZ-309); a população do concelho e a das localidades ainda não estão ligadas.


## 12. Interação cidade – empresas – clubes (desenho, 18-10-2026)

Decisões do Pedro: serviços **saúde, educação, mobilidade, habitação e segurança**; qualidade do viveiro **sobretudo da cidade**; equilíbrio por **custos do sucesso** (sem tetos artificiais); **uma só página «Local»** com secções por nível. Todos os números são **ponto de partida**, a calibrar com o harness (RZ-123) e vivem em `parameters.ts`.

### 12.1 O ciclo e as ligações

Três atores — **cidade** (concelho e localidade), **empresas** e **clubes** — ligados por sinais claros. Cada ligação tem **origem, destino, ritmo e efeito**; nada mexe em nada «por magia».

| De → Para | Sinal | Ritmo | Efeito |
|---|---|---|---|
| Cidade → clube | população × cultura de futebol × educação | anual | **teto do viveiro** (§12.3) |
| Cidade → clube | economia + empresas locais | anual | patrocínios (já existem), oferta de mecenas |
| Cidade → clube | orgulho, mobilidade, segurança | por jogo | assistência (bacia × acesso × risco) |
| Cidade → clube | saúde | por lesão | dias de recuperação (−/+ até 15 %) |
| Cidade → clube | habitação (custo de vida) | anual | ordenados pedidos e custo das obras |
| Cidade → clube | orçamento e prioridades da Câmara | anual | apoio a obras, prémio do Estado, renda do estádio |
| Clube → cidade | resultados, subidas, títulos | época | orgulho, notoriedade, turismo, cultura de futebol |
| Clube → cidade | assistência e estádio | época | emprego local, valor do solo em redor, população (lenta) |
| Clube → cidade | escolinhas e formação | época | cultura de futebol e educação desportiva |
| Empresas → cidade | emprego (trabalhadores) e capital | anual | `emprego` e `economia` calculados a partir delas (§12.5) |
| Empresas → clube | patrocínio, mecenato, obras, direitos | contrato | dinheiro e contrapartidas |
| Cidade → empresas | economia, população | anual | crescimento e falência (já existe) |
| Autarca → tudo | orçamento por área | anual | serviços, projetos, licenças |

### 12.2 Variáveis novas: os serviços

Cinco variáveis 0-100 por **concelho**, ocultas, mostradas em palavras com tendência (como em §11), com alvo por tamanho e setor e regressão anual de 20 % como as existentes (§11):

| Serviço | O que o move | Efeito principal |
|---|---|---|
| `saude` | orçamento municipal para saúde, população, empresas `health`, eventos (incêndios, crises) | recuperação de lesões; atração de população |
| `educacao` | orçamento para educação, universidade (evento existente), população jovem | **qualidade do viveiro** (§12.3) |
| `mobilidade` | transportes e estacionamento (RZ-303/304), obras, autoestrada | assistência (quem vem de fora), turismo, acesso ao estádio |
| `habitacao` | custo do solo e rendas: população, turismo, estádio e obras na zona | ordenados pedidos, custo das obras, saída de jovens |
| `seguranca` | orçamento, desemprego, dimensão | risco de incidentes em jogos de grande afluência, turismo |

`transportes`, `estacionamento` e `valor do solo` da §2 passam a ser **`mobilidade`** e **`habitacao`** (menos variáveis, mais legíveis); os projetos (RZ-303/304) mexem nelas diretamente.

### 12.3 O viveiro vem da cidade

Dois passos, para que a terra defina o **teto** e o clube decida **quanto desse teto aproveita**:

1. **Teto do concelho** (por ano): `teto = f(população^0,6 × cultura_futebol × (0,6 + 0,4 × educacao))`. Define o **número** de jovens a nascer com potencial de formação (já existe: população × cultura) e desloca a **média do potencial** da geração (p. ex. de −0,5 a +0,5 desvios). Uma aldeia com muita tradição e boa escola dá poucos mas bons; uma cidade grande dá muitos, a qualidade média acompanha a educação.
2. **Aproveitamento do clube** (0,4 a 1,0 do teto): escolinhas e equipas jovens, treinadores de formação e centro de treinos/academia (RZ-303), tempo de investimento (a formação demora anos a render), e `presidente paciente` (`youthFocus`). Um clube pobre numa terra rica aproveita pouco; um clube rico numa terra pobre aproveita muito mas o teto é baixo. Sobretudo cidade: a diferença entre extremos do teto (~×3) é maior que entre extremos do aproveitamento (×2,5).

Aos **jogadores da terra** (RZ-207) soma-se o efeito «orgulho»: mais jovens do concelho a querer ficar. Quem sai do viveiro e não fica pode ser **comprado por um clube maior** (custo do sucesso, §12.7).

**Implementado (RZ-234, 1.ª parte).** Cada concelho gera por ano uma geração de jovens sem clube (15–17 anos, `prospect`): `n = perCityMean × teto / teto médio` (arredondado por sorteio) e o potencial desloca-se até ±`potentialShift` pontos com o teto (educação ainda não entra: RZ-233). Na passagem de época, cada clube que precisa de um jovem procura primeiro um da sua cidade (depois do seu distrito) cuja qualidade encaixe no escalão e na posição; só se não houver cria um jovem «de raiz». Quem ninguém contrata sai do futebol. O separador **Talento local** da cidade mostra os sem clube e, à parte, os da terra que já jogam em clubes (qualquer idade, com o clube); o gamer só vê estrelas dos que observou e pode propor contrato aos dois grupos.

### 12.4 O clube devolve à cidade

Fecho de época, em `cidades.ts` (já faz título/subida/descida): acrescenta-se **assistência média** (emprego e turismo de dia de jogo), **estádio** (obras dão emprego e puxam o solo), **escolinhas** (cultura de futebol e educação desportiva, lenta: ~+1/ano no máximo), **população** (RZ-309: ±3 %/ano, ligada à economia e ao orgulho; a da localidade segue a do concelho com a fatia do clube). Nenhum efeito é imediato: tudo é **anual e lento**, para a cidade parecer viva e não um botão.

### 12.5 As empresas no meio

Papéis (cada um com ligação a RZ já existente):

- **Empregadores** — cada empresa tem `employees` (função do capital, escala e setor). `emprego` do concelho passa a ser **calculado** a partir da população ativa e do total de postos nas empresas locais; um fecho grande (RZ-219) mexe visivelmente no emprego e na economia (já há o evento «fábrica fecha»: passa a ser consequência de uma empresa real). **Dependência**: um concelho com uma empresa dominante sofre mais quando ela falha.
- **Patrocinadores** (existe) — com **concentração**: uma empresa que patrocina clube e estádio e a câmara é uma relação a vigiar (influência, §12.6).
- **Mecenas** — empresários doam para obras (estádio, escolinhas, serviços) com **contrapartida** (naming, visibilidade, influência, favor). A decisão depende da personalidade do dono (`PERSONALIDADE`: vaidade, generosidade, integridade).
- **Fornecedores de obras** (RZ-303) — empresas `construction`: o custo e o atraso dependem da escala e da integridade do dono (obra barata e atrasada vs. cara e certa); ligadas a licenças e corrupção (RZ-127).
- **Parceiros de serviços** — empresas `health`, `transport`, `energy`, `media` financiam ou executam parte dos serviços (mexem em `saude`, `mobilidade`) quando o orçamento da Câmara não chega.
- **Compradores de direitos** (RZ-218, existe) e **lobby** — donos podem apoiar candidatos nas eleições e pedir terrenos e licenças; **interesses em conflito** geram notícias e decisões.

### 12.6 O autarca e o orçamento

- **Orçamento municipal** (já existe, relativo em palavras): receita por habitante + transferências do Estado + prémio do Estado (RZ-112/307).
- **Repartição por áreas** (desporto, saúde, educação, mobilidade, habitação, segurança, cultura): o autarca reparte-o pela sua **função de utilidade** (§3: custo, visibilidade, paciência, integridade, retorno eleitoral) e pelo **humor da cidade** (o que está pior pesa mais). O gamer só **influencia** (propõe projetos, cofinancia, promete); os projetos competem pelo mesmo orçamento.
- **Eleições** (RZ-308, 4 em 4 anos): reeleição = f(orgulho, emprego, serviços, escândalos, obras prometidas e cumpridas). Autarca novo ⇒ **novas prioridades** (e novas relações com empresas). Promessas falhadas custam confiança.

### 12.7 Custos do sucesso (anti-bola-de-neve)

Em vez de tetos, **crescer custa**; tudo é efeito de variáveis que já existem, anual e visível nas páginas:

1. **Habitação**: mais população e estádio ⇒ solo e rendas caros ⇒ ordenados pedidos e obras mais caras; jovens saem para fora (menos teto no viveiro a prazo).
2. **Expectativas**: orgulho alto sobe o limiar de «bom resultado»; derrotas e descidas doem mais quanto mais alto se subiu (queda de orgulho assimétrica).
3. **Ordenados e reputação**: jogadores e agentes pedem mais a clubes com reputação alta (já na renovação); a massa salarial sobe mais depressa que a receita se o clube não fizer vendas.
4. **Concorrência**: os clubes maiores compram os melhores jovens (propostas da IA, M3) e clubes vizinhos disputam a bacia de adeptos quando também sobem.
5. **Pressão**: Câmara e empresários exigem retorno (naming, assistência, obras); mecenas com contrapartidas limitam a margem.
6. **Congestionamento**: assistência alta com `mobilidade`/`seguranca` baixas gera incidentes, coimas e quebra de turismo até haver obra.
7. **Dependência**: patrocinador ou empregador dominante que falha deixa um buraco.

**Calibração** (RZ-123, 50 épocas): distribuição de reputação e de caixa (sem clube a «fugir»: quantis estáveis), mobilidade de escalão, taxa de underdogs que sobem e se mantêm, proporção de clubes com saldo negativo, e que a população das cidades não diverja (cidades pequenas não desaparecem; grandes não explodem).

### 12.8 Uma só página «Local»

`/profile/?type=locality&id=…` passa a ser a **única** página de lugar (aldeia, vila ou cidade); `type=city` redireciona para a **sede** do concelho. Dados: **população, clubes, empresas, cultura de futebol e pessoas** são da localidade; **serviços, Câmara, política e orçamento** são do concelho e aparecem como contexto.

| Secção | Aldeia | Vila | Cidade (sede) |
|---|---|---|---|
| Resumo (indicadores em palavras e tendência) | sim | sim | sim |
| Clubes e estádios | sim | sim | sim |
| Pessoas (autarca/presidente de junta, empresários, adeptos) | curto | sim | sim |
| Empresas (as maiores por setor e emprego) | só locais | sim | sim, com filtros |
| Serviços (os cinco) | só os do concelho, resumidos | sim | sim |
| Câmara (orçamento, prioridades, projetos, eleições) | cartão «Câmara de X» (ligação à sede) | cartão | secção completa |
| História e acontecimentos | sim | sim | sim |

### 12.9 Fatias (ordem sugerida) — ver BACKLOG RZ-233…RZ-238

1. **RZ-233** serviços (estado, evolução, eventos, palavras).
2. **RZ-238** página «Local» única (UI cedo, para mostrar as fatias seguintes).
3. **RZ-234** viveiro da cidade (teto × aproveitamento).
4. **RZ-235** empresas ↔ cidade (empregos, mecenato, fornecedores).
5. **RZ-236** orçamento municipal, autarca e eleições.
6. **RZ-237** custos do sucesso e calibração de 50 épocas.
