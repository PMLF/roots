/**
 * Lista de bloqueio (RZ-132): combinações de nome que identificam pessoas reais conhecidas.
 * Só serve para impedir que o gerador as produza por acaso; nunca aparece no jogo.
 * Comparação sem acentos, maiúsculas nem hífenes. Cresce com o conteúdo.
 */
const normaliseName = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-'’.]/g, " ").replace(/\s+/g, " ").trim();

const BLOCKED = [
  "luis figo", "joao felix", "bruno fernandes", "bernardo silva", "ruben dias", "diogo costa", "diogo jota", "joao cancelo",
  "ricardo quaresma", "rui patricio", "nuno mendes", "pedro neto", "jose mourinho", "antonio costa", "rafael leao", "goncalo ramos",
  "joao moutinho", "ruben amorim", "paulo bento", "fernando santos", "nuno santo", "vitor baia", "paulo futre", "rui costa",
  "deco souza", "nani silva", "ricardo carvalho", "paulo ferreira", "jorge jesus", "sergio conceicao", "marco silva", "carlos queiroz",
  "pedro pauleta", "helder postiga", "simao sabrosa", "miguel veloso", "raul meireles", "tiago mendes", "pedro mendes", "joao pinto",
  "lionel messi", "kylian mbappe", "erling haaland", "luka modric", "karim benzema", "robert lewandowski", "harry kane", "david silva",
  "sergio ramos", "sergio busquets", "thiago silva", "gabriel jesus", "marcelo vieira", "daniel carvajal", "luis suarez", "andres iniesta",
  "xavi hernandez", "iker casillas", "carles puyol", "gerard pique", "diego costa", "diego maradona", "pele nascimento", "ronaldo nazario",
  "ronaldo lima", "rivaldo ferreira", "paulo dybala", "angel di maria", "sergio aguero", "carlos tevez", "javier mascherano",
  "thierry henry", "zinedine zidane", "paul pogba", "antoine griezmann", "olivier giroud", "franck ribery", "eden hazard", "kevin de bruyne",
  "romelu lukaku", "thibaut courtois", "manuel neuer", "thomas muller", "toni kroos", "mesut ozil", "bastian schweinsteiger",
  "wayne rooney", "steven gerrard", "frank lampard", "david beckham", "john terry", "jordan henderson", "jack grealish",
  "gianluigi buffon", "andrea pirlo", "francesco totti", "paolo maldini", "alessandro del piero", "mario balotelli",
  "samuel eto o", "didier drogba", "yaya toure", "sadio mane", "mohamed salah", "riyad mahrez", "achraf hakimi",
  "son heung min", "kim min jae", "marcelo rebelo", "luis montenegro", "pedro passos", "jose socrates", "anibal cavaco",
] as const;

export const BLOCK_LIST: ReadonlySet<string> = new Set(BLOCKED.map(normaliseName));

export const isBlocked = (name: string, list: ReadonlySet<string> = BLOCK_LIST): boolean => list.has(normaliseName(name));
