import { describe, expect, it } from "vitest";
import { aCobro, escalarPagosCliente, montarIngresos, resumir, textoRecordatorioIngresos } from "./ingresos";

const HOY = "2026-10-13";
const fila = (n: number, o: Record<string, string>) => ({ fila: n, o });
const cobro = (n: number, ingreso: string, importe: number, destino = "yo") => aCobro(n, { ID: "C" + n, INGRESO: ingreso, FECHA: "01/09/2026", IMPORTE: String(importe), DESTINO: destino });

describe("montarIngresos: pendiente y estados (datos inventados)", () => {
  it("un pago parcial deja el resto como pendiente", () => {
    const [i] = montarIngresos([fila(2, { ID: "I001", NEGOCIO: "Taller", CONCEPTO: "Eje demo", IMPORTE: "150", TIPO: "trabajo" })], [cobro(2, "I001", 50)], HOY);
    expect(i.cobrado).toBe(50);
    expect(i.pendiente).toBe(100);
    expect(i.estado).toBe("parcial");
  });

  it("cobrado entero, sin precio y anulado", () => {
    const xs = montarIngresos(
      [
        fila(2, { ID: "I001", NEGOCIO: "Taller", IMPORTE: "150" }),
        fila(3, { ID: "I002", NEGOCIO: "Taller", IMPORTE: "" }),
        fila(4, { ID: "I003", NEGOCIO: "Taller", IMPORTE: "80", ESTADO: "anulado" }),
      ],
      [cobro(2, "I001", 150)],
      HOY,
    );
    expect(xs.map((x) => x.estado)).toEqual(["cobrado", "sin precio", "anulado"]);
    expect(xs.map((x) => x.pendiente)).toEqual([0, 0, 0]);
  });

  it("el dinero que el cliente pagó a Flownexion no cuenta como cobrado: queda retenido", () => {
    const [i] = montarIngresos([fila(2, { ID: "I010", NEGOCIO: "Flownexion", CLIENTE: "Proyecto demo", IMPORTE: "300", TIPO: "proyecto" })], [cobro(2, "I010", 300, "flownexion")], HOY);
    expect(i.cobrado).toBe(0);
    expect(i.clientePago).toBe(300);
    expect(i.debeFlownexion).toBe(300);
    expect(i.esperaCliente).toBe(0);
    expect(i.estado).toBe("retenido");
  });

  it("Flownexion en dos pasos: parte pagada por el cliente, parte esperando y parte ya cobrada", () => {
    const base = fila(2, { ID: "I011", NEGOCIO: "Flownexion", IMPORTE: "300" });
    const [a] = montarIngresos([base], [cobro(2, "I011", 100, "flownexion")], HOY);
    expect([a.debeFlownexion, a.esperaCliente, a.estado]).toEqual([100, 200, "pendiente"]);
    const [b] = montarIngresos([base], [cobro(2, "I011", 100, "flownexion"), cobro(3, "I011", 100, "yo")], HOY);
    expect([b.cobrado, b.debeFlownexion, b.esperaCliente, b.pendiente, b.estado]).toEqual([100, 0, 200, 200, "parcial"]);
  });

  it("lo pagado por el cliente nunca supera tu parte", () => {
    const [i] = montarIngresos([fila(2, { ID: "I012", NEGOCIO: "Flownexion", IMPORTE: "100" })], [cobro(2, "I012", 250, "flownexion")], HOY);
    expect(i.clientePago).toBe(100);
  });

  it("un pago a Flownexion en un ingreso del taller no existe como paso intermedio", () => {
    const [i] = montarIngresos([fila(2, { ID: "I013", NEGOCIO: "Taller", IMPORTE: "100" })], [cobro(2, "I013", 100, "flownexion")], HOY);
    expect(i.clientePago).toBe(0);
    expect(i.cobrado).toBe(0);
  });

  it("vencido solo si tiene pendiente y la fecha ya pasó", () => {
    const xs = montarIngresos(
      [fila(2, { ID: "I020", NEGOCIO: "Taller", IMPORTE: "100", VENCIMIENTO: "01/10/2026" }), fila(3, { ID: "I021", NEGOCIO: "Taller", IMPORTE: "100", VENCIMIENTO: "01/10/2026" })],
      [cobro(2, "I021", 100)],
      HOY,
    );
    expect(xs.map((x) => x.vencido)).toEqual([true, false]);
  });

  it("un ID de apunte automático (P-...) repetido se ignora y no suma dos veces", () => {
    const xs = montarIngresos(
      [
        fila(2, { ID: "P-M01-2026-10", NEGOCIO: "Taller", TIPO: "mantenimiento", IMPORTE: "50" }),
        fila(3, { ID: "I030", NEGOCIO: "Taller", IMPORTE: "10" }),
        fila(4, { ID: "P-M01-2026-10", NEGOCIO: "Taller", TIPO: "mantenimiento", IMPORTE: "50" }),
      ],
      [],
      HOY,
    );
    expect(xs.map((x) => [x.id, x.fila])).toEqual([["P-M01-2026-10", 2], ["I030", 3]]);
    expect(resumir(xs).facturado).toBe(60);
  });

  it("resumir separa lo del taller y lo de Flownexion", () => {
    const xs = montarIngresos(
      [fila(2, { ID: "I1", NEGOCIO: "Taller", IMPORTE: "100" }), fila(3, { ID: "I2", NEGOCIO: "Flownexion", IMPORTE: "200" })],
      [cobro(2, "I1", 40), cobro(3, "I2", 200, "flownexion")],
      HOY,
    );
    const t = resumir(xs, "Taller"), f = resumir(xs, "Flownexion");
    expect([t.cobrado, t.pendiente]).toEqual([40, 60]);
    expect([f.cobrado, f.debeFlownexion, f.esperaCliente]).toEqual([0, 200, 0]);
    expect(resumir(xs).pendiente).toBe(260);
  });
});

describe("escalarPagosCliente: cambio de reparto (30 % a 60 %)", () => {
  const ing = (importe: string, cobros: ReturnType<typeof cobro>[]) => montarIngresos([fila(2, { ID: "I050", NEGOCIO: "Flownexion", IMPORTE: importe })], cobros, HOY)[0];

  it("escala lo que pagó el cliente y NO toca lo que te llegó a ti", () => {
    const i = ing("30", [cobro(2, "I050", 30, "flownexion"), cobro(3, "I050", 10, "yo")]);
    const c = escalarPagosCliente(i, 60);
    expect([...c.keys()]).toEqual(["C2"]);
    expect(c.get("C2")).toEqual({ IMPORTE: "60" });
  });

  it("varios pagos del cliente mantienen la proporción", () => {
    const i = ing("100", [cobro(2, "I050", 25, "flownexion"), cobro(3, "I050", 25, "flownexion")]);
    const c = escalarPagosCliente(i, 200);
    expect(c.get("C2")).toEqual({ IMPORTE: "50" });
    expect(c.get("C3")).toEqual({ IMPORTE: "50" });
  });

  it("el total escalado nunca supera la nueva parte", () => {
    const i = ing("100", [cobro(2, "I050", 70, "flownexion"), cobro(3, "I050", 30, "flownexion")]);
    const c = escalarPagosCliente(i, 33.33);
    const suma = [...c.values()].reduce((s, x) => s + Number(x.IMPORTE), 0);
    expect(suma).toBeLessThanOrEqual(33.33 + 1e-9);
  });

  it("sin cambio de importe, sin importe o sin pagos del cliente no cambia nada", () => {
    expect(escalarPagosCliente(ing("30", [cobro(2, "I050", 30, "flownexion")]), 30).size).toBe(0);
    expect(escalarPagosCliente(ing("", [cobro(2, "I050", 30, "flownexion")]), 60).size).toBe(0);
    expect(escalarPagosCliente(ing("30", [cobro(2, "I050", 30, "yo")]), 60).size).toBe(0);
  });
});

describe("textoRecordatorioIngresos (día 5, datos inventados)", () => {
  const xs = montarIngresos(
    [
      fila(2, { ID: "P-P01-2026-09", NEGOCIO: "Taller", CONCEPTO: "Mantenimiento demo", IMPORTE: "50", TIPO: "mantenimiento", FECHA: "01/09/2026" }),
      fila(3, { ID: "P-P01-2026-10", NEGOCIO: "Taller", CONCEPTO: "Mantenimiento demo", IMPORTE: "50", TIPO: "mantenimiento", FECHA: "01/10/2026" }),
      fila(4, { ID: "I050", NEGOCIO: "Flownexion", CLIENTE: "Proyecto demo", CONCEPTO: "Mto demo 60 %", IMPORTE: "120", TIPO: "mantenimiento", FECHA: "01/10/2026" }),
      fila(5, { ID: "I051", NEGOCIO: "Taller", CONCEPTO: "Eje demo", IMPORTE: "30", TIPO: "trabajo", FECHA: "10/07/2026" }),
      fila(6, { ID: "P-P01-2026-07", NEGOCIO: "Taller", CONCEPTO: "Mantenimiento viejo", IMPORTE: "50", TIPO: "mantenimiento", FECHA: "01/07/2026", ESTADO: "anulado" }),
    ],
    [cobro(2, "P-P01-2026-09", 50), cobro(3, "I050", 120, "flownexion")],
    "2026-10-05",
  );
  const t = textoRecordatorioIngresos(xs, "2026-10-05");
  it("pregunta por el mes pasado y por este, con lo cobrado y lo pendiente", () => {
    expect(t).toContain("Septiembre 2026");
    expect(t).toContain("Octubre 2026");
    expect(t).toMatch(/✅ Mantenimiento demo <code>#P-P01-2026-09<\/code> — cobrado 50,00 €/);
    expect(t).toMatch(/⏳ Mantenimiento demo <code>#P-P01-2026-10<\/code> — te deben <b>50,00 €<\/b>/);
    expect(t).toContain("🏦 Mto demo 60 %");
  });
  it("lo viejo sin cobrar va resumido y lo anulado no sale", () => {
    expect(t).toContain("Taller y otros: 1 sin cobrar · <b>30,00 €</b>");
    expect(t).not.toContain("Mantenimiento viejo");
  });
  it("enero mira diciembre del año anterior", () => {
    expect(textoRecordatorioIngresos([], "2027-01-05")).toContain("Diciembre 2026");
  });
});
