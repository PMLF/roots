import { describe, expect, it } from "vitest";
import { allocateEntries } from "./access";
import { europeZone, type EuropeSlots } from "./zones";

const order = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10"];
const base: EuropeSlots = { rank: 6, championsLeague: 2, championsQualifying: 1, europaLeague: 1, conferenceLeague: 1 };

describe("acesso de Portugal às provas europeias (RZ-252)", () => {
  it("sem vencedores: 1.º-2.º Champions, 3.º pré-eliminatória, 4.º Liga Europa, 5.º Conferência", () => {
    expect(allocateEntries(order, base, {})).toEqual({ championsLeague: ["c1", "c2"], championsQualifying: ["c3"], europaLeague: ["c4"], conferenceLeague: ["c5"] });
  });
  it("o vencedor da Taça entra na Liga Europa; fora das vagas da liga, nada desce", () => {
    expect(allocateEntries(order, base, { cup: "c8" })).toEqual({ championsLeague: ["c1", "c2"], championsQualifying: ["c3"], europaLeague: ["c4", "c8"], conferenceLeague: ["c5"] });
  });
  it("se o vencedor da Taça já estava na Champions, a vaga da Liga Europa vai para o clube seguinte e a Conferência desce", () => {
    expect(allocateEntries(order, base, { cup: "c1" })).toEqual({ championsLeague: ["c1", "c2"], championsQualifying: ["c3"], europaLeague: ["c4", "c5"], conferenceLeague: ["c6"] });
  });
  it("o vencedor da Taça que seria da Conferência fica na Liga Europa e a Conferência vai para o seguinte", () => {
    expect(allocateEntries(order, base, { cup: "c5" })).toEqual({ championsLeague: ["c1", "c2"], championsQualifying: ["c3"], europaLeague: ["c4", "c5"], conferenceLeague: ["c6"] });
  });
  it("o vencedor da Champions ou da Liga Europa entra na Champions, mesmo fora das vagas, e as outras vagas ficam como estavam", () => {
    expect(allocateEntries(order, base, { champions: "c9" })).toEqual({ championsLeague: ["c1", "c2", "c9"], championsQualifying: ["c3"], europaLeague: ["c4"], conferenceLeague: ["c5"] });
  });
  it("se o vencedor europeu já estava apurado, a vaga passa ao clube seguinte e as restantes descem", () => {
    expect(allocateEntries(order, base, { europa: "c1" })).toEqual({ championsLeague: ["c1", "c2", "c3"], championsQualifying: ["c4"], europaLeague: ["c5"], conferenceLeague: ["c6"] });
  });
  it("o vencedor da Conferência entra na Liga Europa", () => {
    expect(allocateEntries(order, base, { conference: "c9" }).europaLeague).toEqual(["c4", "c9"]);
  });
  it("as zonas da tabela seguem as vagas (o 1.º é campeão e tem cor própria)", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((p) => europeZone(p, base))).toEqual([undefined, "cl", "clq", "el", "ecl", undefined, undefined]);
  });
});
