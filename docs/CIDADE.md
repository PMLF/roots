# Raízes — A cidade, o estádio e a política

Decisões do Pedro a 15-10-2026. Complementa `DESIGN_REGRAS` §5 (setores e sinergias) e `PERSONALIDADE` §5.3 (autarca).

## 1. Princípios

1. **A cidade é um painel de variáveis e de projetos** (D7), não um *city builder*. O mapa da cidade (RZ-506) é só de visualização, para a cidade do gamer.
2. **O gamer influencia, não manda.** É presidente do clube, não da Câmara. Propõe, negoceia, cofinancia, promete. Quem decide é o autarca, segundo a personalidade dele.
3. **Níveis de detalhe.** A cidade do gamer atualiza **todos os meses**; as outras 275 **uma vez por ano**, de forma mais simples.
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
