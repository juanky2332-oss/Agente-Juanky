import { describe, expect, it } from "vitest";
import { aCobro, montarIngresos, type Ingreso } from "./ingresos";
import { casarFactura, limpiaPedido, revisarFactura, type LineaFactura } from "./facturaTaller";

const HOY = "2026-10-13";
// Trabajo del taller inventado: tu parte = 10 % del total.
function trabajo(id: string, pedido: string, concepto: string, uds: number, precio: number, cobrado = 0, extra: Record<string, string> = {}): Ingreso {
  const total = uds * precio;
  const o = { ID: id, NEGOCIO: "Taller", CLIENTE: "Cliente Demo", CONCEPTO: concepto, REFERENCIA: `OCC 9${id.slice(1)} · pedido ${pedido}`, IMPORTE: String(total / 10), TOTAL_TRABAJO: String(total), PORCENTAJE: "10", UNIDADES: String(uds), PRECIO_UNIT: String(precio), TIPO: "trabajo", ...extra };
  const cobros = cobrado ? [aCobro(2, { ID: "C" + id, INGRESO: id, FECHA: "01/09/2026", IMPORTE: String(cobrado), DESTINO: "yo" })] : [];
  return montarIngresos([{ fila: 2, o }], cobros, HOY)[0];
}
const linea = (pedido: string, uds: number | null, precio: number | null, importe: number, descripcion = "", occ = ""): LineaFactura => ({ pedido, occ, descripcion, unidades: uds, precio, importe });

describe("casarFactura: emparejado por nº de pedido", () => {
  it("factura entera de un trabajo: se apunta el 10 % completo", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 10, 100)];
    const { casos, sinCasar } = casarFactura([linea("4500000001", 10, 100, 1000)], ings);
    expect(sinCasar).toEqual([]);
    expect(casos).toHaveLength(1);
    const c = casos[0];
    expect([c.id, c.parcial, c.cambiaPrecio, c.tuyo, c.aCobrar]).toEqual(["I001", false, false, 100, 100]);
  });

  it("entrega parcial (8 de 15 uds al mismo precio): cobra solo esta factura y no cambia el precio del trabajo", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 15, 100)];
    const [c] = casarFactura([linea("4500000001", 8, 100, 800)], ings).casos;
    expect(c.parcial).toBe(true);
    expect(c.cambiaPrecio).toBe(false);
    expect([c.totalFactura, c.tuyo, c.aCobrar, c.totalApp]).toEqual([800, 80, 80, 1500]);
    expect([c.unidades, c.precio]).toEqual([15, 100]);
    expect(c.aviso).toMatch(/Entrega parcial \(8 de 15 uds\)/);
  });

  it("entrega parcial con menos pendiente que tu parte: se apunta solo lo pendiente", () => {
    // Trabajo de 1.500 (tu parte 150) del que ya te pagaron 100: quedan 50.
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 15, 100, 100)];
    const [c] = casarFactura([linea("4500000001", 8, 100, 800)], ings).casos;
    expect(c.parcial).toBe(true);
    expect([c.tuyo, c.yaCobrado, c.aCobrar]).toEqual([80, 100, 50]);
    expect(c.aviso).toMatch(/Solo quedaban/);
  });

  it("entrega parcial con precio por unidad distinto: sigue siendo parcial pero avisa", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 15, 100)];
    const [c] = casarFactura([linea("4500000001", 8, 90, 720)], ings).casos;
    expect(c.parcial).toBe(true);
    expect(c.aCobrar).toBe(72);
    expect(c.aviso).toMatch(/precio por unidad distinto/);
  });

  it("precio distinto en la factura completa: manda la factura y se corrige el total del trabajo", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 10, 150)]; // app: 1.500
    const [c] = casarFactura([linea("4500000001", 10, 160, 1600)], ings).casos;
    expect(c.parcial).toBe(false);
    expect(c.cambiaPrecio).toBe(true);
    expect([c.totalApp, c.totalFactura, c.tuyo, c.aCobrar]).toEqual([1500, 1600, 160, 160]);
    expect([c.unidades, c.precio]).toEqual([10, 160]);
    expect(c.aviso).toMatch(/me quedo con la factura/);
  });

  it("si ya te lo pagaron entero, no se apunta nada más", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 10, 100, 100)];
    const ls = [linea("4500000001", 10, 100, 1000)];
    const { casos } = casarFactura(ls, ings);
    expect(casos[0].aCobrar).toBe(0);
    expect(casos[0].aviso).toMatch(/Ya te lo habían pagado entero/);
    expect(revisarFactura({ base: 1000, iva: 210, total: 1210, lineas: ls, sinCasar: [], casos })).toContain("De esta factura no queda nada por apuntarte.");
  });

  it("pedido desconocido: se da de alta como trabajo nuevo con el 10 % por defecto", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 10, 100)];
    const { casos } = casarFactura([linea("4500999999", 4, 50, 200, "brida nueva")], ings);
    expect(casos).toHaveLength(1);
    const c = casos[0];
    expect([c.id, c.pedido, c.porcentaje, c.tuyo, c.aCobrar, c.totalApp]).toEqual([null, "4500999999", 10, 20, 20, null]);
    expect(c.aviso).toMatch(/No lo tenías apuntado/);
  });

  it("trabajo sin precio en la app: se le pone el de la factura", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 10, 100, 0, { IMPORTE: "", TOTAL_TRABAJO: "", PRECIO_UNIT: "" })];
    const [c] = casarFactura([linea("4500000001", 10, 100, 1000)], ings).casos;
    expect(c.id).toBe("I001");
    expect(c.cambiaPrecio).toBe(true);
    expect(c.aviso).toMatch(/No tenía precio/);
  });

  it("un pedido con varias líneas en la app: cada línea va a su trabajo por descripción e importe", () => {
    const ings = [trabajo("I001", "4500000002", "eje largo", 2, 300), trabajo("I002", "4500000002", "brida plana", 5, 40)];
    const { casos } = casarFactura([linea("4500000002", 5, 40, 200, "BRIDA PLANA"), linea("4500000002", 2, 300, 600, "EJE LARGO")], ings);
    const porId = Object.fromEntries(casos.map((c) => [c.id, c]));
    expect(casos).toHaveLength(2);
    expect(porId.I001.totalFactura).toBe(600);
    expect(porId.I002.totalFactura).toBe(200);
  });

  it("línea sin pedido ni parecido claro: queda sin casar y se avisa (no se cuenta)", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 10, 100)];
    const ls = [linea("", null, null, 123.45, "portes varios")];
    const r = casarFactura(ls, ings);
    expect(r.casos).toEqual([]);
    expect(r.sinCasar).toEqual([0]);
    expect(revisarFactura({ base: 123.45, iva: 0, total: 123.45, lineas: ls, sinCasar: [0], casos: [] }).join(" ")).toMatch(/sin nº de pedido/);
  });

  it("los trabajos anulados y los mantenimientos no reciben facturas", () => {
    const ings = [trabajo("I001", "4500000001", "casquillo demo", 10, 100, 0, { ESTADO: "anulado" }), trabajo("I002", "4500000001", "mant", 1, 50, 0, { TIPO: "mantenimiento" })];
    const [c] = casarFactura([linea("4500000001", 10, 100, 1000)], ings).casos;
    expect(c.id).toBeNull();
  });

  it("limpiaPedido deja solo cifras y letras", () => {
    expect(limpiaPedido("4500-000009")).toBe("4500000009");
    expect(limpiaPedido(" 4500 000009 ")).toBe("4500000009");
  });
});

describe("revisarFactura", () => {
  it("avisa si las líneas no suman la base", () => {
    const av = revisarFactura({ base: 1000, iva: 210, total: 1210, lineas: [linea("4500000001", 1, 800, 800)], sinCasar: [], casos: [] });
    expect(av.join(" ")).toMatch(/suman/);
  });
});
