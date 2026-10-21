/**
 * Cidades dos clubes estrangeiros (RZ-264): cidades reais e conhecidas de cada país, da mais famosa para a menos (o primeiro
 * clube de cada país é o mais forte). O nome do clube junta a cidade a uma forma do país («Sevilha CF», «Manchester Athletic»);
 * formas e nomes evitam os clubes reais. As cidades vêm em português de Portugal.
 */
export type ForeignNaming = {
  /** Cidades por ordem de fama; uma cidade grande pode repetir-se com um qualificativo («Londres Norte»). */
  cities: string[];
  /** Formas do nome; `{c}` é a cidade. */
  forms: string[];
};

export const FOREIGN_NAMING: Record<string, ForeignNaming> = {
  gb: { cities: ["Londres", "Manchester", "Liverpool", "Edimburgo", "Birmingham", "Glasgow", "Londres Norte", "Newcastle", "Leeds", "Cardiff", "Londres Sul"], forms: ["{c} Athletic", "{c} Rovers", "{c} Albion", "{c} Wanderers", "{c} Town"] },
  es: { cities: ["Madrid", "Barcelona", "Sevilha", "Valência", "Bilbau", "Madrid Sul", "Saragoça", "Málaga", "Barcelona Mar", "Maiorca"], forms: ["{c} CF", "CD {c}", "UD {c}", "{c} Unión", "Real {c}"] },
  de: { cities: ["Munique", "Berlim", "Dortmund", "Hamburgo", "Colónia", "Estugarda", "Frankfurt", "Leipzig", "Bremen"], forms: ["SV {c}", "TSV {c}", "{c} FC", "VfB {c}", "{c} Sport"] },
  it: { cities: ["Roma", "Milão", "Turim", "Nápoles", "Palermo", "Florença", "Génova", "Bolonha", "Catânia"], forms: ["AC {c}", "US {c}", "{c} Calcio", "SS {c}", "{c} Atletica"] },
  fr: { cities: ["Paris", "Marselha", "Lyon", "Bordéus", "Lille", "Nice", "Nantes", "Estrasburgo", "Toulouse"], forms: ["{c} FC", "AS {c}", "Stade {c}", "RC {c}", "{c} Sport"] },
  nl: { cities: ["Amesterdão", "Roterdão", "Eindhoven", "Haia", "Utreque", "Groninga", "Arnhem"], forms: ["{c} FC", "SC {c}", "{c} Vitesse", "VV {c}"] },
  tr: { cities: ["Istambul", "Ancara", "Esmirna", "Trabzon", "Bursa", "Antália"], forms: ["{c} Spor", "{c} SK", "{c} Gençlik", "{c} Atletik"] },
  be: { cities: ["Bruxelas", "Antuérpia", "Bruges", "Gante", "Liège"], forms: ["{c} FC", "RSC {c}", "KV {c}", "{c} Sport"] },
  gr: { cities: ["Atenas", "Salónica", "Patras", "Heraclião"], forms: ["{c} FC", "AO {c}", "{c} Atletiki"] },
  hr: { cities: ["Zagrebe", "Split", "Rijeka", "Osijek"], forms: ["NK {c}", "{c} FC", "HNK {c}"] },
  rs: { cities: ["Belgrado", "Novi Sad", "Niš", "Kragujevac"], forms: ["FK {c}", "{c} FC", "{c} Sport"] },
  ch: { cities: ["Zurique", "Basileia", "Genebra", "Berna"], forms: ["{c} FC", "FC {c}", "{c} Sport"] },
  se: { cities: ["Estocolmo", "Gotemburgo", "Malmö", "Uppsala"], forms: ["{c} IF", "{c} FF", "IFK {c}"] },
  dk: { cities: ["Copenhaga", "Aarhus", "Odense", "Aalborg"], forms: ["{c} BK", "{c} FC", "{c} IF"] },
  pl: { cities: ["Varsóvia", "Cracóvia", "Gdansk", "Poznań"], forms: ["{c} KS", "{c} FC", "{c} Sport"] },
  ua: { cities: ["Kiev", "Carcóvia", "Odessa", "Lviv"], forms: ["{c} FC", "{c} Sport", "{c} Atletik"] },
  ro: { cities: ["Bucareste", "Cluj", "Timișoara", "Iași"], forms: ["{c} FC", "FC {c}", "{c} Sport"] },
  cz: { cities: ["Praga", "Brno", "Ostrava"], forms: ["{c} FK", "{c} FC", "SK {c}"] },
  no: { cities: ["Oslo", "Bergen", "Trondheim"], forms: ["{c} FK", "{c} IL", "{c} BK"] },
  ie: { cities: ["Dublin", "Cork"], forms: ["{c} Athletic", "{c} Rovers"] },
  bg: { cities: ["Sófia", "Plovdiv"], forms: ["{c} FC", "PFK {c}"] },
  ba: { cities: ["Sarajevo", "Banja Luka"], forms: ["FK {c}", "{c} FC"] },
};
