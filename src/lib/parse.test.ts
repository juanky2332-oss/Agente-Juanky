import { describe, expect, it } from "vitest";
import { aTexto, importe, num } from "./parse";

describe("importe() — importes escritos por personas o por el bot", () => {
  it.each([
    ["1.500", 1500],
    ["1.500,50", 1500.5],
    ["2.475,00€", 2475],
    ["2.475,00 €", 2475],
    [" 1.480 ", 1480],
    ["1.000.000", 1000000],
    ["0.135", 0.135],
    ["82.07", 82.07],
    ["12.5", 12.5],
    ["150", 150],
    ["150,5", 150.5],
    ["1500,5", 1500.5],
    ["1,234.56", 1234.56],
    ["-1.500", -1500],
    ["+1.500", 1500],
    ["1.5", 1.5],
    ["1.50", 1.5],
    ["100.000,00", 100000],
    [1500.5, 1500.5],
  ])("%s → %s", (txt, esperado) => {
    expect(importe(txt)).toBe(esperado);
  });

  it("aTexto() → importe() devuelve el mismo número (formularios que se reenvían)", () => {
    for (const n of [1.125, 1500, 1500.5, 0.135, 82.07, 12345.67]) expect(importe(aTexto(n))).toBe(n);
  });

  it("vacío o basura → 0 (mismo contrato que num)", () => {
    for (const v of ["", "   ", "abc", "-", null, undefined, NaN]) {
      expect(importe(v)).toBe(0);
      expect(importe(v)).toBe(num(v));
    }
  });
});

describe("num() — lectura de la hoja (no cambia)", () => {
  it("sigue leyendo el punto como decimal", () => {
    expect(num("0.135")).toBe(0.135);
    expect(num("82.07")).toBe(82.07);
    expect(num("1.500")).toBe(1.5);
    expect(num("2.475,00€")).toBe(2475);
  });
});
