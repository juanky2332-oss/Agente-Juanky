import "server-only";
// Operaciones en bloque sobre ingresos: pagar varios meses de una vez y cambiar el reparto (%).
// Las usan la app (/api/ingresos/bloque) y el bot (/api/bot/ingresos): una sola lógica.
import { leerRangos, aTabla, aObjeto, anadirFilas, modificarVariosPorId, siguienteId } from "./sheets";
import { ErrorN8n, avisarTelegram, escHtml } from "./n8n";
import {
  aCobro, aDestino, montarIngresos, seleccionar, huecoDe, conceptoConPorcentaje, leerReparto, nombreMes, escalarPagosCliente, proyectosFlownexion, aMes,
  type Ingreso, type Destino, type Seleccion,
} from "./ingresos";
import { aProgramado, ocurrencias, idGenerado, filaIngreso, type Programado } from "./programados";
import { leerIngresos, fechaHoja, r2, dec } from "./ingresosSrv";
import { num, tieneNumero, isoAEs, hoyISO, eur, normaliza } from "./parse";

async function leerTodo() {
  const [iv, cv, pv] = await leerRangos(["'Ingresos'!A1:Z3000", "'Cobros'!A1:Z5000", "'Programados'!A1:Z300"]);
  const ti = aTabla("Ingresos", iv), tc = aTabla("Cobros", cv), tp = aTabla("Programados", pv);
  const cobros = tc.filas.map((f) => aCobro(f.fila, aObjeto(tc, f.celdas))).filter((c) => c.id);
  const ings = montarIngresos(ti.filas.map((f) => ({ fila: f.fila, o: aObjeto(ti, f.celdas) })), cobros, hoyISO());
  const progs = tp.filas.map((f) => aProgramado(f.fila, aObjeto(tp, f.celdas))).filter((p) => p.id && p.tipo === "ingreso");
  return { ti, tc, tp, ings, progs };
}

/** Cómo quedaría como ingreso la línea que genera un programado (para saber si entra en una selección). */
function comoIngreso(p: Programado, fecha: string): Ingreso {
  const f = filaIngreso({ p, fecha, id: idGenerado(p, fecha), importeEur: p.importe });
  return montarIngresos([{ fila: 0, o: f as Record<string, string> }], [])[0];
}

/** seleccionar() es compartido con el cliente y lanza Error normal: aquí pasa a 400. */
function aplicarSel(ings: Ingreso[], s: Seleccion) {
  try {
    return seleccionar(ings, s);
  } catch (e) {
    throw new ErrorN8n((e as Error).message, 400);
  }
}

export interface EntradaVarios extends Seleccion {
  destino?: string; // "yo" (te han pagado a ti) | "flownexion" (el cliente pagó a Flownexion)
  fecha?: string;
  metodo?: string;
  notas?: string;
  simular?: boolean;
}

export interface ResultadoVarios {
  destino: Destino;
  apuntados: { cobro: string; ingreso: string; negocio: string; concepto: string; fecha: string | null; importe: number }[];
  omitidos: { ingreso: string; concepto: string; motivo: string }[];
  creados: string[]; // líneas de meses que aún no existían (creadas desde su programado)
  total: number;
  simulado: boolean;
  texto: string;
}

/**
 * Marca como pagados de una vez varios ingresos: "el mantenimiento de agosto a septiembre",
 * "#I032 #I033"... Cada uno se paga ENTERO (lo que le falta) con la misma fecha. Si el rango
 * incluye meses cuya línea aún no existe y hay un ingreso programado activo que los genera
 * (p.ej. el mantenimiento del taller pagado por adelantado), se crea esa línea y se paga.
 */
export async function pagarVarios(b: EntradaVarios, avisar = true): Promise<ResultadoVarios> {
  const destino: Destino = aDestino(b.destino);
  if (!(b.ids && b.ids.length) && !b.busqueda && !b.desde && !b.tipo && !b.negocio && !b.cliente)
    throw new ErrorN8n("Dime qué pagar: unos IDs (#I032 #I033) o qué y de qué meses (p.ej. mantenimiento de agosto a septiembre)", 400);
  const fecha = b.fecha ? fechaHoja(b.fecha) : isoAEs(hoyISO());
  const todo = await leerTodo();
  const progs = todo.progs;
  let { ti, tc, ings } = todo;
  let sel = aplicarSel(ings, b);
  if (sel.faltan.length) throw new ErrorN8n(`No encuentro ${sel.faltan.map((x) => "#" + x).join(", ")}`, 404);

  // Meses del rango sin línea que un programado activo generaría.
  const nuevas: Record<string, string>[] = [];
  if (sel.meses.length) {
    const existentes = new Set(ings.map((i) => i.id));
    const tope = sel.meses[sel.meses.length - 1] + "-28";
    for (const p of progs.filter((x) => x.activo && x.importe > 0 && x.desde)) {
      for (const f of ocurrencias(p, tope)) {
        const id = idGenerado(p, f);
        if (!sel.meses.includes(f.slice(0, 7)) || existentes.has(id)) continue;
        if (aplicarSel([comoIngreso(p, f)], { ...b, ids: undefined }).lista.length) nuevas.push(filaIngreso({ p, fecha: f, id, importeEur: p.importe }));
      }
    }
  }
  const creados = nuevas.map((n) => n.ID);
  if (nuevas.length && !b.simular) {
    await anadirFilas("Ingresos", nuevas, ti.cabecera);
    ({ ti, tc, ings } = await leerTodo());
    sel = aplicarSel(ings, b);
  } else if (nuevas.length) {
    sel = { ...sel, lista: [...sel.lista, ...nuevas.map((n) => montarIngresos([{ fila: 0, o: n }], [])[0])] };
  }

  const apuntar: { i: Ingreso; importe: number }[] = [];
  const omitidos: ResultadoVarios["omitidos"] = [];
  for (const i of sel.lista) {
    if (i.importe === null) omitidos.push({ ingreso: i.id, concepto: i.concepto, motivo: "sin precio todavía" });
    else if (destino === "flownexion" && i.negocio !== "Flownexion") omitidos.push({ ingreso: i.id, concepto: i.concepto, motivo: `es de ${i.negocio}: te pagan directo, no a través de Flownexion` });
    else {
      const h = huecoDe(i, destino);
      if (h <= 0.005) omitidos.push({ ingreso: i.id, concepto: i.concepto, motivo: destino === "yo" ? "ya te lo habían pagado" : "el cliente ya lo había pagado a Flownexion" });
      else apuntar.push({ i, importe: h });
    }
  }
  const res: ResultadoVarios = {
    destino,
    apuntados: apuntar.map((x) => ({ cobro: "", ingreso: x.i.id, negocio: x.i.negocio, concepto: x.i.concepto, fecha: x.i.fecha, importe: x.importe })),
    omitidos,
    creados,
    total: r2(apuntar.reduce((s, x) => s + x.importe, 0)),
    simulado: !!b.simular,
    texto: "",
  };
  if (!apuntar.length && !sel.lista.length)
    throw new ErrorN8n("No hay ningún ingreso que encaje con eso" + (sel.meses.length ? ` en ${sel.meses.map(nombreMes).join(", ")}` : "") + ". Prueba con los IDs (#I032).", 404);
  if (!apuntar.length || b.simular) return { ...res, texto: textoVarios(res) };

  let n = +siguienteId(tc, "C").slice(1);
  const filas = apuntar.map((x) => ({ ID: "C" + String(n++).padStart(3, "0"), INGRESO: x.i.id, FECHA: fecha, IMPORTE: dec(x.importe), METODO: b.metodo || "", NOTAS: b.notas || "", DESTINO: destino }));
  await anadirFilas("Cobros", filas, tc.cabecera);
  // Se relee para confirmar de verdad (nunca "guardado" a ciegas).
  const despues = await leerIngresos();
  const fallan = apuntar.filter((x) => {
    const d = despues.find((y) => y.id === x.i.id);
    return !d || huecoDe(d, destino) > 0.005;
  });
  if (fallan.length) throw new ErrorN8n(`He escrito los pagos pero al releer ${fallan.map((x) => "#" + x.i.id).join(", ")} no sale pagado. Revisa la hoja Cobros.`, 502);
  res.apuntados = res.apuntados.map((a, k) => ({ ...a, cobro: filas[k].ID }));
  res.texto = textoVarios(res);
  if (avisar) await avisarTelegram("📲 <i>Desde la app</i>\n" + res.texto);
  return res;
}

function textoVarios(r: ResultadoVarios) {
  const L = [
    r.simulado
      ? `🔎 <b>Esto es lo que apuntaría</b> (${r.destino === "yo" ? "te han pagado a ti" : "el cliente ha pagado a Flownexion"})`
      : r.destino === "yo"
        ? `✅ <b>Pagos apuntados</b>: te han pagado <b>${eur(r.total)}</b>`
        : `🏦 <b>Apuntado: el cliente ha pagado a Flownexion</b> (tu parte, ${eur(r.total)}). Flownexion te lo debe`,
  ];
  for (const a of r.apuntados) L.push(`• <code>#${a.ingreso}</code> ${escHtml(a.concepto)} — <b>${eur(a.importe)}</b>${a.cobro ? ` <code>${a.cobro}</code>` : ""}`);
  if (r.creados.length) L.push(`🆕 Creé la línea de ${r.creados.length === 1 ? "un mes que aún no existía" : r.creados.length + " meses que aún no existían"} (${r.creados.join(", ")}).`);
  if (r.omitidos.length) {
    L.push("", "No toqué:");
    for (const o of r.omitidos) L.push(`• <code>#${o.ingreso}</code> ${escHtml(o.concepto)}: ${escHtml(o.motivo)}`);
  }
  if (!r.apuntados.length) L.push("", "No había nada que apuntar.");
  else if (r.simulado) L.push("", `Total: <b>${eur(r.total)}</b>`);
  return L.join("\n");
}

export interface EntradaReparto extends Seleccion {
  porcentaje: number | string;
  programados?: boolean; // también la plantilla de los meses que vienen (por defecto sí)
  simular?: boolean;
}

export interface ResultadoReparto {
  porcentaje: number;
  cambios: { ingreso: string; concepto: string; total: number; antes: number | null; despues: number; pagosCliente: number }[];
  programados: { id: string; nombre: string; antes: number; despues: number }[];
  omitidos: { ingreso: string; concepto: string; motivo: string }[];
  diferencia: number;
  simulado: boolean;
  texto: string;
}

/**
 * Cambia tu % en varios ingresos a la vez y lo recalcula todo: lo tuyo (total × %), el "NN %"
 * del concepto, los pagos del cliente a Flownexion (que están en tu parte) y la plantilla
 * programada de los meses que vienen. Ej.: mantenimientos de Flownexion del 30 % al 60 %
 * (30 % consultor + 30 % desarrollador).
 */
export async function cambiarReparto(b: EntradaReparto, avisar = true): Promise<ResultadoReparto> {
  if (!tieneNumero(b.porcentaje)) throw new ErrorN8n("Falta el nuevo porcentaje", 400);
  const pct = num(b.porcentaje);
  if (!(pct > 0 && pct <= 100)) throw new ErrorN8n("El porcentaje tiene que estar entre 0 y 100", 400);
  if (!(b.ids && b.ids.length) && !b.busqueda && !b.tipo && !b.negocio && !b.cliente) throw new ErrorN8n("Dime a qué ingresos: IDs, o negocio/tipo/proyecto (p.ej. mantenimientos de Flownexion)", 400);
  const { ti, tc, tp, ings, progs } = await leerTodo();
  const sel = aplicarSel(ings, b);
  if (sel.faltan.length) throw new ErrorN8n(`No encuentro ${sel.faltan.map((x) => "#" + x).join(", ")}`, 404);

  const cambiosI = new Map<string, Record<string, string>>();
  const cambiosC = new Map<string, Record<string, string>>();
  const cambios: ResultadoReparto["cambios"] = [];
  const omitidos: ResultadoReparto["omitidos"] = [];
  for (const i of sel.lista) {
    const total = i.totalTrabajo ?? leerReparto(i.concepto)?.total ?? null;
    if (!total) { omitidos.push({ ingreso: i.id, concepto: i.concepto, motivo: "no tiene el total del trabajo: no sé de qué sacar el %" }); continue; }
    const nuevo = r2((total * pct) / 100);
    if (i.porcentaje !== null && Math.abs(i.porcentaje - pct) < 0.005 && i.importe !== null && Math.abs(i.importe - nuevo) < 0.005) { omitidos.push({ ingreso: i.id, concepto: i.concepto, motivo: `ya estaba al ${pct} %` }); continue; }
    if (i.cobrado > nuevo + 0.005) { omitidos.push({ ingreso: i.id, concepto: i.concepto, motivo: `ya te han pagado ${eur(i.cobrado)}, más que lo nuevo (${eur(nuevo)})` }); continue; }
    const concepto = conceptoConPorcentaje(i.concepto, pct);
    cambiosI.set(i.id, { PORCENTAJE: dec(pct), TOTAL_TRABAJO: dec(total), IMPORTE: dec(nuevo), CONCEPTO: concepto });
    const esc = escalarPagosCliente(i, nuevo);
    for (const [k, v] of esc) cambiosC.set(k, v);
    const pagosCliente = r2(i.cobros.filter((c) => c.destino === "flownexion").reduce((s, c) => s + (esc.has(c.id) ? num(esc.get(c.id)!.IMPORTE) : c.importe), 0));
    cambios.push({ ingreso: i.id, concepto, total, antes: i.importe, despues: nuevo, pagosCliente });
  }

  // Plantillas de los meses que vienen que caen en la misma selección.
  const cambiosP = new Map<string, Record<string, string>>();
  const programados: ResultadoReparto["programados"] = [];
  if (b.programados !== false) {
    const clientes = new Set(sel.lista.map((i) => `${i.negocio}|${i.cliente}`));
    for (const p of progs) {
      const fake = comoIngreso(p, p.desde || hoyISO());
      const entra = b.ids && b.ids.length
        ? clientes.has(`${fake.negocio}|${fake.cliente}`) && /manten/i.test(fake.tipo)
        : aplicarSel([fake], { ...b, desde: undefined, hasta: undefined }).lista.length > 0;
      if (!entra) continue;
      const rep = leerReparto(p.concepto);
      if (!rep) continue; // sin "(NN % de X €)" no se sabe el total: se deja como está
      const nuevo = r2((rep.total * pct) / 100);
      if (Math.abs(nuevo - p.importe) < 0.005) { omitidos.push({ ingreso: p.id, concepto: `${p.nombre} (programado)`, motivo: `ya estaba al ${pct} % (${eur(nuevo)}/mes)` }); continue; }
      const pctTxt = String(pct).replace(".", ",");
      cambiosP.set(p.id, { IMPORTE: dec(nuevo), CONCEPTO: conceptoConPorcentaje(p.concepto, pct), NOTAS: p.notas.replace(/\d+(?:[.,]\d+)?\s*% de (\d)/g, `${pctTxt} % de $1`) });
      programados.push({ id: p.id, nombre: p.nombre, antes: p.importe, despues: nuevo });
    }
  }
  const res: ResultadoReparto = {
    porcentaje: pct, cambios, programados, omitidos, simulado: !!b.simular, texto: "",
    diferencia: r2(cambios.reduce((s, c) => s + c.despues - (c.antes || 0), 0)),
  };
  if (!cambios.length && !programados.length && !omitidos.length) throw new ErrorN8n("No hay ningún ingreso que encaje con eso", 404);
  if (!b.simular && (cambios.length || programados.length)) {
    // Primero Cobros y Programados; Ingresos al final: si algo fallara a medias, al repetir la
    // operación los ingresos no cambiados vuelven a entrar y los cobros se reescalan desde ahí.
    if (cambiosC.size) await modificarVariosPorId("Cobros", cambiosC, tc);
    if (cambiosP.size) await modificarVariosPorId("Programados", cambiosP, tp);
    if (cambiosI.size) await modificarVariosPorId("Ingresos", cambiosI, ti);
    const despues = await leerIngresos();
    const mal = cambios.filter((c) => Math.abs((despues.find((d) => d.id === c.ingreso)?.importe ?? -1) - c.despues) > 0.005);
    if (mal.length) throw new ErrorN8n(`He escrito el cambio pero al releer ${mal.map((m) => "#" + m.ingreso).join(", ")} no cuadra. Revisa la hoja Ingresos.`, 502);
  }
  res.texto = textoReparto(res);
  if (avisar && !b.simular && (cambios.length || programados.length)) await avisarTelegram("📲 <i>Desde la app</i>\n" + res.texto);
  return res;
}

function textoReparto(r: ResultadoReparto) {
  const L = [r.simulado ? `🔎 <b>Así quedaría con tu parte al ${r.porcentaje} %</b>` : `🔁 <b>Reparto cambiado: tu parte ahora es el ${r.porcentaje} %</b>`];
  for (const c of r.cambios)
    L.push(`• <code>#${c.ingreso}</code> ${escHtml(c.concepto)}: ${c.antes === null ? "sin precio" : eur(c.antes)} → <b>${eur(c.despues)}</b>${c.pagosCliente ? ` <i>(cliente → Flownexion: ${eur(c.pagosCliente)})</i>` : ""}`);
  for (const p of r.programados) L.push(`• 🔁 ${escHtml(p.nombre)} (<code>${p.id}</code>, los meses que vienen): ${eur(p.antes)} → <b>${eur(p.despues)}</b>/mes`);
  if (r.cambios.length) L.push("", `Diferencia en lo tuyo: <b>${r.diferencia >= 0 ? "+" : ""}${eur(r.diferencia)}</b>`);
  if (!r.cambios.length && !r.programados.length) L.push("", "No había nada que cambiar.");
  if (r.omitidos.length) {
    L.push("", "No toqué:");
    for (const o of r.omitidos) L.push(`• <code>#${o.ingreso}</code> ${escHtml(o.concepto)}: ${escHtml(o.motivo)}`);
  }
  return L.join("\n");
}


/** Estado de cada proyecto de Flownexion (app + mantenimiento + plan de los meses que vienen). */
export async function leerProyectos() {
  const { ings, progs } = await leerTodo();
  return proyectosFlownexion(ings, progs);
}

/**
 * Enciende/apaga el mantenimiento programado de un proyecto ("Rodamientos empieza en noviembre").
 * Solo toca la plantilla (Programados): las líneas de cada mes se crean solas cuando llega el mes.
 */
export async function planMantenimiento(b: { busqueda: string; desde?: string; activo?: boolean }, avisar = true) {
  const { tp, progs } = await leerTodo();
  const q = normaliza(b.busqueda).replace(/proyecto|mantenimiento|manten/g, "").trim();
  const porId = progs.filter((p) => p.id.toUpperCase() === b.busqueda.trim().replace(/^#/, "").toUpperCase());
  const xs = porId.length ? porId : progs.filter((p) => q.split(" ").filter(Boolean).every((w) => (" " + normaliza(`${p.nombre} ${p.notas} ${p.concepto}`) + " ").includes(/^\d+$/.test(w) ? " " + w + " " : w)));
  if (!xs.length) throw new ErrorN8n(`No encuentro ningún mantenimiento programado con «${b.busqueda}»`, 404);
  if (xs.length > 1) throw new ErrorN8n(`Hay ${xs.length}: ${xs.map((p) => p.id + " " + p.nombre).join(", ")}. Dime cuál.`, 400);
  const p = xs[0];
  const activo = b.activo !== false;
  const c: Record<string, string> = { ACTIVO: activo ? "sí" : "no" };
  if (activo) {
    const mes = b.desde ? aMes(b.desde) : null;
    if (!mes) throw new ErrorN8n("Dime desde qué mes empieza (p.ej. «noviembre 2026»)", 400);
    c.DESDE = isoAEs(`${mes}-${String(p.dia).padStart(2, "0")}`);
  }
  await modificarVariosPorId("Programados", new Map([[p.id, c]]), tp);
  const txt = activo
    ? `🔁 <b>Mantenimiento en marcha</b>: ${escHtml(p.nombre)} (<code>${p.id}</code>) · ${eur(p.importe)}/mes para ti desde ${nombreMes(aMes(b.desde)!)}. Cada mes se crea sola la línea por cobrar.`
    : `⏸ <b>Mantenimiento parado</b>: ${escHtml(p.nombre)} (<code>${p.id}</code>). No se crean más meses.`;
  if (avisar) await avisarTelegram("📲 <i>Desde la app</i>\n" + txt);
  return { id: p.id, texto: txt };
}
