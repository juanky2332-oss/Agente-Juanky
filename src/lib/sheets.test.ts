import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./n8n", () => ({ n8n: vi.fn(), ErrorN8n: class extends Error {} }));
const { rangosLlenos } = await import("./sheets");

const filas = (n: number) => Array.from({ length: n }, () => ["x"]);

describe("rangosLlenos", () => {
  it("una pestaña que llena su rango se vuelve a pedir 4 veces más grande", () => {
    expect(rangosLlenos(["'Ingresos'!A1:Z3000"], [filas(3000)])).toEqual([{ i: 0, rango: "'Ingresos'!A1:Z12000" }]);
  });
  it("si sobra sitio no se repite nada", () => {
    expect(rangosLlenos(["'Ingresos'!A1:Z3000", "'Cobros'!A1:Z5000"], [filas(40), filas(4999)])).toEqual([]);
  });
  it("las lecturas de cabecera (pocas filas) no cuentan", () => {
    expect(rangosLlenos(["'GestorIA'!A1:Z1", "'Sync hojas'!A1:C20"], [filas(1), filas(20)])).toEqual([]);
  });
  it("solo marca la que está llena, con su posición", () => {
    expect(rangosLlenos(["'A'!A1:Z300", "'B'!A1:Z200"], [filas(10), filas(200)])).toEqual([{ i: 1, rango: "'B'!A1:Z800" }]);
  });
});
