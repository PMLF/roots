/** Setores de atividade das empresas (RZ-219): peso por setor da cidade, apetência por futebol e nomes fictícios. */
import type { Rng } from "../random/rng";

export const COMPANY_SECTORS = ["construction", "banking", "retail", "food", "industry", "technology", "tourism", "media", "energy", "transport", "agriculture", "health", "television", "radio", "streaming"] as const;
export type CompanySector = (typeof COMPANY_SECTORS)[number];

type SectorInfo = {
  /** Peso base de existir numa cidade qualquer. */
  base: number;
  /** Quanto o setor tende a patrocinar futebol (visibilidade, marca, clientela). */
  visibility: number;
  /** Modelos de nome: {S} apelido, {C} cidade. */
  names: readonly string[];
};

export const SECTOR_INFO: Record<CompanySector, SectorInfo> = {
  construction: { base: 1.2, visibility: 1, names: ["Construções {S} & Filhos", "{S} Engenharia e Obras", "Imobiliária {C}", "Obras e Projetos {S}"] },
  banking: { base: 0.4, visibility: 1.2, names: ["{S} Financeira", "Crédito {C}", "Seguros {S}", "Caixa de Poupança de {C}"] },
  retail: { base: 1.6, visibility: 1.2, names: ["Supermercados {S}", "Casa {S}", "Mercearia {S}", "Armazéns {C}", "Eletrodomésticos {S}"] },
  food: { base: 1.3, visibility: 1, names: ["Pastelaria {S}", "Restaurante {S}", "Conservas {S}", "Padaria {C}", "Grupo {S} Restauração"] },
  industry: { base: 1, visibility: 0.9, names: ["{S} Metalúrgica", "Têxteis {S}", "Cerâmicas {C}", "Plásticos {S}", "Moldes {S}"] },
  technology: { base: 0.5, visibility: 0.8, names: ["{S} Sistemas", "Tecnologias {S}", "{S} Digital", "Software {C}"] },
  tourism: { base: 0.8, visibility: 1, names: ["Hotel {S}", "Turismo {C}", "Alojamentos {S}", "Viagens {S}", "Quinta {S}"] },
  media: { base: 0.3, visibility: 1.3, names: ["{S} Media", "Edições {S}", "Revista {C}"] },
  energy: { base: 0.35, visibility: 1.2, names: ["Energias {S}", "Combustíveis {S}", "{S} Energia", "Solar {C}"] },
  transport: { base: 0.8, visibility: 0.9, names: ["Transportes {S}", "Autocarros {S}", "Logística {C}", "{S} Expresso"] },
  agriculture: { base: 1.3, visibility: 0.6, names: ["Agro {S}", "Adega {S}", "Cooperativa Agrícola de {C}", "Lacticínios {S}", "Azeites {S}"] },
  television: { base: 0.04, visibility: 1.3, names: ["Canal {S}", "{S} Televisão", "Televisão {C}"] },
  radio: { base: 0.35, visibility: 1.2, names: ["Rádio {C}", "Rádio {S}", "Antena {C}", "Emissora {C}"] },
  streaming: { base: 0.12, visibility: 1.2, names: ["{S} Play", "Stream {C}", "{S} Direto"] },
  health: { base: 0.6, visibility: 0.6, names: ["Clínica {S}", "Farmácia {S}", "Saúde {C}", "Laboratórios {S}"] },
};

/** Multiplicador por setor da cidade (códigos de `cities.csv`); o que não aparece vale 1. */
const CITY_BIAS: Record<string, Partial<Record<CompanySector, number>>> = {
  AGR: { agriculture: 4, retail: 1.5, food: 1.5, industry: 0.5, tourism: 0.5, technology: 0.4 },
  INT: { agriculture: 2, retail: 1.4, construction: 1.1, technology: 0.4, banking: 0.6 },
  IND: { industry: 4, transport: 1.5, construction: 1.3, energy: 1.5 },
  TUR: { tourism: 4, food: 2, retail: 1.4, transport: 1.2 },
  FRO: { tourism: 1.5, food: 1.5, transport: 1.4 },
  MAR: { tourism: 2, food: 2.5, transport: 1.8, agriculture: 0.5 },
  PAT: { tourism: 2.5, food: 1.5 },
  SER: { banking: 3, technology: 3, media: 2, health: 1.5 },
  LOG: { transport: 4, industry: 1.5 },
  DOR: { retail: 2, construction: 2, food: 1.3 },
  UNI: { technology: 3, health: 2, media: 1.5 },
  TER: { tourism: 2, agriculture: 1.5 },
  EMI: { construction: 1.5, retail: 1.3 },
  ENE: { energy: 4, industry: 1.5 },
  MUL: {},
};

/** Setores que emitem jogos: disputam direitos de transmissão (RZ-218). */
export const BROADCAST_SECTORS: readonly CompanySector[] = ["television", "radio", "streaming"];
export const isBroadcaster = (sector: string): boolean => (BROADCAST_SECTORS as readonly string[]).includes(sector);

export function sectorWeights(citySector: string, citySector2: string): Record<CompanySector, number> {
  const out = {} as Record<CompanySector, number>;
  for (const s of COMPANY_SECTORS) out[s] = SECTOR_INFO[s].base * (CITY_BIAS[citySector]?.[s] ?? 1) * Math.sqrt(CITY_BIAS[citySector2]?.[s] ?? 1);
  return out;
}

export function drawSector(rng: Rng, citySector: string, citySector2: string): CompanySector {
  const w = sectorWeights(citySector, citySector2);
  return rng.weighted([...COMPANY_SECTORS], (s) => w[s]);
}

/** Nome fictício da empresa: modelo do setor com o apelido do dono e o nome da cidade. */
export function companyName(rng: Rng, sector: CompanySector, surname: string, city: string): string {
  return rng.choose(SECTOR_INFO[sector].names).replace("{S}", surname).replace("{C}", city);
}
