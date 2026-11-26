import { describe, it, expect } from "vitest";
import { conLecturasCompartidas, recordar, recordadas, olvidarLecturas, generacionActual, enCamino, apuntarEnCamino } from "./lecturas";

const R = "FORMATTED_VALUE";
const hoja = [["ID", "IMPORTE"], ["I001", "75"]];

describe("lecturas compartidas", () => {
  it("dentro de una petición, lo leído se reutiliza", () =>
    conLecturasCompartidas(async () => {
      recordar(R, ["'Ingresos'!A1:Z3000"], [hoja], generacionActual());
      expect(recordadas(R, ["'Ingresos'!A1:Z3000", "'Cobros'!A1:Z5000"])).toEqual([hoja, undefined]);
    }));

  it("una escritura lo olvida todo", () =>
    conLecturasCompartidas(async () => {
      recordar(R, ["'Ingresos'!A1:Z3000"], [hoja], generacionActual());
      olvidarLecturas();
      expect(recordadas(R, ["'Ingresos'!A1:Z3000"])).toEqual([undefined]);
    }));

  it("una lectura que empezó antes de una escritura no se guarda", () =>
    conLecturasCompartidas(async () => {
      const gen = generacionActual();
      olvidarLecturas(); // se escribe mientras la lectura estaba en camino
      recordar(R, ["'Ingresos'!A1:Z3000"], [hoja], gen);
      expect(recordadas(R, ["'Ingresos'!A1:Z3000"])).toEqual([undefined]);
    }));

  it("devuelve copias: tocar el resultado no cambia lo recordado", () =>
    conLecturasCompartidas(async () => {
      recordar(R, ["'Ingresos'!A1:Z3000"], [hoja], generacionActual());
      recordadas(R, ["'Ingresos'!A1:Z3000"])[0]![1][1] = "999";
      expect(recordadas(R, ["'Ingresos'!A1:Z3000"])[0]![1][1]).toBe("75");
    }));

  it("cada petición tiene su propia memoria y fuera de una petición no se recuerda nada", async () => {
    await conLecturasCompartidas(async () => recordar(R, ["'Ingresos'!A1:Z3000"], [hoja], generacionActual()));
    await conLecturasCompartidas(async () => expect(recordadas(R, ["'Ingresos'!A1:Z3000"])).toEqual([undefined]));
    recordar(R, ["'Ingresos'!A1:Z3000"], [hoja], generacionActual());
    expect(recordadas(R, ["'Ingresos'!A1:Z3000"])).toEqual([undefined]);
  });

  it("con otro formato de lectura es otra cosa", () =>
    conLecturasCompartidas(async () => {
      recordar(R, ["'Trabajos taller'!A1:Z1000"], [hoja], generacionActual());
      expect(recordadas("UNFORMATTED_VALUE", ["'Trabajos taller'!A1:Z1000"])).toEqual([undefined]);
    }));

  it("una lectura en camino se comparte, y una escritura la descarta", () =>
    conLecturasCompartidas(async () => {
      let soltar!: (v: string[][][]) => void;
      const p = new Promise<string[][][]>((ok) => (soltar = ok));
      apuntarEnCamino(R, ["'Programados'!A1:Z300"], p);
      const compartida = enCamino(R, ["'Programados'!A1:Z300"])[0];
      expect(compartida).toBeDefined();
      olvidarLecturas();
      expect(enCamino(R, ["'Programados'!A1:Z300"])[0]).toBeUndefined();
      soltar([hoja]);
      expect(await compartida).toEqual(hoja);
    }));
});
