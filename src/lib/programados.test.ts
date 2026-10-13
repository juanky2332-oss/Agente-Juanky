import { describe, expect, it } from "vitest";
import { aProgramado, idsDuplicadosP, pendientesDeGenerar, separarCopiasP, sinLosExistentes } from "./programados";

const plantilla = (o: Record<string, string> = {}) =>
  aProgramado(2, { ID: "G01", ACTIVO: "sí", TIPO: "gasto", NOMBRE: "Comunidad demo", PROVEEDOR: "Comunidad Demo", IMPORTE: "50", PERIODICIDAD: "mensual", DIA: "5", DESDE: "01/08/2026", MODO: "auto", ...o });

describe("apuntes automáticos sin duplicar", () => {
  it("pendientesDeGenerar no repite lo que ya existe", () => {
    const hoy = "2026-10-13";
    const todos = pendientesDeGenerar([plantilla()], new Set(), hoy).map((x) => x.id);
    expect(todos).toEqual(["P-G01-2026-08", "P-G01-2026-09", "P-G01-2026-10"]);
    expect(pendientesDeGenerar([plantilla()], new Set(["P-G01-2026-09"]), hoy).map((x) => x.id)).toEqual(["P-G01-2026-08", "P-G01-2026-10"]);
  });

  it("sinLosExistentes quita lo que otro proceso escribió entre medias (relectura fresca)", () => {
    const pend = pendientesDeGenerar([plantilla()], new Set(), "2026-10-13");
    const fresco = new Set(["P-G01-2026-10"]);
    expect(sinLosExistentes(pend, fresco).map((x) => x.id)).toEqual(["P-G01-2026-08", "P-G01-2026-09"]);
    expect(sinLosExistentes(pend, new Set(pend.map((x) => x.id)))).toEqual([]);
  });

  it("sinLosExistentes tampoco repite IDs dentro del mismo lote", () => {
    const x = { id: "P-A-2026-10" };
    expect(sinLosExistentes([x, { ...x }], new Set())).toHaveLength(1);
  });

  it("separarCopiasP ignora la segunda copia de un ID P-… y deja intactas las demás filas", () => {
    const filas = [
      { fila: 2, id: "P-G01-2026-10" },
      { fila: 3, id: "I001" },
      { fila: 4, id: "P-G01-2026-10" },
      { fila: 5, id: "I001" }, // repetido pero NO automático: no se toca
      { fila: 6, id: "" },
      { fila: 7, id: "" },
    ];
    const r = separarCopiasP(filas, (f) => f.id);
    expect(r.copias.map((f) => f.fila)).toEqual([4]);
    expect(r.unicos.map((f) => f.fila)).toEqual([2, 3, 5, 6, 7]);
  });

  it("idsDuplicadosP lista los P-… repetidos una sola vez", () => {
    expect(idsDuplicadosP(["P-A-2026-10", "I001", "P-A-2026-10", "P-A-2026-10", "P-B-2026-10", "I001", " P-B-2026-10 "])).toEqual(["P-A-2026-10", "P-B-2026-10"]);
    expect(idsDuplicadosP(["P-A-2026-10", "P-A-2026-09"])).toEqual([]);
  });
});
