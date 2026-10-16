/**
 * Dados de origem importados dos CSV (RZ-007). São o ponto de partida do mundo,
 * não o modelo completo de MODELO_DADOS: plantéis, finanças detalhadas, estádios por
 * setores e pessoas são gerados depois (RZ-103). Tudo aqui é imutável pelo motor.
 */
import type { Tier } from "../config/parametros";
import type { Status } from "../localidade/estatuto";

export type ClubId = string;
export type CityId = string;
export type LocalityId = string;
export type DistrictId = string;
export type CpSeries = "A" | "B" | "C" | "D";
export type Zone = "centro" | "perto" | "periferia" | "away";
export type Ownership = "club" | "municipal" | "partilhada";

export type StadiumLocation = {
  zone: Zone;
  centreDistanceKm: number;
  /** 0-100 */
  transport: number;
  roadAccess: number;
  parking: number;
  parkingPlaces: number;
  surroundings: number;
  expansionTerrain: number;
};

export type BaseStadium = {
  name: string;
  ownership: Ownership;
  capacity: number;
  location: StadiumLocation;
};

export type BaseClub = {
  id: ClubId;
  name: string;
  /** Nome da localidade do clube (coluna "cidade" do CSV). */
  locality: string;
  localityId: LocalityId;
  /** Concelho: a cidade do jogo. */
  city: CityId;
  district: DistrictId;
  tier: Tier;
  /** Liga/série onde joga no início, tal como no CSV ("CP Série A", "Distrital Beja", ...). */
  league: string;
  reputation: number;
  /** Capital inicial em euros. */
  finances: number;
  stadium: BaseStadium;
  colours: string;
  nickname: string;
  mascot: string;
  rival: ClubId;
  sector: string;
  tag2: string;
  hub: string;
  origin: "existing" | "fresh";
};

export type BaseMayor = {
  name: string;
  /** Traços na escala 1-20 (valores do CSV, 1-10, ×2; PERSONALIDADE §2). */
  traits: { ambition: number; vanity: number; patience: number; integrity: number };
  /** Atitude da Câmara perante o desporto, 1-10 (não é traço). */
  sportSupport: number;
};

export type BaseCity = {
  id: CityId;
  name: string;
  district: DistrictId;
  population: number;
  sector: string;
  tag2: string;
  hub: string;
  island: boolean;
  /** Euros por ano. */
  municipalBudget: number;
  mayor: BaseMayor;
  /** 0-100 */
  footballCulture: number;
  clubs: ClubId[];
};

/** Aldeia, vila ou cidade onde o clube vive, dentro de um concelho (RZ-136). O estatuto e a população evoluem no save. */
export type BaseLocality = {
  id: LocalityId;
  name: string;
  city: CityId;
  district: DistrictId;
  population: number;
  status: Status;
  /** É a sede do concelho. */
  host: boolean;
  clubs: ClubId[];
};

export type BaseDistrict = {
  id: DistrictId;
  name: string;
  cpSeries: CpSeries;
  /** Nº de clubes por escalão, para validar. */
  clubsPerTier: Record<Tier, number>;
};

export type BaseRivalry = {
  a: ClubId;
  b: ClubId;
  mutual: boolean;
  sameMunicipality: boolean;
  sameDistrict: boolean;
  sameHub: boolean;
  sameDivision: boolean;
};

export type BaseData = {
  districts: BaseDistrict[];
  cities: BaseCity[];
  localities: BaseLocality[];
  clubs: BaseClub[];
  rivalries: BaseRivalry[];
};

export type SourcesCsv = { clubs: string; cities: string; localities: string; rivalries: string; districts: string };

export type ImportResult =
  | { ok: true; data: BaseData; warnings: string[] }
  | { ok: false; errors: string[] };
