# Raízes — Geração do mundo (pessoas, nomes, saves)

Cada save gera o seu próprio mundo a partir de uma **seed**: mesmos clubes, cidades e rivalidades (`data/`), mas **pessoas diferentes**. Complementa `MODELO_DADOS` §5-8 e §15.

## 1. O que se gera

| Quem | Quantos (MVP) | Notas |
|---|---|---|
| Jogadores de clubes portugueses (298 clubes) | ~7 500 (25 por clube; 28 nos escalões superiores) | plantel completo com posições equilibradas |
| Jogadores sem clube / reserva livre | ~3 000 | para o mercado e para os distritais |
| Jovens e academias | sob demanda (lod 2) | nascem quando alguém os vê ou o clube precisa |
| Staff (treinadores, adjuntos, médicos, olheiros…) | ~1 800 (5-8 por clube) + ~500 livres | |
| Presidentes de clube, autarcas (275), empresários locais, dirigentes de adeptos | ~1 500 | autarcas: traços a partir de `cidades.csv` |
| Agentes, árbitros, jornalistas | ~600 | árbitro mínimo para a corrupção (RZ-127) |
| **Total** | **~15-25 mil pessoas** | |
| Ligas estrangeiras (depois, RZ-403) | +2 500 por liga detalhada; o resto lod 3 | |

## 2. Quanto demora (protótipo medido)

Protótipo em Node + SQLite (gerar pessoa com 45 atributos e 8 traços e inserir na base; simular uma época de ~3 300 jogos com 50 oportunidades cada, a escrever golos e cartões):

| Tarefa | Protótipo | Estimativa real (×10-30 mais complexo, WASM no browser) |
|---|---|---|
| 25 000 pessoas | 0,2 s | 3-8 s |
| 100 000 pessoas | 0,8 s | 12-30 s |
| 1 época simulada | 0,07 s | 1-4 s |
| Pré-história (30 épocas) | 2 s | 30-120 s com simulação leve; ~10 s se só gerar resultados finais |

**Conclusão:** criar um save demora **cerca de 10-30 segundos** (mais 30-60 s se quiseres pré-história com jogos simulados), em *Web Worker* com barra de progresso. Não são minutos. Se algum dia ficar lento (muitos países, muita pré-história), geramos **sob demanda** (lod 2) em vez de tudo à cabeça. Os números reais saem do harness (RZ-123) e do RZ-103.

## 3. Pipeline

1. **Seed e parâmetros** do save (aleatória ou escolhida).
2. **Pré-cálculo:** distribuições por escalão, tabela de países (`data/paises.csv`), listas de nomes.
3. **Para cada clube:** número de lugares por posição, nacionalidades (§4), qualidade-alvo pela reputação do clube e do escalão (§5), idades, contratos.
4. **Para cada pessoa:** nome (§6) → dados pessoais → atributos por posição → potencial oculto → personalidade (arquétipo + ruído, `PERSONALIDADE` §3) → contrato.
5. **Pessoas fora do futebol** (autarca, empresários, dirigentes) com traços e laços à cidade.
6. **Validação:** sem nomes famosos (bloqueio), posições cobertas, distribuição de qualidade por escalão, folha salarial dentro do orçamento do clube.
7. **Pré-história opcional** (`origem='gerado'`): resumos de ~30 épocas por clube, para marcos tipo "primeira subida em 40 anos".

Tudo determinístico (seed + gerador explícito).

## 4. Nacionalidade por escalão e clube

Percentagem de estrangeiros (ponto de partida, a calibrar):

| Escalão | Estrangeiros (média) | Variação |
|---|---|---|
| Primeira Liga | ~55 % | clubes grandes ~70 %, os mais pequenos ~40 % |
| Segunda Liga | ~30 % | |
| Terceira Liga | ~15 % | |
| Campeonato de Portugal | ~8 % | |
| Distritais | ~3 % | |

Dentro de cada escalão, o clube sobe ou desce conforme a **reputação** e as **finanças**. Quem é estrangeiro vem de países com peso `w(país → Portugal)`:

`w = peso_de_nascimento(país) × afinidade(país, Portugal) × (0,5 + qualidade_necessária(escalão))`

- **Afinidade alta:** países de língua portuguesa (Brasil, Cabo Verde, Angola, Guiné-Bissau, Moçambique), Espanha, França (diáspora), África francófona, América do Sul.
- **Cauda rara:** qualquer país do mundo tem probabilidade pequena mas diferente de zero de produzir um bom jogador (`MODELO_DADOS` §15).
- Portugueses incluem luso-descendentes e naturalizados (nascidos no estrangeiro).
- Para clubes portugueses de escalões baixos: o jogador estrangeiro vem sobretudo com ligação ao distrito (família emigrada, estudantes, trabalhadores).

## 5. Atributos, posições e roles

- **Posições:** GR, DD, DC, DE, MDC, MC, MO, ED, EE, PL, com aptidão 1-20 por posição.
- **Atributos** (1-20): técnicos, mentais, físicos, e específicos de GR. Cada posição tem um **perfil** (médias e desvios) a que se soma a qualidade individual.
- **Qualidade-alvo** do plantel: depende do escalão e da reputação do clube; os melhores jogadores do mundo (cauda) só aparecem em países de índice alto, ou raramente fora deles.
- **Roles** (p. ex. "defesa construtor", "ponta-de-lança móvel") **não se guardam**: são calculados dos atributos (adequação a cada role), para evoluírem com o jogador.
- **Potencial** é oculto; cada olheiro vê uma estimativa com erro (`HISTORICO_EVENTOS` §5).
- **Dados pessoais:** nome completo + nome desportivo, data e local de nascimento (concelho para portugueses), altura, peso, pé preferido, nacionalidades, naturalidade que liga à cidade. A **vida pessoal** (família, relações, hábitos) gera-se **sob demanda** para a imprensa cor-de-rosa (RZ-313).

## 6. Nomes

- **Por nacionalidade**, com frequência real:
  - Portugal: 1-2 nomes próprios + 1-2 apelidos (materno e paterno), com nome desportivo (p. ex. primeiro e último).
  - Brasil: semelhante, mais nomes compostos.
  - Espanha e América hispânica: 2 apelidos.
  - França, Alemanha, Reino Unido, Itália, Países Baixos, África (francófona, lusófona, anglófona), Balcãs, Europa de Leste, Ásia Central, Ásia, etc.: listas e regras próprias.
- **Países sem lista:** gerador por fonética (sílabas típicas da família linguística) como alternativa.
- **Dados:** listas escritas por nós (sem dados do FM). Começamos com ~35 países e crescemos; é conteúdo (RZ-132).
- **Anti-colisão:** lista de bloqueio com nomes de futebolistas e personalidades conhecidos, para a combinação aleatória não gerar uma pessoa real.
- **Unicidade:** duas pessoas podem partilhar nome, mas a mesma combinação completa + data de nascimento não se repete.

## 7. Impacto no motor e na base de dados

- `pessoa` guarda o fixo (nome, nascimento, nacionalidade, personalidade); atributos em colunas ou JSON compacto (45 números por jogador). O potencial real fica em campo "verdade" que a `Vista` não devolve.
- Geração em **Web Worker** com barra de progresso; transação única por lote.
- Reutilizável para gerar novos jogadores todos os anos (juniores, regens), clubes novos (RZ-126) e árbitros.

## 8. Estado da implementação (RZ-103 / RZ-132)

- Código em `src/engine/mundo/` (`gerarMundo`, `jogador`, `nomes`, `listas`, `bloqueio`, `paises`, `talento`, `validar`) e `src/engine/personalidade/gerar.ts`. Dados: `data/paises.csv` (51 países, 19 famílias de nomes).
- **Determinismo:** cada clube, a cidade, os "outros" e os livres têm o seu fluxo (`Rng.derivar`). Acrescentar um clube de outro escalão não muda os plantéis dos restantes; dentro do mesmo escalão a reputação é normalizada pelo conjunto do escalão.
- **Qualidade:** `qualidadeAlvo` por escalão + deslocação pela reputação (`qualidadePorReputacao`); a idade desconta os jovens e os veteranos; a qualidade atual é a média dos atributos-chave da posição, e o potencial nunca fica abaixo dela.
- **Nacionalidade:** % de estrangeiros do escalão × (1 ± `estrangeirosVariacaoReputacao` consoante a reputação); país sorteado por `pesoParaPortugal × densidade(q | país)`, com a cauda rara.
- **Medido (298 clubes):** ~13,8 mil pessoas (9,4 mil jogadores, 3 mil sem clube), ~2,5 s a gerar. Menos do que os ~15-25 mil da tabela do §1 porque ainda não há juniores nem academias (lod 2, sob demanda) nem ligas estrangeiras.
- **Visibilidade:** a verdade (atributos, potencial, personalidade) fica nas tabelas `jogador`/`pessoa`; `pessoaPublica`, `plantelPublico` e `cargosPublicos` devolvem só factos públicos e é por aí que a `Vista` lê. O clube só vê atributos/potencial/personalidade dos seus jogadores depois de `observarPlantelProprio`.
