import "server-only";
// Sincronización en los dos sentidos de «Trabajos flownexion» (la hoja de proyectos que Juanky
// lleva a mano) con Ingresos + Cobros + Programados.
//
// Cada fila es un PROYECTO, enlazado por la columna «ID APP» = "Proyecto N":
//   - Flownexion: los ingresos cuyo CLIENTE empieza por "Proyecto N ·" y su programado de
//     mantenimiento ("Cliente: Proyecto N · ..." en NOTAS).
//   - Pagado directo por el taller (Proyecto 3 · Taller versión 2): el programado cuyas NOTAS
//     dicen "Proyecto 3 ·" y las líneas que genera (P-P09-AAAA-MM).
// Columnas: Total proyecto («1350€ + 200€ mto/mes») · Gano por la app · gano por el mto ·
// Pago inicial / Segundo pago (lo que el cliente pagó a Flownexion, tu parte) · Mantenimientos
// (meses pagados, o «desde noviembre 2026» para que empiece) · Total pagado (lo que te ha
// llegado a ti). «Total mto» y «Falta por pagar» las calcula la app.
// Igual que «Trabajos taller»: una foto por proyecto (pestaña oculta «Sync hojas») dice quién
// cambió cada campo. Hoja ≠ foto → manda la hoja; si no → manda la app.
import { leerRangos, aTabla, aObjeto, letra, anadirFila, modificarVariosPorId, escribirCelda, siguienteId } from "./sheets";
import { n8n, ErrorN8n, escHtml } from "./n8n";
import { aCobro, montarIngresos, nombreMes, leerReparto, type Ingreso } from "./ingresos";
import { aProgramado, filaIngreso, idGenerado, type Programado } from "./programados";
import { crearIngreso, modificarIngreso, registrarCobro, modificarCobro, borrarCobro } from "./ingresosSrv";
import { num, tieneNumero, normaliza, fechaISO, hoyISO, isoAEs } from "./parse";

const HOJA = "Trabajos flownexion";
const FOTOS = "Sync hojas";
const CAB_ID = "ID APP";

const CAMPOS = ["total", "mto", "app", "mtoTuyo", "p1", "p2", "meses", "desde", "pagado"] as const;
type Campo = (typeof CAMPOS)[number];
type Vals = Record<Campo, string>;

const r2 = (n: number) => (Number.isFinite(n) && Math.abs(n) < 1e15 ? Number(Math.round(Number(n + "e2")) + "e-2") : 0);
const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const nn = (v: unknown) => {
  if (!tieneNumero(v)) return "";
  const n = r2(num(v));
  return Math.abs(n) < 0.005 ? "" : String(n);
};
/** Primer número de un texto libre («50€ (restando 25€ supabase)» → 50). */
const primerNum = (v: unknown) => {
  const m = String(v ?? "").match(/\d[\d.,]*/);
  return m ? nn(m[0].replace(/[.,]$/, "")) : "";
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Abril,Mayo, junio y Septiembre 2026», «desde noviembre 2026», 01/10/2026 o un nº de serie de fecha. */
export function leerMeses(v: unknown, hoy = hoyISO()): { meses: string[]; desde: string } {
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(String(v ?? "").trim())) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(num(v)) * 86400000).toISOString().slice(0, 7);
    return { meses: [], desde: d };
  }
  const t = normaliza(v);
  if (!t) return { meses: [], desde: "" };
  const f = fechaISO(t);
  if (f && /^\d/.test(t)) return { meses: [], desde: f.slice(0, 7) };
  const out: { mes: number; anio: number | null; desde: boolean }[] = [];
  let desde = false;
  for (const m of t.matchAll(/[a-z]+|\d{4}/g)) {
    const w = m[0];
    if (/^\d{4}$/.test(w)) {
      for (const x of out) if (x.anio === null) x.anio = +w;
      continue;
    }
    if (w === "desde" || w === "empieza" || w === "inicio") {
      desde = true;
      continue;
    }
    const k = w.length >= 3 ? MESES.findIndex((x) => x.startsWith(w.slice(0, 3)) || (w === "setiembre" && x === "septiembre")) : -1;
    if (k >= 0) {
      out.push({ mes: k + 1, anio: null, desde });
      desde = false;
    }
  }
  const clave = (x: (typeof out)[number]) => `${x.anio ?? hoy.slice(0, 4)}-${String(x.mes).padStart(2, "0")}`;
  return {
    meses: [...new Set(out.filter((x) => !x.desde).map(clave))].sort(),
    desde: out.find((x) => x.desde) ? clave(out.find((x) => x.desde)!) : "",
  };
}

/** Meses en el estilo de su hoja: «Abril, Mayo y Junio 2026», agrupados por año. */
export function textoMeses(meses: string[]): string {
  const porAnio = new Map<string, string[]>();
  for (const m of [...meses].sort()) porAnio.set(m.slice(0, 4), [...(porAnio.get(m.slice(0, 4)) || []), cap(MESES[+m.slice(5, 7) - 1])]);
  return [...porAnio].map(([a, ns]) => (ns.length > 1 ? ns.slice(0, -1).join(", ") + " y " + ns[ns.length - 1] : ns[0]) + " " + a).join(", ");
}

// ─── Proyectos en la app ────────────────────────────────────────────────────────────────

interface Proyecto {
  clave: string; // "Proyecto 3"
  nombre: string; // "Taller versión 2"
  directo: boolean; // le paga el taller directo (sin Flownexion)
  app: Ingreso[];
  mant: Ingreso[];
  plan: Programado | null;
  vals: Vals;
  totalMto: number; // H: lo tuyo de los meses pagados
  falta: number; // J: lo que te deben ya
}

const numProyecto = (s: string) => s.match(/proyecto\s*(\d+)\s*·/i)?.[1] || s.match(/^\s*proyecto\s*(\d+)/i)?.[1] || null;
const mesPagado = (i: Ingreso, directo: boolean) => !!i.importe && (directo ? i.cobrado >= i.importe - 0.005 : i.clientePago >= i.importe - 0.005 || i.cobrado >= i.importe - 0.005);
/** Total del mantenimiento que dice la plantilla: «(60 % de 175 €)» o «(75 € − 25 € ...)». */
const totalPlan = (p: Programado) => leerReparto(p.concepto)?.total ?? (p.concepto.match(/\(\s*(\d[\d.,]*)\s*€/) ? num(p.concepto.match(/\(\s*(\d[\d.,]*)\s*€/)![1]) : null);

export function proyectos(ings: Ingreso[], progs: Programado[]): Proyecto[] {
  const vivos = ings.filter((i) => i.estado !== "anulado");
  const planes = progs.filter((p) => p.tipo === "ingreso" && numProyecto(p.notas));
  const claves = new Set<string>();
  for (const i of vivos) if (i.negocio === "Flownexion" && numProyecto(i.cliente)) claves.add(numProyecto(i.cliente)!);
  for (const p of planes) claves.add(numProyecto(p.notas)!);
  return [...claves].sort((a, b) => +a - +b).map((n) => {
    const plan = planes.find((p) => numProyecto(p.notas) === n) || null;
    const directo = !!plan && normaliza(plan.negocio) !== "flownexion";
    const delProy = vivos.filter((i) => i.negocio === "Flownexion" && numProyecto(i.cliente) === n);
    const app = delProy.filter((i) => !/manten/i.test(i.tipo));
    const mant = (directo ? vivos.filter((i) => i.id.startsWith(`P-${plan!.id}-`)) : delProy.filter((i) => /manten/i.test(i.tipo))).sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    const nombre = (delProy[0]?.cliente || plan?.notas.match(/Proyecto\s*\d+\s*·\s*([^.]+)/i)?.[0] || "").replace(/^.*?·\s*/, "").trim();
    const pagados = mant.filter((m) => mesPagado(m, directo));
    const cliente = app[0] ? app[0].cobros.filter((c) => c.destino === "flownexion") : [];
    const suma = (xs: number[]) => r2(xs.reduce((s, x) => s + x, 0));
    const ultMant = mant[mant.length - 1];
    const vals: Vals = {
      total: nn(suma(app.map((i) => i.totalTrabajo || 0))),
      mto: nn((plan && totalPlan(plan)) ?? ultMant?.totalTrabajo ?? 0),
      app: nn(suma(app.map((i) => i.importe || 0))),
      mtoTuyo: nn(plan ? plan.importe : ultMant?.importe ?? 0),
      p1: nn(cliente[0]?.importe ?? 0),
      p2: nn(suma(cliente.slice(1).map((c) => c.importe))),
      meses: pagados.map((m) => m.fecha!.slice(0, 7)).filter(Boolean).join(","),
      desde: !pagados.length && plan?.activo && plan.desde ? plan.desde.slice(0, 7) : "",
      pagado: nn(suma([...app, ...mant].map((i) => i.cobrado))),
    };
    return {
      clave: "Proyecto " + n, nombre, directo, app, mant, plan, vals,
      totalMto: suma(pagados.map((m) => m.importe || 0)),
      falta: suma([...app, ...mant].map((i) => (directo || i.negocio !== "Flownexion" ? i.pendiente : i.debeFlownexion))),
    };
  });
}

// ─── La hoja ────────────────────────────────────────────────────────────────────────────

interface Cols { nombre: number; total: number; app: number; mtoTuyo: number; p1: number; p2: number; meses: number; totalMto: number; pagado: number; falta: number; id: number }
function columnas(cab: string[]): Cols {
  const b = (re: RegExp) => cab.findIndex((c) => re.test(normaliza(c)));
  const c: Cols = {
    nombre: 0, total: b(/^total proyecto/), app: b(/gano por la app/), mtoTuyo: b(/gano por el m/), p1: b(/^pago inicial/), p2: b(/^segundo pago/),
    meses: b(/^mantenimientos?$/), totalMto: b(/^total mto/), pagado: b(/^total pagado/), falta: b(/^falta por pagar/), id: cab.findIndex((x) => txt(x).toUpperCase() === CAB_ID),
  };
  for (const [k, v] of Object.entries(c)) if (k !== "id" && v < 0) throw new ErrorN8n(`La hoja «${HOJA}» ha cambiado: no encuentro la columna «${k}». No sincronizo nada.`, 500);
  return c;
}

function valsHoja(f: unknown[], c: Cols): Vals {
  const b = txt(f[c.total]);
  let total = "", mto = "";
  for (const parte of b.split("+")) {
    if (/mto|mant|mes/i.test(parte)) mto = primerNum(parte);
    else if (!total) total = primerNum(parte);
  }
  const m = leerMeses(f[c.meses]);
  return {
    total, mto,
    app: nn(f[c.app]),
    mtoTuyo: primerNum(f[c.mtoTuyo]),
    p1: nn(f[c.p1]),
    p2: nn(f[c.p2]),
    meses: m.meses.join(","),
    desde: m.meses.length ? "" : m.desde,
    pagado: nn(f[c.pagado]),
  };
}

const textoTotal = (v: Vals) => [v.total && `${v.total.replace(".", ",")}€`, v.mto && `${v.mto.replace(".", ",")}€ mto/mes`].filter(Boolean).join(" + ");
const textoG = (v: Vals) => (v.meses ? textoMeses(v.meses.split(",")) : v.desde ? `desde ${nombreMes(v.desde)}` : "");
const valor = (s: string) => (s === "" ? "" : num(s));

// ─── Aplicar a la app lo que cambió en la hoja ──────────────────────────────────────────

type Ctx = { p: Proyecto; res: Vals; hoja: Vals; avisos: string[] };
const NOTA = `apuntado en la hoja «${HOJA}»`;

async function aplicar(campo: Campo, x: Ctx) {
  const { p, res } = x;
  const app0 = p.app[0];
  if (campo === "total") {
    if (!res.total) return;
    if (app0) await modificarIngreso(app0.id, { totalTrabajo: res.total }, false);
    else {
      const pct = p.directo ? 100 : 60;
      await crearIngreso({ negocio: p.directo ? "Taller" : "Flownexion", cliente: `${p.clave} · ${p.nombre}`, tipo: "proyecto", concepto: `App — tu parte (${pct} % de ${res.total.replace(".", ",")} €)`, totalTrabajo: res.total, porcentaje: pct, notas: NOTA }, false);
    }
  } else if (campo === "app") {
    if (!app0) throw new ErrorN8n("no hay línea de la app para ese proyecto: pon antes el total del proyecto", 400);
    if (!res.app) throw new ErrorN8n("no borro lo que ganas por la app desde la hoja", 400);
    const total = app0.totalTrabajo;
    await modificarIngreso(app0.id, total ? { importe: res.app, porcentaje: r2((num(res.app) / total) * 100) } : { importe: res.app }, false);
  } else if (campo === "mto" || campo === "mtoTuyo") {
    // Plantilla (meses que vienen) y los meses que aún no tienen ningún pago.
    let tuyo = num(res.mtoTuyo);
    if (campo === "mto" && x.hoja.mtoTuyo === p.vals.mtoTuyo && p.plan && leerReparto(p.plan.concepto)) tuyo = r2((num(res.mto) * leerReparto(p.plan.concepto)!.pct) / 100);
    if (!(tuyo > 0)) throw new ErrorN8n("el mantenimiento tiene que ser mayor que 0", 400);
    const libres = p.mant.filter((m) => !m.cobros.length);
    if (!p.plan && !p.directo && !p.mant.length) {
      // Proyecto sin mantenimiento todavía: plantilla APAGADA (empieza cuando pongas «desde ...»).
      const tp = aTabla("Programados", (await leerRangos(["'Programados'!A1:Z300"]))[0]);
      const pct = res.mto ? r2((tuyo / num(res.mto)) * 100) : 60;
      await anadirFila("Programados", {
        ID: siguienteId(tp, "P", 2), ACTIVO: "no", TIPO: "ingreso", NOMBRE: `Mantenimiento ${p.nombre}`,
        CONCEPTO: `Mantenimiento mensual (${String(pct).replace(".", ",")} % de ${(res.mto || String(tuyo)).replace(".", ",")} €)`,
        NEGOCIO: "Flownexion", IMPORTE: String(tuyo), MONEDA: "EUR", PERIODICIDAD: "mensual", DIA: "1", MODO: "auto", ESTIMADO: "no",
        NOTAS: `Cliente: ${p.clave} · ${p.nombre}. SIN EMPEZAR: pon «desde <mes>» en Mantenimientos de «${HOJA}» o díselo al bot cuando empiece.`,
      }, tp.cabecera);
      return;
    }
    if (!p.plan && !libres.length) throw new ErrorN8n("todos los meses ya tienen pagos y no hay mantenimiento programado: no hay nada que cambiar", 400);
    if (p.plan) {
      let concepto = p.plan.concepto;
      if (res.mto) concepto = leerReparto(concepto) ? concepto.replace(/de\s*[\d.,]+\s*€/, `de ${res.mto.replace(".", ",")} €`) : concepto.replace(/\(\s*\d[\d.,]*\s*€/, `(${res.mto.replace(".", ",")} €`);
      await modificarVariosPorId("Programados", new Map([[p.plan.id, { IMPORTE: String(tuyo), CONCEPTO: concepto }]]));
    }
    if (libres.length)
      await modificarVariosPorId("Ingresos", new Map(libres.map((m) => [m.id, { IMPORTE: String(tuyo), ...(res.mto ? { TOTAL_TRABAJO: res.mto } : {}) }])));
  } else if (campo === "p1" || campo === "p2") {
    if (p.directo) throw new ErrorN8n("este proyecto te lo paga el taller directo: no hay pagos del cliente a Flownexion", 400);
    if (!app0) throw new ErrorN8n("no hay línea de la app para apuntar el pago del cliente", 400);
    const cs = app0.cobros.filter((c) => c.destino === "flownexion");
    const actuales = campo === "p1" ? cs.slice(0, 1) : cs.slice(1);
    const quiero = num(res[campo]);
    if (!actuales.length && quiero > 0) await registrarCobro({ ingreso: app0.id, importe: quiero, destino: "flownexion", notas: (campo === "p1" ? "Pago inicial. " : "Segundo pago. ") + NOTA }, false);
    else if (actuales.length && !(quiero > 0)) for (const c of actuales) await borrarCobro(c.id, false);
    else if (actuales.length) {
      await modificarCobro(actuales[0].id, { importe: quiero }, false);
      for (const c of actuales.slice(1)) await borrarCobro(c.id, false);
    }
  } else if (campo === "meses") {
    const quiero = new Set(res.meses ? res.meses.split(",") : []);
    const tengo = new Set(p.vals.meses ? p.vals.meses.split(",") : []);
    const destino = p.directo ? "yo" : "flownexion";
    for (const mes of quiero) {
      if (tengo.has(mes)) continue;
      let linea = p.mant.find((m) => m.fecha?.slice(0, 7) === mes);
      if (!linea) linea = await crearMes(p, mes);
      const hueco = r2((linea.importe || 0) - (destino === "yo" ? linea.cobrado : linea.clientePago));
      if (hueco > 0.005) await registrarCobro({ ingreso: linea.id, importe: hueco, destino, notas: (p.directo ? "Te lo pagó el taller. " : "El cliente pagó a Flownexion. ") + NOTA }, false);
    }
    for (const mes of tengo) {
      if (quiero.has(mes)) continue;
      const linea = p.mant.find((m) => m.fecha?.slice(0, 7) === mes);
      for (const c of linea?.cobros.filter((c) => c.destino === destino) || []) await borrarCobro(c.id, false);
    }
  } else if (campo === "desde") {
    if (!res.desde) return; // quitar la fecha de inicio no para el mantenimiento: eso, por Telegram
    if (!p.plan) throw new ErrorN8n("este proyecto no tiene mantenimiento programado", 400);
    await modificarVariosPorId("Programados", new Map([[p.plan.id, { ACTIVO: "sí", DESDE: isoAEs(`${res.desde}-${String(p.plan.dia).padStart(2, "0")}`) }]]));
  } else if (campo === "pagado") {
    const lineas = [...p.app, ...p.mant];
    let dif = r2(num(res.pagado) - num(p.vals.pagado));
    if (dif > 0.005) {
      // Primero lo que el cliente ya pagó a Flownexion (lo que te debe ya), luego el resto; lo más antiguo antes.
      const orden = [...lineas].sort((a, b) => (b.debeFlownexion > 0.005 ? 1 : 0) - (a.debeFlownexion > 0.005 ? 1 : 0) || (a.fecha || "").localeCompare(b.fecha || ""));
      for (const l of orden) {
        if (dif <= 0.005) break;
        const pon = Math.min(dif, l.pendiente);
        if (pon <= 0.005) continue;
        await registrarCobro({ ingreso: l.id, importe: r2(pon), destino: "yo", notas: (p.directo ? "Te lo pagó el taller. " : "Te lo pagó Flownexion. ") + NOTA }, false);
        dif = r2(dif - pon);
      }
      if (dif > 0.005) x.avisos.push(`${p.clave}: has puesto ${res.pagado} € pagados pero solo te debían ${r2(num(res.pagado) - dif)} €; el resto no lo he apuntado`);
    } else if (dif < -0.005) {
      const mios = lineas.flatMap((l) => l.cobros.filter((c) => c.destino === "yo")).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || b.id.localeCompare(a.id));
      for (const c of mios) {
        if (dif > -0.005) break;
        if (c.importe <= -dif + 0.005) {
          await borrarCobro(c.id, false);
          dif = r2(dif + c.importe);
        } else {
          await modificarCobro(c.id, { importe: r2(c.importe + dif) }, false);
          dif = 0;
        }
      }
    }
  }
}

/** Línea de un mes de mantenimiento que aún no existe (desde la plantilla, o copiando el último mes). */
async function crearMes(p: Proyecto, mes: string): Promise<Ingreso> {
  let fila: Record<string, string>;
  if (p.plan) {
    const fecha = `${mes}-${String(p.plan.dia).padStart(2, "0")}`;
    fila = filaIngreso({ p: p.plan, fecha, id: idGenerado(p.plan, fecha), importeEur: p.plan.importe }) as Record<string, string>;
  } else {
    const u = p.mant[p.mant.length - 1];
    if (!u) throw new ErrorN8n(`${p.clave} no tiene mantenimiento: no sé cuánto es ${nombreMes(mes)}`, 400);
    const id = `M-${p.clave.replace(/\D/g, "")}-${mes}`;
    fila = {
      ID: id, NEGOCIO: u.negocio, CLIENTE: u.cliente, CONCEPTO: u.concepto.replace(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}/i, nombreMes(mes)),
      FECHA: isoAEs(`${mes}-01`), IMPORTE: String(u.importe ?? ""), TOTAL_TRABAJO: String(u.totalTrabajo ?? ""), PORCENTAJE: String(u.porcentaje ?? ""), TIPO: "mantenimiento", NOTAS: NOTA, ORIGEN: HOJA,
    };
  }
  await anadirFila("Ingresos", fila);
  return montarIngresos([{ fila: 0, o: fila }], [])[0];
}

// ─── La sincronización ─────────────────────────────────────────────────────────────────

async function leerApp() {
  const [iv, cv, pv] = await leerRangos(["'Ingresos'!A1:Z3000", "'Cobros'!A1:Z5000", "'Programados'!A1:Z300"]);
  const ti = aTabla("Ingresos", iv), tc = aTabla("Cobros", cv), tp = aTabla("Programados", pv);
  const cobros = tc.filas.map((f) => aCobro(f.fila, aObjeto(tc, f.celdas))).filter((c) => c.id);
  const ings = montarIngresos(ti.filas.map((f) => ({ fila: f.fila, o: aObjeto(ti, f.celdas) })), cobros, hoyISO());
  const progs = tp.filas.map((f) => aProgramado(f.fila, aObjeto(tp, f.celdas))).filter((p) => p.id);
  if (!ings.length) throw new ErrorN8n("La pestaña Ingresos ha llegado vacía: no sincronizo para no tocar nada.", 502);
  return proyectos(ings, progs);
}

async function leerFotos(): Promise<Map<string, Vals>> {
  try {
    const [v] = await leerRangos([`'${FOTOS}'!A1:C200`]);
    const m = new Map<string, Vals>();
    for (const f of v.slice(1)) {
      try {
        const o = JSON.parse(f[1] || "");
        if (f[0]) m.set(f[0], Object.fromEntries(CAMPOS.map((k) => [k, String(o[k] ?? "")])) as Vals);
      } catch {}
    }
    return m;
  } catch (e) {
    if (!/Unable to parse range|no encontr|not found/i.test(String((e as Error).message))) throw e;
    // Primera vez: se crea la pestaña oculta.
    await n8n({ op: "sheets", method: "POST", path: ":batchUpdate", body: { requests: [{ addSheet: { properties: { title: FOTOS, hidden: true, gridProperties: { rowCount: 200, columnCount: 3 } } } }] } });
    await escribirCelda(FOTOS, "A1", "CLAVE", false);
    await escribirCelda(FOTOS, "B1", "FOTO (no tocar: la usa la sincronización)", false);
    return new Map();
  }
}

async function guardarFotos(fotos: Map<string, Vals>) {
  const filas = [["CLAVE", "FOTO (no tocar: la usa la sincronización)", "ACTUALIZADA"], ...[...fotos].sort().map(([k, v]) => [k, JSON.stringify(v), isoAEs(hoyISO())])];
  while (filas.length < 40) filas.push(["", "", ""]);
  await n8n({ op: "sheets", method: "PUT", path: `/values/${encodeURIComponent(`'${FOTOS}'!A1:C${filas.length}`)}?valueInputOption=RAW`, body: { values: filas } });
}

export async function sincronizarFlow(): Promise<string[]> {
  const [[hv], fotos] = await Promise.all([leerRangos([`'${HOJA}'!A1:Z60`], "UNFORMATTED_VALUE"), leerFotos()]);
  const hc = hv.findIndex((f) => (f || []).some((x) => /^total proyecto/i.test(txt(x))));
  if (hc < 0) throw new ErrorN8n(`No encuentro la cabecera de «${HOJA}» (la fila con «Total proyecto»).`, 500);
  const cab = (hv[hc] || []).map(txt);
  const c = columnas(cab);
  const resumen: string[] = [];
  if (c.id < 0) {
    c.id = Math.max(cab.length, c.falta + 1);
    if (hv.some((f, i) => i > hc && txt((f || [])[c.id]) && !/^totales/i.test(txt((f || [])[0])))) throw new ErrorN8n(`La columna ${letra(c.id)} de «${HOJA}» no está vacía; no puedo poner ahí el ID APP.`, 500);
    await escribirCelda(HOJA, `${letra(c.id)}${hc + 1}`, CAB_ID, false);
  }
  const finDatos = (() => {
    const k = hv.findIndex((f, i) => i > hc && /^totales/i.test(txt((f || [])[0])));
    return k < 0 ? hc + 60 : k; // índice 0-based de la fila de Totales
  })();
  const filas: { fila: number; clave: string; vals: Vals; celdas: unknown[] }[] = [];
  const vacias: number[] = [];
  for (let i = hc + 1; i < finDatos; i++) {
    const f = hv[i] || [];
    const vals = valsHoja(f, c);
    if (!txt(f[0]) && CAMPOS.every((k) => !vals[k])) {
      vacias.push(i + 1);
      continue;
    }
    filas.push({ fila: i + 1, clave: txt(f[c.id]), vals, celdas: f });
  }

  let proys = await leerApp();
  // Enlace: por el ID APP, o la primera vez por el «Proyecto N» que pone en la columna A.
  const usada = new Set<string>();
  const avisos: string[] = [];
  for (const f of filas) {
    if (f.clave && proys.some((p) => p.clave === f.clave) && !usada.has(f.clave)) {
      usada.add(f.clave);
      continue;
    }
    const n = numProyecto(txt(f.celdas[0]));
    const m = n ? proys.find((p) => p.clave === "Proyecto " + n && !usada.has(p.clave)) : undefined;
    if (m) {
      f.clave = m.clave;
      usada.add(m.clave);
      continue;
    }
    // Proyecto nuevo escrito a mano: se crea si trae el total.
    if (!f.vals.total) {
      avisos.push(`La fila ${f.fila} («${escHtml(txt(f.celdas[0]))}») no la entiendo como proyecto: ponle el total en «Total proyecto» (p.ej. «1500€ + 100€ mto/mes»).`);
      f.clave = "";
      continue;
    }
    const sig = Math.max(0, ...proys.map((p) => +p.clave.replace(/\D/g, ""))) + 1;
    const num0 = n && !proys.some((p) => p.clave === "Proyecto " + n) ? n : String(sig);
    const nombre = txt(f.celdas[0]).replace(/^\s*proyecto\s*\d*\s*-*>?\s*/i, "") || "nuevo";
    const pct = f.vals.app && f.vals.total ? r2((num(f.vals.app) / num(f.vals.total)) * 100) : 60;
    await crearIngreso({ negocio: "Flownexion", cliente: `Proyecto ${num0} · ${nombre}`, tipo: "proyecto", concepto: `App — tu parte (${String(pct).replace(".", ",")} % de ${f.vals.total.replace(".", ",")} €)`, totalTrabajo: f.vals.total, porcentaje: pct, notas: NOTA }, false);
    f.clave = "Proyecto " + num0;
    usada.add(f.clave);
    resumen.push(`hoja → bot: proyecto nuevo «Proyecto ${num0} · ${escHtml(nombre)}» (Flownexion, tu ${pct} % de ${f.vals.total} €)${f.vals.mto ? ". El mantenimiento dímelo por Telegram cuando empiece" : ""}`);
    proys = await leerApp();
  }

  // Hoja → app, campo a campo.
  let tocado = false;
  for (const f of filas) {
    const p = proys.find((x) => x.clave === f.clave);
    if (!p) continue;
    const foto = fotos.get(p.clave);
    const res = {} as Vals;
    const deHoja: Campo[] = [];
    for (const k of CAMPOS) {
      const cambioHoja = foto ? f.vals[k] !== foto[k] : f.vals[k] !== "" && f.vals[k] !== p.vals[k];
      res[k] = cambioHoja ? f.vals[k] : p.vals[k];
      // «desde» vacío (ya hay meses pagados) no es un cambio: no para el mantenimiento.
      if (cambioHoja && res[k] !== p.vals[k] && !(k === "desde" && !res[k])) deHoja.push(k);
    }
    const orden: Campo[] = ["total", "app", "mto", "mtoTuyo", "p1", "p2", "desde", "meses", "pagado"];
    for (const k of orden.filter((k) => deHoja.includes(k))) {
      try {
        await aplicar(k, { p, res, hoja: f.vals, avisos });
        resumen.push(`hoja → bot ${p.clave}: ${etiqueta[k]} ${k === "meses" ? textoMeses(res.meses ? res.meses.split(",") : []) || "ninguno" : k === "desde" ? nombreMes(res.desde) : (res[k] || "vacío") + (k === "total" || k === "mto" || k === "app" || k === "mtoTuyo" || k.startsWith("p") ? " €" : "")}`);
        tocado = true;
      } catch (e) {
        avisos.push(`${p.clave}: no he podido aplicar «${etiqueta[k]}» = ${escHtml(res[k] || "vacío")} (${escHtml((e as Error).message)}). Lo dejo como lo tiene el bot.`);
      }
      if (tocado) proys = await leerApp();
      const nuevo = proys.find((x) => x.clave === p.clave);
      if (nuevo) Object.assign(p, nuevo);
    }
  }
  if (tocado) proys = await leerApp();

  // App → hoja: solo las celdas cuyo valor no casa (tu formato de texto se respeta si dice lo mismo).
  const data: { range: string; values: (string | number)[][] }[] = [];
  const pon = (fila: number, col: number, v: string | number) => data.push({ range: `'${HOJA}'!${letra(col)}${fila}`, values: [[v]] });
  const nuevasFotos = new Map(fotos);
  for (const f of filas) {
    const p = proys.find((x) => x.clave === f.clave);
    if (!p) continue;
    const v = p.vals, h = f.vals;
    if (txt(f.celdas[c.id]) !== p.clave) pon(f.fila, c.id, p.clave);
    if (v.total !== h.total || v.mto !== h.mto) pon(f.fila, c.total, textoTotal(v));
    if (v.app !== h.app) pon(f.fila, c.app, valor(v.app));
    if (v.mtoTuyo !== h.mtoTuyo) pon(f.fila, c.mtoTuyo, v.mtoTuyo ? `${v.mtoTuyo.replace(".", ",")}€ mes` : "");
    if (v.p1 !== h.p1) pon(f.fila, c.p1, valor(v.p1));
    if (v.p2 !== h.p2) pon(f.fila, c.p2, valor(v.p2));
    if (v.meses !== h.meses || v.desde !== h.desde) pon(f.fila, c.meses, textoG(v));
    if (v.pagado !== h.pagado) pon(f.fila, c.pagado, valor(v.pagado));
    if (nn(f.celdas[c.totalMto]) !== nn(p.totalMto)) pon(f.fila, c.totalMto, p.totalMto ? p.totalMto : "");
    if (nn(f.celdas[c.falta]) !== nn(p.falta)) pon(f.fila, c.falta, p.falta ? p.falta : 0);
    const cambiados = CAMPOS.filter((k) => v[k] !== h[k]);
    if (cambiados.length) resumen.push(`bot → hoja ${p.clave}: ${cambiados.map((k) => etiqueta[k]).join(", ")}`);
    nuevasFotos.set(p.clave, v);
  }
  // Proyectos del bot que no están en la hoja: a la primera fila libre antes de «Totales».
  for (const p of proys.filter((x) => !filas.some((f) => f.clave === x.clave))) {
    const fila = vacias.shift();
    if (!fila) {
      avisos.push(`No queda sitio en «${HOJA}» para ${p.clave}: añade una fila vacía antes de «Totales».`);
      continue;
    }
    const v = p.vals;
    pon(fila, c.nombre, `${p.clave} --> ${p.nombre}`);
    pon(fila, c.total, textoTotal(v));
    pon(fila, c.app, valor(v.app));
    pon(fila, c.mtoTuyo, v.mtoTuyo ? `${v.mtoTuyo.replace(".", ",")}€ mes` : "");
    pon(fila, c.p1, valor(v.p1));
    pon(fila, c.p2, valor(v.p2));
    pon(fila, c.meses, textoG(v));
    pon(fila, c.totalMto, p.totalMto || "");
    pon(fila, c.pagado, valor(v.pagado));
    pon(fila, c.falta, p.falta || 0);
    pon(fila, c.id, p.clave);
    nuevasFotos.set(p.clave, v);
    resumen.push(`bot → hoja: ${p.clave} · ${escHtml(p.nombre)} añadido en la fila ${fila}`);
  }
  if (data.length) await n8n({ op: "sheets", method: "POST", path: "/values:batchUpdate", body: { valueInputOption: "USER_ENTERED", data } });
  const igualFotos = nuevasFotos.size === fotos.size && [...nuevasFotos].every(([k, v]) => JSON.stringify(fotos.get(k)) === JSON.stringify(v));
  if (!igualFotos) await guardarFotos(nuevasFotos);
  for (const a of avisos) resumen.push("⚠️ " + a);
  return resumen;
}

const etiqueta: Record<Campo, string> = {
  total: "total del proyecto", mto: "mantenimiento al mes", app: "gano por la app", mtoTuyo: "gano por el mto", p1: "pago inicial", p2: "segundo pago",
  meses: "meses pagados", desde: "empieza el mantenimiento", pagado: "total que te han pagado",
};
