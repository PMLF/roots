# Raízes — Sistema de personalidade (RZ-004)

Um só sistema para **todas** as pessoas (jogadores, treinadores, olheiros, agentes, presidentes de clube e de Câmara, empresários, dirigentes de adeptos, árbitros) e, em versão coletiva, para os adeptos de um clube. O objetivo não é psicologia realista: é **gerar enredo barato e previsível o suficiente para o jogador aprender a lê-lo**.

Liga-se a `Pessoa.personalidade` e `Pessoa.memoria` (MODELO_DADOS §5) e escreve no histórico (RZ-005).

## 1. Princípios

1. **Poucos traços, efeitos claros.** 8 traços; cada um tem uma frase de efeito que o jogador percebe ("é vaidoso, gosta de ser elogiado em público").
2. **Traços fixos, memória variável.** Os traços mudam muito devagar (§6). O que muda depressa é a **memória**: promessas, favores, ofensas, e a **relação** com cada pessoa.
3. **Parcialmente oculto.** O jogador vê os traços de quem conhece bem, de forma aproximada (rótulos, não números). Olheiros e relatórios revelam mais (RZ-202). Conhecer gente é gameplay.
4. **Determinístico.** Toda a aleatoriedade vem do gerador com seed (MODELO_DADOS §0).
5. **Um motor de decisão** para tudo: uma função pontua opções e escolhe; os módulos (contratos, reuniões, mercado) só definem as opções e o contexto.

## 2. Traços (1-20)

| Traço | Baixo (1-5) | Alto (16-20) | Usado em |
|---|---|---|---|
| `ambicao` | contenta-se, fica onde está | quer subir, sai por um escalão acima | transferências, renovações, autarcas que querem obra |
| `lealdade` | mercenário | fica por menos, resiste a propostas | contratos, cláusulas "regresso à terra" |
| `vaidade` | indiferente ao reconhecimento | exige estatuto, mimos e notícias | reuniões, salários, bónus de imagem |
| `paciencia` | quer resultados já | aguenta projetos longos | treinadores, autarcas, adeptos |
| `integridade` | aceita atalhos, corrupção, mentiras | cumpre sempre, recusa jogo sujo | promessas, licenciamento, árbitros, empresários |
| `ganancia` | pede pouco | maximiza dinheiro | agentes, jogadores, empresários |
| `temperamento` | calmo | explosivo (cartões, discussões) | disciplina em jogo, relação com o treinador |
| `profissionalismo` | desleixado | dedicado | desenvolvimento, lesões, forma |

**Estilos de gestão (só treinadores e presidentes):** `exigencia`, `autonomia`, `abertura a jovens` — não são traços universais, são parâmetros do papel (RZ-208/209).

**Dados já existentes.** Os autarcas em `data/cidades.csv` têm `ambicao`, `vaidade`, `paciencia`, `integridade` em escala 1-10 → ×2 na importação. `apoio_desporto` (1-10) **não é traço**: é uma *atitude* da Câmara perante o desporto (§5.3); guarda-se em `Pessoa.atitudes.apoioDesporto`.

## 3. Geração

1. Cada pessoa nasce com um **arquétipo** pesado pelo seu papel e origem; depois soma-se ruído.
2. Arquétipos iniciais (exemplos, pontos de partida de cada traço em 1-20):
   - *Líder de balneário*: lealdade 15, profissionalismo 16, temperamento 8
   - *Estrela caprichosa*: vaidade 17, ganância 15, lealdade 6
   - *Operário*: profissionalismo 17, ambição 9, vaidade 6
   - *Pavio curto*: temperamento 18, integridade 9
   - *Autarca de obra*: ambição 16, vaidade 15, paciência 7
   - *Autarca discreto*: vaidade 5, paciência 15, integridade 14
   - *Agente tubarão*: ganância 18, lealdade 5, integridade 7
   - *Empresário local*: lealdade 14 à cidade, vaidade 13
3. `traço = clamp(round(arquétipo + gauss(0, 2.5)), 1, 20)`.
4. Ajustes por contexto: jogador **natural da cidade do clube** → lealdade +3 ao clube; países de origem difícil → +2 de profissionalismo (cultura de trabalho, regra opcional); treinador veterano → paciência +2.

## 4. Memória e relação

### 4.1 Memória

```ts
type MemoriaEvento = {
  id: number;
  com: PessoaId | ClubeId | CidadeId;   // sobre quem é
  tipo: 'promessa_cumprida' | 'promessa_falhada' | 'favor' | 'ofensa' |
        'elogio_publico' | 'minutos_injustos' | 'bom_tratamento' | 'traicao' | 'ajuda_financeira';
  peso: number;          // -10..+10 na origem
  data: Data;
  decai: boolean;        // memórias "marcantes" não decaem
};
```

- Cada evento relevante (RZ-005) com a pessoa como alvo gera uma entrada de memória, escalada pelos traços: o `peso` da promessa falhada é multiplicado por `1 + (integridade_da_vítima − 10)/20`; um elogio público vale `×(1 + vaidade/20)`.
- **Decaimento:** `peso_atual = peso × 0.5^(meses / meia_vida)`. Memórias positivas: meia-vida 12 meses. Memórias negativas: `6 + (20 − paciencia) × 0.6` meses (paciência 20 → 6 meses; paciência 1 → ~17). Memórias `decai=false` (traição, ajuda decisiva) ficam a 50 % para sempre.
- Limite: guarda-se no máximo 40 memórias por pessoa; as de menor `|peso_atual|` são fundidas num resumo (`relacao.base`).

### 4.2 Relação

```ts
type Relacao = { de: PessoaId; para: PessoaId|ClubeId|CidadeId; confianca: number; /* -100..+100 */ respeito: number; /* -100..+100 */ base: number; };
```

`confianca = base + soma(peso_atual das memórias sobre essa entidade)`, saturada em ±100. **Confiança** responde a "cumpre o que promete?"; **respeito** a "é competente/bem sucedido?" (sobe com resultados, estatuto, reputação). A confiança só existe para quem tem memórias partilhadas, o resto assume `base`.

## 5. Decisão

Todas as decisões de pessoas usam a mesma função:

```ts
escolher(pessoa, opcoes, contexto) -> opcao
// utilidade(o) = Σ  w[traço] * efeito(o, traço)  +  relacao(pessoa, parte).confianca * k  +  ruido
```

onde cada opção declara `efeito` por traço (vetor) e cada módulo define pesos. Exemplos:

### 5.1 Jogador — renovar / aceitar proposta
- Valor da oferta (salário, estatuto) × `ganancia/10`.
- Projeto: subida de escalão proposta × `ambicao/10`.
- Cidade/clube: `lealdade/10 × (ligacaoCidade ? 2 : 1)` a favor de ficar.
- Minutos prometidos e cumpridos pesam `×(confianca/50)`.
- Se a utilidade de ficar < utilidade da melhor saída − limiar(`lealdade`) → pede para sair ou recusa renovação.

### 5.2 Jogador — reação a minutos e promessas
- Se `minutos_recebidos < minutos_prometidos` durante 3 jogos: gera `minutos_injustos`, com peso `−2 × (vaidade/10)`, `moral −`, e `temperamento` alto aumenta a hipótese de queixa pública (notícia).
- Promessas cumpridas somam `+` e baixam o limiar de renovação.

### 5.3 Autarca (presidente da Câmara)
- Decide o **prémio de 1 M€** (RZ-307): pontua obras no estádio, centro de treinos, infraestrutura da cidade e fundo geral.
  - `apoioDesporto` e `vaidade` → estádio/obras visíveis; `paciencia` alta → fundo para academia; `integridade` baixa → desvio para obra "amiga" (consequência política, F3).
- Apoio anual ao clube = `orcamento_municipal × percentagem(apoioDesporto, ambicao) × relacao(clube).confianca modificada`.
- Eleições (RZ-308): o novo autarca é gerado com arquétipo condicionado pelo resultado da eleição (a cidade "castiga" o autarca se o clube foi mal tratado).

### 5.4 Agente
- Pede comissão `∝ ganancia`; muda de lado por uma melhor proposta se `lealdade` baixa; avisa o jogador de propostas escondidas se `integridade` alta.

### 5.5 Treinador
- `paciencia` determina tolerância a derrotas antes de pedir reforços/demitir-se; `vaidade` reage a ser contornado pelo presidente-jogador (RZ-210); a **confiança do treinador** é a `Relacao.confianca` do treinador para o jogador.

### 5.6 Empresário e adeptos
- Empresário local: investe em patrocínios se `lealdade` à cidade e `respeito` pelo clube altos; retira-se se `integridade` baixa e o clube fica envolvido em escândalo.
- **Adeptos (coletivo):** não são pessoas individuais no MVP. Têm um vetor médio `{paciencia, exigencia, fidelidade}` derivado da história do clube (tradição), mais uma `Relacao` com o presidente. Afeta assistência (RZ-115/310) e humor.

## 6. Mudança dos traços

- Os traços mudam só em **marcos**: título, descida, escândalo, mudança de país, nascimento de um filho (opcional), reforma. Cada marco move 1-2 traços em ±1.
- Idade: `profissionalismo` e `paciencia` sobem lentamente até aos ~32; `temperamento` desce ligeiramente após os 30.
- Nunca muda de forma abrupta por uma só decisão do jogador.

## 7. Visibilidade (UI)

- Pessoa nova: sem traços visíveis.
- Depois de 3 interações ou de um relatório do olheiro/agente: aparecem 2-3 **rótulos** (ex.: "Ambicioso", "Mercenário", "Leal à terra").
- Rótulo = faixa do traço: 1-5 "baixo", 6-14 "médio" (sem rótulo), 15-20 "alto"; ruído do olheiro: a faixa pode vir trocada com probabilidade `p(qualidade do olheiro)`.

## 8. Eventos de histórico produzidos

`PROMESSA_FEITA`, `PROMESSA_CUMPRIDA`, `PROMESSA_FALHADA`, `RENOVACAO`, `PEDIDO_SAIDA`, `QUEIXA_PUBLICA`, `APOIO_CAMARA`, `CORTE_APOIO`, `MARCO_PERSONALIDADE`. Cada um referencia as `entidades` envolvidas para o arquivo/hall of fame.

## 9. Interface do módulo (src/engine/personalidade)

```ts
gerarPersonalidade(rng, papel, contexto): Personalidade
registarMemoria(pessoa, evento): void
relacao(a, b, data): Relacao
escolher<T>(pessoa, opcoes: Opcao<T>[], contexto, rng): T
rotulos(pessoa, observador): Rotulo[]
```

Funções puras (sem I/O) para testar com 50 épocas sem interface.

## 10. Testes de aceitação

1. Mesma seed e mesmas decisões → mesmas personalidades e decisões.
2. Promessa falhada de peso −6 desce a confiança de uma pessoa com `integridade` 18 mais do que a de uma com `integridade` 4.
3. Memória positiva decai: após 24 meses, `peso_atual ≈ peso/4` (meia-vida 12); memórias com `decai=false` ficam a 50 %.
4. Um jogador com `lealdade` 18 e ligação à cidade aceita renovar por salário inferior ao de um com `lealdade` 5 em ≥ 80 % das amostras.
5. Autarca com `apoioDesporto` baixo e `integridade` baixa não destina mais de 20 % do prémio ao clube em ≥ 70 % das amostras (calibrável).
6. Distribuição agregada de traços ≈ média 10, desvio ≈ 3 sem arquétipos; com arquétipos, nenhum traço fica colado a 1 ou 20 em mais de 5 % da população.

## 11. Decisões e pontos em aberto

- **Escala:** 1-20, como no FM; a importação converte autarcas do CSV (1-10).
- **Em aberto:** número final de traços (8 propostos); se os adeptos devem ter personalidade individual (RZ-909); ~~se a corrupção entra no MVP~~ (decidido: entra no MVP, RZ-127).
