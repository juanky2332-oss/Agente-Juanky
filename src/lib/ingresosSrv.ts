import "server-only";
// Operaciones de escritura de ingresos y cobros. Las usan la app (/api/ingresos) y el bot de
// Telegram (/api/bot/ingresos): una sola lógica, así los dos lados no pueden desincronizarse.
import { leerTabla, leerRangos, aTabla, aObjeto, anadirFila, modificarPorId, borrarPorIds, siguienteId, filaPorId } from "./sheets";
import { ErrorN8n, avisarTelegram, escHtml } from "./n8n";
import { aCobro, aDestino, montarIngresos, NEGOCIOS, normId, type Ingreso, type Destino } from "./ingresos";
import { num, tieneNumero, fechaISO, isoAEs, hoyISO, eur } from "./parse";

export interface EntradaIngreso {
  negocio?: string;
  cliente?: string;
  concepto?: string;
  referencia?: string;
  fecha?: string;
  importe?: number | string | null;
  totalTrabajo?: number | string | null;
  porcentaje?: number | string | null;
  unidades?: string | number;
  precioUnit?: number | string | null;
  tipo?: string;
  estado?: string;
  vencimiento?: string;
  notas?: string;
}

const dec = (n: number) => String(Math.round(n * 100) / 100);
const fechaHoja = (v: string | undefined) => {
  if (!v) return "";
  const f = fechaISO(v);
  if (!f) throw new ErrorN8n("Fecha no válida: " + v, 400);
  return isoAEs(f);
};

/** Pasa la entrada a columnas. Si hay unidades × precio o total × %, el importe sale solo. */
function aColumnas(e: EntradaIngreso, parcial = false): Record<string, string> {
  const o: Record<string, string> = {};
  const vacio = (v: unknown) => v === undefined;
  if (!vacio(e.negocio)) {
    const n = NEGOCIOS.find((x) => x.toLowerCase() === String(e.negocio).toLowerCase());
    if (!n) throw new ErrorN8n("Negocio no válido (Taller, Flownexion u Otro)", 400);
    o.NEGOCIO = n;
  } else if (!parcial) throw new ErrorN8n("Falta el negocio (Taller o Flownexion)", 400);
  for (const [k, c] of [["cliente", "CLIENTE"], ["concepto", "CONCEPTO"], ["referencia", "REFERENCIA"], ["tipo", "TIPO"], ["estado", "ESTADO"], ["notas", "NOTAS"]] as const)
    if (!vacio(e[k])) o[c] = String(e[k] ?? "").trim();
  if (!vacio(e.unidades)) o.UNIDADES = String(e.unidades ?? "").trim();
  if (!vacio(e.fecha)) o.FECHA = fechaHoja(e.fecha);
  if (!vacio(e.vencimiento)) o.VENCIMIENTO = fechaHoja(e.vencimiento);
  const n = (v: unknown) => (tieneNumero(v) ? num(v) : null);
  const uds = n(e.unidades), pu = n(e.precioUnit);
  let total = n(e.totalTrabajo);
  const pct = n(e.porcentaje);
  let imp = n(e.importe);
  if (total === null && uds !== null && pu !== null) total = uds * pu;
  if (imp === null && total !== null) imp = pct !== null ? (total * pct) / 100 : total;
  if (!vacio(e.precioUnit)) o.PRECIO_UNIT = pu === null ? "" : dec(pu);
  if (!vacio(e.porcentaje)) o.PORCENTAJE = pct === null ? "" : dec(pct);
  if (!vacio(e.totalTrabajo) || total !== null) o.TOTAL_TRABAJO = total === null ? "" : dec(total);
  if (!vacio(e.importe) || imp !== null) {
    if (imp !== null && imp < 0) throw new ErrorN8n("El importe no puede ser negativo", 400);
    o.IMPORTE = imp === null ? "" : dec(imp);
  }
  if (!parcial && !o.CONCEPTO) throw new ErrorN8n("Falta el concepto", 400);
  return o;
}

export async function leerIngresos(): Promise<Ingreso[]> {
  const [iv, cv] = await leerRangos(["'Ingresos'!A1:Z3000", "'Cobros'!A1:Z5000"]);
  const ti = aTabla("Ingresos", iv), tc = aTabla("Cobros", cv);
  const cobros = tc.filas.map((f) => aCobro(f.fila, aObjeto(tc, f.celdas))).filter((c) => c.id);
  return montarIngresos(ti.filas.map((f) => ({ fila: f.fila, o: aObjeto(ti, f.celdas) })), cobros, hoyISO());
}

const linea = (i: Pick<Ingreso, "id" | "negocio" | "cliente" | "concepto">) => `<code>#${i.id}</code> ${escHtml(i.negocio)} · ${escHtml(i.cliente ? i.cliente + " · " : "")}${escHtml(i.concepto)}`;

export async function crearIngreso(e: EntradaIngreso & { cobroInicial?: number | string; fechaCobro?: string; destinoCobro?: string }, avisar = true) {
  const t = await leerTabla("Ingresos");
  const id = siguienteId(t, "I");
  const cols = aColumnas(e);
  if (!cols.FECHA) cols.FECHA = isoAEs(hoyISO());
  await anadirFila("Ingresos", { ...cols, ID: id, ORIGEN: avisar ? "app" : "telegram" }, t.cabecera);
  let cobro: string | null = null;
  if (tieneNumero(e.cobroInicial) && num(e.cobroInicial) > 0) cobro = (await registrarCobro({ ingreso: id, importe: e.cobroInicial!, fecha: e.fechaCobro, destino: e.destinoCobro }, false)).id;
  if (avisar)
    await avisarTelegram(`💰 <b>Nuevo ingreso desde la app</b>\n${linea({ id, negocio: cols.NEGOCIO as Ingreso["negocio"], cliente: cols.CLIENTE || "", concepto: cols.CONCEPTO })}\nImporte: <b>${cols.IMPORTE ? eur(num(cols.IMPORTE)) : "sin precio"}</b>${cobro ? `\nYa cobrado: ${eur(num(e.cobroInicial))}` : ""}`);
  return { id, cobro };
}

export async function modificarIngreso(id: string, e: EntradaIngreso, avisar = true) {
  const cols = aColumnas(e, true);
  const { antes } = await modificarPorId("Ingresos", id, cols);
  if (avisar) {
    const cambios = Object.entries(cols).filter(([k, v]) => (antes[k] || "") !== v).map(([k, v]) => `${k.toLowerCase()}: ${escHtml(antes[k] || "—")} → ${escHtml(v || "—")}`);
    if (cambios.length) await avisarTelegram(`✏️ <b>Ingreso modificado desde la app</b> <code>#${id}</code>\n${cambios.join("\n")}`);
  }
  return { id };
}

export async function borrarIngreso(id: string, avisar = true) {
  const ings = await leerIngresos();
  const i = ings.find((x) => x.id === id);
  if (!i) throw new ErrorN8n(`#${id} ya no existe`, 404);
  // Primero los cobros (si fallara a medias, quedaría un ingreso sin cobros, nunca cobros huérfanos).
  if (i.cobros.length) await borrarPorIds("Cobros", i.cobros.map((c) => c.id));
  await borrarPorIds("Ingresos", [id]);
  if (avisar) await avisarTelegram(`🗑 <b>Ingreso borrado desde la app</b>\n${linea(i)}${i.cobros.length ? ` (y sus ${i.cobros.length} cobros)` : ""}`);
  return { id, cobrosBorrados: i.cobros.length };
}

/**
 * Apunta un pago. destino "yo" (por defecto) = te ha llegado a ti. destino "flownexion" = el
 * cliente ha pagado a Flownexion (solo en ingresos de Flownexion; el importe es TU PARTE de ese
 * pago y no cuenta como cobrado: pasa a ser dinero que Flownexion te debe).
 */
export async function registrarCobro(b: { ingreso: string; importe?: number | string; fecha?: string; metodo?: string; notas?: string; destino?: string }, avisar = true) {
  const destino: Destino = aDestino(b.destino);
  const ings = await leerIngresos();
  const i = ings.find((x) => x.id === normId(b.ingreso));
  if (!i) throw new ErrorN8n(`No encuentro el ingreso #${b.ingreso}`, 404);
  if (i.estado === "anulado") throw new ErrorN8n(`#${i.id} está anulado`, 400);
  if (i.importe === null) throw new ErrorN8n(`#${i.id} no tiene precio todavía: ponle importe antes de cobrarlo`, 400);
  if (destino === "flownexion" && i.negocio !== "Flownexion") throw new ErrorN8n(`#${i.id} es de ${i.negocio}: ahí el cliente te paga directo a ti, no a Flownexion`, 400);
  // Hueco que queda: a ti, lo pendiente; del cliente a Flownexion, lo que el cliente aún no ha pagado.
  const hueco = destino === "yo" ? i.pendiente : Math.round(((i.importe || 0) - i.clientePago) * 100) / 100;
  if (hueco <= 0.005) throw new ErrorN8n(destino === "yo" ? `#${i.id} ya te lo han pagado entero` : `El cliente ya pagó a Flownexion todo #${i.id}`, 400);
  const importe = tieneNumero(b.importe) ? num(b.importe) : hueco;
  if (!(importe > 0)) throw new ErrorN8n("El importe del cobro tiene que ser mayor que 0", 400);
  if (importe > hueco + 0.005) throw new ErrorN8n(`Solo quedan ${eur(hueco)} ${destino === "yo" ? "por cobrar" : "que el cliente no haya pagado"} de #${i.id}; has puesto ${eur(importe)}`, 400);
  const t = await leerTabla("Cobros");
  const id = siguienteId(t, "C");
  const fecha = b.fecha ? fechaHoja(b.fecha) : isoAEs(hoyISO());
  await anadirFila("Cobros", { ID: id, INGRESO: i.id, FECHA: fecha, IMPORTE: dec(importe), METODO: b.metodo || "", NOTAS: b.notas || "", DESTINO: destino }, t.cabecera);
  // Se relee para confirmar de verdad (regla de la casa: nunca "guardado" a ciegas).
  const despues = (await leerIngresos()).find((x) => x.id === i.id)!;
  const subio = destino === "yo" ? despues.cobrado > i.cobrado : despues.clientePago > i.clientePago;
  if (!subio) throw new ErrorN8n("He escrito el cobro pero al releer no aparece. Revisa la hoja Cobros.", 502);
  if (avisar)
    await avisarTelegram(
      destino === "yo"
        ? `✅ <b>Cobro apuntado desde la app</b>\n${linea(i)}\nTe han pagado: <b>${eur(importe)}</b>${b.metodo ? " (" + escHtml(b.metodo) + ")" : ""}\n${despues.pendiente > 0.005 ? `Queda pendiente: <b>${eur(despues.pendiente)}</b>` : "🎉 Cobrado entero"}`
        : `🏦 <b>El cliente ha pagado a Flownexion</b>\n${linea(i)}\nTu parte de ese pago: <b>${eur(importe)}</b>\nFlownexion te debe ahora de esto: <b>${eur(despues.debeFlownexion)}</b>`,
    );
  return { id, ingreso: i.id, importe, destino, pendiente: despues.pendiente, debeFlownexion: despues.debeFlownexion, estado: despues.estado };
}

export async function modificarCobro(id: string, b: { importe?: number | string; fecha?: string; metodo?: string; notas?: string; destino?: string }, avisar = true) {
  const c: Record<string, string> = {};
  if (b.importe !== undefined) {
    if (!(num(b.importe) > 0)) throw new ErrorN8n("Importe no válido", 400);
    c.IMPORTE = dec(num(b.importe));
  }
  if (b.fecha !== undefined) c.FECHA = b.fecha ? fechaHoja(b.fecha) : "";
  if (b.metodo !== undefined) c.METODO = b.metodo;
  if (b.notas !== undefined) c.NOTAS = b.notas;
  if (b.destino !== undefined) c.DESTINO = aDestino(b.destino);
  if (c.DESTINO === "flownexion") {
    const t = await leerTabla("Cobros");
    const f = filaPorId(t, id);
    const ing = f ? (await leerIngresos()).find((x) => x.id === aObjeto(t, f.celdas).INGRESO) : null;
    if (ing && ing.negocio !== "Flownexion") throw new ErrorN8n(`Ese pago es de ${ing.negocio}: ahí te pagan directo, no a través de Flownexion`, 400);
  }
  const { antes } = await modificarPorId("Cobros", id, c);
  if (avisar) await avisarTelegram(`✏️ <b>Cobro modificado desde la app</b> <code>${id}</code> (de #${escHtml(antes.INGRESO)}): ${escHtml(antes.IMPORTE)} → ${escHtml(c.IMPORTE || antes.IMPORTE)} €${c.DESTINO && c.DESTINO !== (antes.DESTINO || "yo") ? ` · ahora: ${c.DESTINO === "flownexion" ? "cliente → Flownexion" : "a ti"}` : ""}`);
  return { id };
}

export async function borrarCobro(id: string, avisar = true) {
  const t = await leerTabla("Cobros");
  const f = filaPorId(t, id);
  if (!f) throw new ErrorN8n(`El cobro ${id} ya no existe`, 404);
  const o = aObjeto(t, f.celdas);
  await borrarPorIds("Cobros", [id]);
  if (avisar) await avisarTelegram(`↩️ <b>Cobro borrado desde la app</b>: ${escHtml(o.IMPORTE)} € de #${escHtml(o.INGRESO)}`);
  return { id };
}
