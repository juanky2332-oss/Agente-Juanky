import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { cuotaMensual, ErrorPropuesta, generarPropuestaPdf, leerPlan, nombreArchivo, validarPeticion } from "./propuesta";

const MUESTRA = "C:/Users/juank/AppData/Local/Temp/claude/C--Users-juank/f95d9abc-c184-4e05-bc03-a89bf78dcea8/scratchpad/propuesta-demo.pdf";
const HOY = new Date(2026, 9, 13);

describe("propuesta PDF", () => {
  it("genera un PDF de 2 páginas para un cliente ficticio y guarda una muestra", async () => {
    const d = validarPeticion({ cliente: "Talleres Demo SL", usuariosExtra: 2, modulos: ["Calculadora de mecanizado", "Reparación de maquinaria"], notas: "Usan SAP en compras; quieren ver el paquete para la asesoría." });
    const r = await generarPropuestaPdf(d, HOY);
    expect(r.paginas).toBe(2);
    expect(r.archivo).toBe("Propuesta-IndunexIA-Talleres-Demo-SL-2026-10-13.pdf");
    expect(Buffer.from(r.pdf.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(r.pdf);
    expect(doc.getPageCount()).toBe(2);
    mkdirSync(dirname(MUESTRA), { recursive: true });
    writeFileSync(MUESTRA, r.pdf);
  });

  it("sigue siendo de 2 páginas con cliente larguísimo, notas largas y caracteres raros", async () => {
    const d = validarPeticion({ cliente: "Construcciones y Mecanizados Industriales del Levante Meridional Sociedad Limitada Unipersonal ✓ 日本", usuariosExtra: "0", modulos: "uno, dos; tres, cuatro, cinco, seis, siete, ocho, nueve, diez, once, doce, trece", notas: "x".repeat(900) });
    expect(d.notas.length).toBe(400);
    expect(d.modulos).toHaveLength(12);
    const r = await generarPropuestaPdf(d, HOY);
    expect(r.paginas).toBe(2);
  });

  it("valida la petición", () => {
    expect(() => validarPeticion({})).toThrow(ErrorPropuesta);
    expect(() => validarPeticion({ cliente: "  " })).toThrow(/cliente/);
    expect(() => validarPeticion({ cliente: "A", usuariosExtra: -1 })).toThrow(/usuariosExtra/);
    expect(() => validarPeticion({ cliente: "A", usuariosExtra: 1.5 })).toThrow(/usuariosExtra/);
    expect(() => validarPeticion({ cliente: "A", usuariosExtra: "mucho" })).toThrow(/usuariosExtra/);
    expect(() => validarPeticion({ cliente: "A".repeat(121) })).toThrow(/largo/);
    expect(validarPeticion({ cliente: " Taller   Demo " , usuariosExtra: "3"})).toMatchObject({ cliente: "Taller Demo", usuariosExtra: 3, modulos: [], notas: "" });
  });

  it("nunca nombra la otra marca en la oferta", () => {
    expect(() => validarPeticion({ cliente: "Taller Demo", notas: "vía Flownexion" })).toThrow(ErrorPropuesta);
  });

  it("cuota mensual = 69 + 15 por usuario extra", () => {
    expect(cuotaMensual(0)).toBe(69);
    expect(cuotaMensual(2)).toBe(99);
  });

  it("nombre de archivo sin acentos ni símbolos", () => {
    expect(nombreArchivo("Ñandú & Hijos, S.L.", HOY)).toBe("Propuesta-IndunexIA-Nandu-Hijos-S-L-2026-10-13.pdf");
  });
});

describe("planes", () => {
  it("lee el plan sin importar tildes ni mayúsculas y por defecto es Profesional", () => {
    expect(leerPlan("Básico")).toBe("basico");
    expect(leerPlan("PRO")).toBe("pro");
    expect(leerPlan("plan profesional")).toBe("profesional");
    expect(leerPlan("")).toBe("profesional");
    expect(() => leerPlan("premium")).toThrow(ErrorPropuesta);
  });
  it("calcula la cuota de cada plan con los usuarios extra", () => {
    expect(cuotaMensual(0, "basico")).toBe(59);
    expect(cuotaMensual(2, "pro")).toBe(89 + 30);
    expect(validarPeticion({ cliente: "Talleres Demo SL", plan: "pro" }).plan).toBe("pro");
  });
  it("genera el PDF de cada plan", async () => {
    for (const plan of ["basico", "profesional", "pro"] as const) {
      const r = await generarPropuestaPdf({ cliente: "Talleres Demo SL", plan, usuariosExtra: 0, modulos: [], notas: "" }, HOY);
      expect(r.paginas).toBe(2);
    }
  });
});
