# Raízes — Modelo de dados (RZ-003)

Esquema conceptual para o motor (`src/engine`). Os tipos TypeScript saem daqui. Os valores numéricos são **iniciais**: a calibração é feita no harness (RZ-123). A personalidade completa fica para RZ-004 e o formato dos eventos para RZ-005; aqui ficam só os contornos.

## 0. Princípios

1. **Normalizado e por IDs.** Cada entidade tem um `id` estável (string *slug*, p. ex. `sc-cascais`, `p-000123`). Referências entre entidades são sempre IDs, nunca objetos embutidos. O estado do jogo é um grafo plano serializável em JSON.
2. **Estado vs. histórico.** O *estado* é o agora (tabelas abaixo). O *histórico* é um log de eventos append-only (§12) de onde se reconstroem arquivos, hall of fame e crónicas. Nunca se apaga nem reescreve um evento. Persistência em SQLite; detalhes, esquema e visibilidade em `HISTORICO_EVENTOS.md`.
3. **Verdade vs. conhecimento.** Atributos, potencial, personalidade, finanças e termos de contratos são *verdade* oculta; a UI vê-os só através de observações (`HISTORICO_EVENTOS.md` §5). Estatísticas de jogo (golos, cartões, lesões, minutos) são públicas.
4. **Níveis de detalhe (D5).** Cada entidade tem `lod`: `0` detalhe total (o teu clube, adversários próximos), `1` ficha completa mas simulação estatística, `2` ficha mínima (gerada ao ser vista), `3` só agregados. Entidades promovem/despromovem de nível conforme o interesse do jogador.
5. **Determinismo.** Todo o motor recebe uma `seed` e um gerador pseudoaleatório explícito; mesma seed + mesmas decisões = mesmo mundo. Obrigatório para o harness de calibração.
6. **Sem referências a clubes reais (D6).** Dados importáveis (RZ-904) seguem o mesmo esquema.
7. **Dinheiro em euros inteiros** (`number` inteiro, sem decimais); percentagens em 0-1; atributos em 1-20; reputação e traços conforme abaixo.
8. **Tempo.** `Data = { ano, mes, dia }` (calendário real); `Epoca = ano de início` (2026 = 2026/27). O motor avança por dias; os jogos têm `jornada`.

## 1. Mundo e calendário

```ts
type GameState = {
  versao: number;            // versão do esquema, para migrações
  seed: number; rngEstado: number;
  data: Data; epoca: number;
  clubeDoJogador: ClubeId; papel: PapelJogador;
  parametros: Parametros;    // RZ-006
  // coleções por id:
  clubes, jogadores, pessoas, staff, contratos, estadios, cidades, distritos,
  competicoes, jogos, obras, promessas, noticias, ...
  historicoIndice: { ultimoEventoId: number };  // o log vive à parte (§12)
};
```

## 2. Distrito e cidade/concelho

| Entidade | Campos |
|---|---|
| **Distrito** | `id`, `nome`, `serieCP` (A-D), `ilhas: boolean`, `bolsa: ClubeId[]` (clubes do distrito fora de qualquer liga simulada), `ligaDistrital: CompeticaoId` |
| **Cidade (concelho)** | `id`, `nome`, `distrito`, `populacao`, `setor`, `tag2`, `polo`, `ilha`, `orcamentoMunicipal`, `autarca: PessoaId`, `clubes: ClubeId[]` |

Variáveis dinâmicas da cidade (RZ-301/309, F3; em F1 ficam a valores por omissão): `economia`, `turismo`, `orgulho`, `emprego`, `transportes`, `estacionamento`, `valorSoloEstadio`, `apoioClubes` (por clube), `humor`. Todas em 0-100 e atualizadas ao ritmo mensal/anual.

Fonte inicial: `data/cidades.csv` (colunas `concelho, distrito, populacao, setor, tag2, polo, ilha, orcamento_municipal, autarca, ambicao, apoio_desporto, vaidade, paciencia, integridade, clubes`).

## 3. Clube

| Campo | Notas |
|---|---|
| `id`, `nome`, `alcunha`, `mascote`, `cores`, `fundacao?` | identidade |
| `cidade: CidadeId` (concelho) e `localidade` | o concelho do CSV; a "cidade" do CSV é a localidade |
| `escalao`: `PL \| SL \| TL \| CP \| DIST` + `competicaoId` | onde joga agora |
| `reputacao` (0-10000) | cresce/decresce com resultados; escala do CSV |
| `financas`: `saldo`, `divida`, `orcamentoAnual`, `massaSalarialMax`, `patrocinios[]` | RZ-114 |
| `estadio: EstadioId` | §4 |
| `plantel: JogadorId[]`, `staff: StaffId[]`, `presidente: PessoaId` | |
| `filosofia`: pesos (formação própria, talento exótico, jogo direto, …) | RZ-209 |
| `taticaPadrao: Tatica` | §10 |
| `rival: ClubeId`, `rivais: ClubeId[]` | arestas de `rivalidades.csv` com `mutua`, etc. |
| `adeptos`: `bacia` (nº potencial), `fidelidade` 0-100, `associacao: PessoaId?` | |
| `marcos: string[]` | "primeira subida em 40 anos" (RZ-211) |
| `lod` | §0 |

`bacia` inicial = função do concelho (população e peso do clube) + reputação; `fin`, `cap` e `rep` iniciais saem de `clubes.csv`.

## 4. Estádio (por setores)

```ts
type Estadio = {
  id; nome; clube: ClubeId; cidade: CidadeId;
  setores: Setor[];            // capacidade total = soma
  relvado: { qualidade: 0..100; tipo: 'natural'|'sintetico' };
  iluminacao: 0..100; acessos: 0..100; estacionamento: number;
  bares: number; loja: 0..100; vip: number;
  licenca: { nivelMax: Escalao; validaAte: Data; provisoria: boolean };  // RZ-305
};
type Setor = {
  id; tipo: 'sentado'|'pe'|'visitantes'|'vip'|'imprensa';
  lugares: number; coberto: boolean; estado: 0..100; precoBase: number;
};
```

A capacidade do CSV (`cap`) é repartida em setores por regra (p. ex. 70 % sentados cobertos, 15 % em pé, 8 % visitantes, 2 % VIP, resto geral). Obras (RZ-116/303) são entidades próprias: `Obra { id, alvo, tipo, custo, financiamento: {clube, camara, estado}, inicio, fim, estado }`.

## 5. Pessoa e personalidade

Uma só entidade `Pessoa` para **todas** as pessoas com nome: jogadores, treinadores, olheiros, agentes, presidentes (de clube e de Câmara), empresários, árbitros, dirigentes de adeptos. Jogador e staff acrescentam extensões ligadas por `id`.

```ts
type Pessoa = {
  id; nome; nascimento: Data; nacionalidade: Pais; naturalDe?: CidadeId;
  papeis: Papel[];                       // pode ser jogador e depois treinador
  personalidade: Personalidade;          // RZ-004
  memoria: MemoriaEvento[];              // promessas cumpridas/falhadas, favores, ofensas
  lod;
};
type Personalidade = { // 1-20, detalhado em RZ-004
  ambicao; lealdade; vaidade; paciencia; integridade; ganancia; profissionalismo; temperamento; ...
};
```

O CSV de cidades já traz 5 traços para autarcas (`ambicao`, `apoio_desporto`, `vaidade`, `paciencia`, `integridade`, escala 1-10) — são um subconjunto/escala reduzida; converte-se na importação (×2).

## 6. Jogador

Extensão de `Pessoa` com `papeis` ∋ `jogador`.

| Campo | Notas |
|---|---|
| `posicoes: {pos, aptidao 1-20}[]` | GR, DD, DC, DE, MDC, MC, MO, ED, EE, PL |
| `atributos` | 1-20; técnicos (remate, passe, drible, desarme, cabeceamento, controlo, bola parada…), mentais (visão, decisão, compostura, trabalho de equipa, ambição…), físicos (velocidade, aceleração, resistência, força, agilidade, salto, equilíbrio); GR: reflexos, jogo aéreo, jogo de pés… |
| `potencial: { real, estimativaPorClube }` | **real** é oculto; cada clube/olheiro vê uma estimativa com erro (RZ-202) |
| `forma`, `moral`, `fadiga`, `nitidez` | 0-100, dinâmicos |
| `lesao?: Lesao` | RZ-107 |
| `disciplina`: amarelos por competição, `suspensoAte`/jornadas | RZ-106 |
| `contrato: ContratoId?`, `clube: ClubeId?`, `emprestadoPor?` | |
| `valorMercado`, `reputacao` | derivados |
| `ligacaoCidade?`: `{ cidade, tipo: 'natural'|'viveiro'|'adotado' }` | aceita menos dinheiro para ficar (RZ-207) |
| `carreira`: resumo (jogos/golos por época e clube) | detalhe no histórico |
| `estado`: `ativo \| livre \| reformado` | |

Evolução por época: `atributo' = atributo + delta`, com `delta` função de idade, potencial real, treinador, instalações, minutos, personalidade e acaso (RZ-117, F1 em versão simples).

## 7. Staff

Extensão de `Pessoa` com `papeis` ∋ `staff`.

`{ funcao: 'treinador'|'adjunto'|'olheiro'|'medico'|'fisio'|'comunidade'; qualidade por área (taticas, formacao jovens, motivacao, scouting, medicina…) 1-20; filosofia; regioes: Pais[]/DistritoId[] (olheiros); contrato; clubeId? }`

No MVP há 1 treinador por clube; a árvore completa chega com RZ-208.

## 8. Contrato

```ts
type Contrato = {
  id; pessoa: PessoaId; clube: ClubeId; tipo: 'jogador'|'staff';
  inicio: Data; fim: Data; salarioMensal: number;
  bonus: { golos?, jogos?, subida?, titulo? };
  clausulas: { rescisao?; percentagemRevenda?; regressoATerra?; opcaoRenovar? };  // RZ-207
  luvas?: number; estado: 'ativo'|'terminado'|'rescindido';
};
```

## 9. Competição, jogo e classificação

```ts
type Competicao = {
  id; nome; tipo: 'liga'|'fase_promocao'|'taca'; escalao; serie?: 'A'|'B'|'C'|'D'; distrito?;
  epoca; participantes: ClubeId[]; formato: { voltas: 1|2; descidas: number; subidas: number; };
  calendario: Jornada[]; classificacao: Linha[];
};
type Jogo = {
  id; competicao; jornada; data; casa; fora; importancia: number;  // multiplica a assistência
  estado: 'agendado'|'jogado'; resultado?: ResultadoJogo;
};
type ResultadoJogo = { golosCasa; golosFora; estatisticas: EstatJogo; eventos: EventoJogo[]; assistencia: number; receita: number; homemDoJogo: JogadorId };
```

`EstatJogo` guarda para cada equipa: remates, à baliza, xG, posse, cantos, faltas, amarelos, vermelhos, e por jogador: minutos, golos, assistências, nota, cartões, lesões (RZ-105). Jogos de `lod > 0` guardam só `resultado` e totais; o detalhe por jogador/evento só existe para `lod 0`.

Desempates: pontos → confronto direto → diferença de golos → golos marcados → pontos por jogo (ver DESIGN_REGRAS §3 para o prémio).

## 10. Tática

`Tatica { formacao: '4-4-2'|'4-3-3'|…(6-8); estilo: -2..+2 (bonito ↔ direto/físico); pressao, linha, ritmo, intensidade: 1-5; fairPlay: nível (RZ-108, perguntas em aberto §12.3); papeis[] }`.

## 11. Promessa, notícia, parâmetros

- **Promessa** `{ id, de: PessoaId, para: PessoaId, texto, criterio, prazo, estado: 'aberta'|'cumprida'|'falhada' }` — alimenta a `memoria` dos envolvidos.
- **Notícia** `{ id, data, tipo, titulo, corpo, entidades: Id[], importancia }` — gerada a partir de eventos (RZ-118).
- **Parametros** — um objeto único, tipado, com valores de `Clubes_Raizes.xlsx › Parâmetros` e do DESIGN (RZ-006): `PREMIO_CLUBE`, `PREMIO_CIDADE`, `DIST_ALVO/MIN/MAX`, `CP_SERIES`, `CP_TAMANHO_SERIE`, `PROMO_POR_GRUPO`, pesos de assistência, etc.

## 12. Evento do histórico

Esquema mínimo; **a versão final está em `HISTORICO_EVENTOS.md`** (visibilidade `publico|privado|secreto`, `causa`, `corrige`, factos de jogo compactos):

```ts
type Evento = {
  id: number;                // sequencial, só cresce
  v: number;                 // versão do tipo
  data: Data; epoca: number;
  tipo: 'JOGO'|'GOLO'|'CARTAO'|'LESAO'|'TRANSFERENCIA'|'CONTRATO'|'OBRA'|'ELEICAO'
      | 'PROMESSA'|'PREMIO'|'SUBIDA'|'DESCIDA'|'CLUBE_NOVO'|'FIM_EPOCA'|...;
  entidades: Id[];           // para pesquisar por jogador/clube/cidade
  dados: object;             // payload específico do tipo
};
```

Regras: nunca se altera um evento; correções entram como novos eventos; o estado atual pode sempre ser verificado contra o log (teste de consistência).

## 13. Mapeamento dos CSV atuais

| CSV | Entidades criadas |
|---|---|
| `clubes.csv` | `Clube`, `Estadio` (1 por clube; setores gerados), `Pessoa` (presidente gerado), pertença a `Competicao` (liga + série) |
| `cidades.csv` | `Cidade` + `Pessoa` (autarca com traços convertidos) |
| `distritos.csv` | `Distrito` (zona CP e contagens para validar) |
| `rivalidades.csv` | `Clube.rivais[]` com flags `mutua`, `mesmo_concelho`, `mesmo_polo`, … |

A importação (RZ-007) valida: nomes únicos, rivais existentes, 10 clubes por série/distrito, divisões 20/18/20 — as mesmas regras de `tools/build_dados.py`.

## 14. Decisões e pontos em aberto

- **Idade/saves grandes:** milhões de linhas de histórico → guardar o log em IndexedDB por blocos de época; estado em memória.
- **Jogadores gerados sob demanda** (lod 2): só se criam a ficha quando o olheiro os vê ou quando o clube precisa; a semente do clube/cidade/ano garante o mesmo jogador.
- **Em aberto:** nível de detalhe do fair play (discreto 3-5 níveis vs. contínuo); lista final de atributos (conformar com o FM, RZ-008).
