// Facturas DEL TALLER que Juanky manda por foto o PDF a Telegram. Si le llega la factura, es que
// el taller ya ha cobrado ese trabajo: le toca su parte (10 %) y se apunta como cobrada.
// Aquí solo está el cálculo (sin red): casar cada línea de la factura con su trabajo por Nº DE
// PEDIDO, decir qué importe sale y montar la tarjeta. Lo que escribe en la hoja está en borradores.ts.
//
// REGLA: el nombre del taller (el emisor de la factura) NUNCA sale en ningún texto. Siempre «el taller».
import { normaliza, eur, isoAEs } from "./parse";
import { pedidoDe, nombreIngreso, type Ingreso } from "./ingresos";

/** Una línea de la factura tal y como la leyó la IA. importe = base de la línea, SIN IVA. */
export interface LineaFactura {
  pedido: string;
  occ: string;
  descripcion: string;
  unidades: number | null;
  precio: number | null;
  importe: number;
}

/** Cómo queda cada trabajo tras casarlo con la factura. */
export interface CasoTaller {
  lineas: number[]; // índices de las líneas de la factura que van a este trabajo
  id: string | null; // ingreso casado (null = trabajo que no estaba apuntado: se dará de alta)
  pedido: string;
  occ: string;
  concepto: string;
  totalFactura: number; // base de la factura para este trabajo
  unidades: number | null;
  precio: number | null;
  totalApp: number | null; // lo que había en la app (null = sin precio)
  porcentaje: number;
  tuyo: number; // tu parte según la factura
  yaCobrado: number; // lo que ya te había llegado de este trabajo
  aCobrar: number; // lo que se apunta como pagado al confirmar
  cambiaPrecio: boolean; // la factura corrige (o pone) el total del trabajo
  parcial: boolean; // entrega parcial: se cobra esta factura, el trabajo sigue con su total
  aviso: string;
}

export interface DatosTaller {
  numero: string;
  fecha: string; // ISO
  base: number;
  iva: number;
  total: number;
  lineas: LineaFactura[];
  casos: CasoTaller[];
  sinCasar: number[]; // líneas que no se han podido atribuir a ningún trabajo (sin pedido)
  avisos: string[];
  hechos?: { cobros: string[]; altas: string[] }; // tras confirmar
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Firma del emisor (variables de entorno, para que su nombre no esté ni en el código). No se
 * enseña nunca: solo sirve para reconocer sus facturas. Sin ellas, se reconoce por los pedidos.
 */
const EMISOR = process.env.TALLER_EMISOR ? new RegExp(process.env.TALLER_EMISOR, "i") : null;
const NIF_EMISOR = (process.env.TALLER_NIF || "").replace(/[^0-9A-Z]/gi, "").toUpperCase();

/** Pedido "limpio": solo cifras y letras ("Su pedido nº 4500-144834" → "4500144834"). */
export const limpiaPedido = (v: unknown) => String(v ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();

/**
 * ¿Es una factura del taller? Por el emisor, o porque sus pedidos son trabajos del taller que ya
 * tienes apuntados (con uno basta: los nº de pedido del taller son únicos, 4500…).
 */
export function esFacturaTaller(proveedor: string, nif: string, lineas: LineaFactura[], ings: Ingreso[]) {
  if (EMISOR && EMISOR.test(normaliza(proveedor))) return true;
  if (NIF_EMISOR && limpiaPedido(nif) === NIF_EMISOR) return true;
  const pedidos = new Set(ings.filter((i) => i.negocio === "Taller").map((i) => limpiaPedido(pedidoDe(i.referencia).pedido)).filter((p) => p.length >= 6));
  return lineas.some((l) => pedidos.has(limpiaPedido(l.pedido)));
}

/** Palabras con contenido (para comparar «eje según muestra» con «EJE S/MUESTRA Ø40»). */
const palabras = (s: string) => normaliza(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((p) => p.length >= 3 && !["seg", "segun", "para", "con", "los", "las", "del", "uds", "und"].includes(p));

function parecido(l: LineaFactura, i: Ingreso) {
  let s = 0;
  const a = palabras(l.descripcion), b = new Set(palabras(i.concepto));
  if (a.length && b.size) s += (a.filter((p) => b.has(p) || [...b].some((q) => q.startsWith(p.slice(0, 5)) || p.startsWith(q.slice(0, 5)))).length / Math.max(a.length, b.size)) * 3;
  if (l.occ && limpiaPedido(l.occ) === limpiaPedido(pedidoDe(i.referencia).occ)) s += 5;
  if (i.totalTrabajo && Math.abs(l.importe - i.totalTrabajo) < 0.02) s += 4;
  else if (i.totalTrabajo && l.importe < i.totalTrabajo && i.pendiente > 0.005) s += 0.5; // puede ser una entrega parcial
  if (i.precioUnit && l.precio && Math.abs(l.precio - i.precioUnit) < 0.005) s += 3;
  const uds = Number(String(i.unidades).replace(",", "."));
  if (l.unidades && uds && Math.abs(l.unidades - uds) < 0.001) s += 1;
  return s;
}

/**
 * Casa las líneas con los trabajos del taller. Por Nº DE PEDIDO; si un pedido tiene varias líneas
 * en la app (posición 1, 2, 3…), cada línea va al trabajo que más se le parece (descripción, OCC,
 * importe, precio, unidades). Si la factura trae más líneas que trabajos (material + mano de obra),
 * las que sobran se suman al más parecido. Pedido que no está en la app → trabajo nuevo.
 */
export function casarFactura(lineas: LineaFactura[], ings: Ingreso[]): { casos: CasoTaller[]; sinCasar: number[] } {
  const taller = ings.filter((i) => i.negocio === "Taller" && i.estado !== "anulado" && !/manten/i.test(i.tipo));
  const grupos = new Map<string, number[]>();
  const sinCasar: number[] = [];
  lineas.forEach((l, k) => {
    const p = limpiaPedido(l.pedido);
    if (p.length >= 4) grupos.set(p, [...(grupos.get(p) || []), k]);
    else {
      // Sin pedido: ¿la OCC lo dice?
      const porOcc = l.occ ? taller.find((i) => limpiaPedido(pedidoDe(i.referencia).occ) === limpiaPedido(l.occ)) : undefined;
      const pp = porOcc ? limpiaPedido(pedidoDe(porOcc.referencia).pedido) : "";
      if (pp) grupos.set(pp, [...(grupos.get(pp) || []), k]);
      else sinCasar.push(k);
    }
  });

  const casos: CasoTaller[] = [];
  for (const [pedido, ks] of grupos) {
    const cands = taller.filter((i) => limpiaPedido(pedidoDe(i.referencia).pedido) === pedido);
    const asignado = new Map<string, number[]>(); // id → líneas
    if (cands.length === 1) asignado.set(cands[0].id, ks);
    else if (cands.length > 1) {
      // Emparejamiento voraz por parecido: primero las parejas más claras.
      const pares = ks.flatMap((k) => cands.map((i) => ({ k, id: i.id, s: parecido(lineas[k], i) }))).sort((a, b) => b.s - a.s);
      const usadas = new Set<number>(), ocupados = new Set<string>();
      for (const p of pares) {
        if (usadas.has(p.k) || ocupados.has(p.id)) continue;
        usadas.add(p.k);
        ocupados.add(p.id);
        asignado.set(p.id, [p.k]);
      }
      // Sobran líneas (más líneas que trabajos): al trabajo más parecido.
      for (const k of ks.filter((k) => !usadas.has(k))) {
        const mejor = cands.map((i) => ({ id: i.id, s: parecido(lineas[k], i) })).sort((a, b) => b.s - a.s)[0];
        asignado.set(mejor.id, [...(asignado.get(mejor.id) || []), k]);
      }
    }
    if (!cands.length) {
      casos.push(caso(ks, null, lineas, pedido));
      continue;
    }
    for (const i of cands) if (asignado.has(i.id)) casos.push(caso(asignado.get(i.id)!, i, lineas, pedido));
  }

  // Sin pedido ni OCC: se busca entre los trabajos que aún te deben (o sin precio) el que más se
  // parece por descripción y precio. Solo si el parecido es claro; si no, la línea queda avisada.
  const usados = new Set(casos.map((c) => c.id));
  const abiertos = taller.filter((i) => !usados.has(i.id) && (i.pendiente > 0.005 || i.estado === "sin precio"));
  const porId = new Map<string, number[]>();
  const quedan: number[] = [];
  for (const k of sinCasar) {
    const xs = abiertos.map((i) => ({ i, s: parecido(lineas[k], i) })).sort((a, b) => b.s - a.s);
    const [m, seg] = xs;
    if (m && m.s >= 3 && (!seg || m.s - seg.s >= 1)) porId.set(m.i.id, [...(porId.get(m.i.id) || []), k]);
    else quedan.push(k);
  }
  for (const [id, ks] of porId) {
    const i = taller.find((x) => x.id === id)!;
    casos.push(caso(ks, i, lineas, limpiaPedido(pedidoDe(i.referencia).pedido), true));
  }
  return { casos, sinCasar: quedan };
}

function caso(ks: number[], i: Ingreso | null, lineas: LineaFactura[], pedido: string, porParecido = false): CasoTaller {
  const ls = ks.map((k) => lineas[k]);
  const totalFactura = r2(ls.reduce((s, l) => s + l.importe, 0));
  const una = ls.length === 1 ? ls[0] : null;
  const porcentaje = i?.porcentaje ?? 10;
  const tuyo = r2((totalFactura * porcentaje) / 100);
  const totalApp = i ? i.totalTrabajo : null;
  const udsApp = i ? Number(String(i.unidades).replace(",", ".")) || null : null;
  const udsFac = una?.unidades ?? null, precioFac = una?.precio ?? null;
  const fmtU = (n: number) => String(n).replace(".", ",");
  // ¿ENTREGA PARCIAL? El taller factura por entregas («se entregan 8 de 15»): la factura es menor
  // que el trabajo y el precio por unidad es el mismo (o menos unidades). Entonces NO se cambia el
  // precio del trabajo: se apunta tu parte de ESTA factura y el resto sigue pendiente.
  const mismoPrecio = !!(i?.precioUnit && precioFac && Math.abs(i.precioUnit - precioFac) < 0.01);
  const parcial = !!i && totalApp !== null && totalFactura < totalApp - 0.01 && (mismoPrecio || !udsFac || !udsApp || udsFac < udsApp);
  // Unidades y precio coherentes con el total (en «Trabajos taller» el total es uds × precio).
  const casaUna = una && udsFac && precioFac && Math.abs(udsFac * precioFac - totalFactura) < 0.02;
  const unidades = parcial ? udsApp : casaUna ? udsFac : udsApp || udsFac || 1;
  const precio = parcial ? i!.precioUnit : casaUna ? precioFac : Math.round((totalFactura / unidades!) * 10000) / 10000;
  const cambiaPrecio = !parcial && (!i || totalApp === null || Math.abs(totalApp - totalFactura) >= 0.01);
  const yaCobrado = i ? i.cobrado : 0;
  const pendiente = i ? i.pendiente : tuyo;
  const aCobrar = parcial ? Math.max(0, Math.min(tuyo, pendiente)) : Math.max(0, r2(tuyo - yaCobrado));
  const av: string[] = [];
  if (porParecido) av.push("La factura no trae nº de pedido: lo he casado por descripción y precio. Revísalo.");
  if (!i) av.push("No lo tenías apuntado: lo doy de alta.");
  else if (totalApp === null) av.push("No tenía precio en la app: le pongo el de la factura.");
  else if (parcial) {
    av.push(`Entrega parcial${udsFac && udsApp ? ` (${fmtU(udsFac)} de ${fmtU(udsApp)} uds)` : ""}: el trabajo entero son ${eur(totalApp)}; apunto tu parte de esta factura.`);
    if (!mismoPrecio && i.precioUnit && precioFac) av.push(`Ojo: precio por unidad distinto (app ${eur(i.precioUnit)}, factura ${eur(precioFac)}).`);
    if (yaCobrado > 0.005) av.push(`Ya te habían pagado ${eur(yaCobrado)} de este trabajo.`);
    if (tuyo > pendiente + 0.005) av.push(`Solo quedaban ${eur(pendiente)} por cobrar de este trabajo: apunto eso.`);
    const queda = r2(pendiente - aCobrar);
    av.push(queda > 0.005 ? `Después quedarán ${eur(queda)} por cobrar (lo que falte por entregar).` : "Con esta queda cobrado entero.");
  } else if (cambiaPrecio) av.push(`En la app tenías ${eur(totalApp)}; la factura dice ${eur(totalFactura)}: me quedo con la factura.`);
  if (i && !parcial && yaCobrado > 0.005) av.push(aCobrar > 0.005 ? `Ya te habían pagado ${eur(yaCobrado)}: apunto lo que falta.` : `Ya te lo habían pagado entero (${eur(yaCobrado)}): no apunto nada.`);
  if (!parcial && tuyo < yaCobrado - 0.005) av.push(`⚠️ Te pagaron más (${eur(yaCobrado)}) de lo que sale por la factura (${eur(tuyo)}).`);
  const occ = i ? pedidoDe(i.referencia).occ : ls.find((l) => l.occ)?.occ || "";
  return {
    lineas: ks, id: i?.id ?? null, pedido, occ,
    concepto: i?.concepto || ls.map((l) => l.descripcion).filter(Boolean).join(" + ").slice(0, 120) || "trabajo",
    totalFactura, unidades, precio,
    totalApp, porcentaje, tuyo, yaCobrado, aCobrar, cambiaPrecio, parcial, aviso: av.join(" "),
  };
}

/** Avisos de la factura entera (las cifras las comprueba el código, no la IA). */
export function revisarFactura(d: Pick<DatosTaller, "base" | "iva" | "total" | "lineas" | "sinCasar" | "casos">): string[] {
  const av: string[] = [];
  const suma = r2(d.lineas.reduce((s, l) => s + l.importe, 0));
  if (!d.lineas.length) av.push("No he sabido leer las líneas de la factura: revísala o mándame una foto más nítida.");
  if (d.base > 0 && d.lineas.length && Math.abs(suma - d.base) > Math.max(0.05, d.base * 0.005))
    av.push(`Las líneas suman ${eur(suma)} y la base de la factura es ${eur(d.base)}: puede que me falte alguna línea.`);
  for (const k of d.sinCasar) av.push(`Línea sin nº de pedido que no sé de qué trabajo es: «${d.lineas[k].descripcion || "?"}» (${eur(d.lineas[k].importe)}). No la cuento; dime el pedido si es tuya.`);
  if (d.casos.length && !d.casos.some((c) => c.aCobrar > 0.005)) av.push("De esta factura no queda nada por apuntarte.");
  return av;
}

/** Nombre de un trabajo para la tarjeta (por Nº DE PEDIDO, nunca por el emisor). */
function nombreCaso(c: CasoTaller, ings: Ingreso[]) {
  const i = c.id ? ings.find((x) => x.id === c.id) : null;
  if (i) return nombreIngreso(i);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<b>Pedido ${esc(c.pedido)}</b> · ${esc(c.concepto)}${c.occ ? ` (OCC ${esc(c.occ)})` : ""} <i>(nuevo)</i>`;
}

/** Tarjeta de Telegram de una factura del taller. */
export function tarjetaTaller(id: string, estado: string, d: DatosTaller, ings: Ingreso[]) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const totalCobro = r2(d.casos.reduce((s, c) => s + c.aCobrar, 0));
  const L: string[] = [];
  if (estado === "guardado") L.push(`✅ <b>Apuntado como pagado: ${eur(totalCobro)}</b>`, "");
  else if (estado === "descartado") L.push("🗑 <b>Descartada</b> (no he apuntado nada)", "");
  else L.push(`🔧 <b>Factura del taller</b> · <code>${id}</code>`, "");
  L.push(`📄 ${d.numero ? `Nº ${esc(d.numero)}` : "sin nº"} · ${d.fecha ? isoAEs(d.fecha) : "¿fecha?"} · base <b>${eur(d.base)}</b>${d.total ? ` (total con IVA ${eur(d.total)})` : ""}`, "");
  for (const c of d.casos) {
    L.push(`• ${nombreCaso(c, ings)}`);
    // Unidades × precio de la FACTURA (en una entrega parcial no son las del trabajo entero).
    const lf = c.lineas.length === 1 ? d.lineas[c.lineas[0]] : null;
    const detalle = lf?.unidades && lf.precio && Math.abs(lf.unidades * lf.precio - c.totalFactura) < 0.02 ? `${String(lf.unidades).replace(".", ",")} × ${eur(lf.precio)} = ` : "";
    L.push(`   Factura: ${detalle}<b>${eur(c.totalFactura)}</b> → tu ${String(c.porcentaje).replace(".", ",")} % = <b>${eur(c.tuyo)}</b>${c.aCobrar > 0.005 && Math.abs(c.aCobrar - c.tuyo) > 0.005 ? ` · se apuntan <b>${eur(c.aCobrar)}</b>` : ""}`);
    if (c.aviso) L.push(`   <i>${esc(c.aviso)}</i>`);
  }
  if (estado === "pendiente") {
    for (const a of d.avisos) L.push(`⚠️ ${esc(a)}`);
    L.push("", `💶 <b>Te toca: ${eur(totalCobro)}</b>`);
    // Lo que queda pendiente del taller que NO viene en esta factura (para que lo tenga a la vista).
    const enFactura = new Set(d.casos.map((c) => c.id).filter(Boolean));
    const resto = ings.filter((i) => i.negocio === "Taller" && /trabajo/i.test(i.tipo) && i.pendiente > 0.005 && !enFactura.has(i.id));
    if (resto.length) L.push(`<i>Del taller te quedarían por cobrar ${resto.length} trabajos más (${eur(r2(resto.reduce((s, i) => s + i.pendiente, 0)))}).</i>`);
    L.push("", totalCobro > 0.005 ? "¿Está bien? Pulsa ✅ y lo apunto como <b>pagado</b>. Si algo no cuadra, dímelo (p. ej. <i>«el pedido 4500144834 son 1.480»</i>)." : "No hay nada que apuntar: puedes descartarla.");
  } else if (estado === "guardado" && d.hechos) {
    L.push("", `<i>Pagos ${d.hechos.cobros.map((x) => esc(x)).join(", ") || "—"}${d.hechos.altas.length ? ` · trabajos nuevos ${d.hechos.altas.map((x) => "#" + esc(x)).join(", ")}` : ""}</i>`);
  }
  return L.join("\n");
}
