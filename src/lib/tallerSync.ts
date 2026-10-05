import "server-only";
// Sincronización en los dos sentidos entre la hoja que Juanky toca a mano («Trabajos taller»)
// y las pestañas que usan la app y el bot («Ingresos» + «Cobros»).
//
// - Cada fila de «Trabajos taller» lleva en la columna «ID APP» el ID de su ingreso (I017...).
// - En «Ingresos», SYNC_HOJA guarda cómo estaba la fila de la hoja la última vez que se
//   sincronizó. Comparando hoja, foto y app se sabe quién cambió cada campo:
//     hoja ≠ foto → lo cambió él en la hoja → manda la hoja.
//     hoja = foto → no tocó la hoja → manda la app (lo que haya cambiado el bot o la app).
// - Fila nueva en la hoja (sin ID) → ingreso nuevo. Ingreso nuevo del taller (sin foto) → fila nueva.
// - Fila borrada en la hoja → el ingreso queda ANULADO (no se borra: sus pagos se conservan).
//   Ingreso borrado o anulado en la app → su fila sale de la hoja.
// - «pagado» de la hoja = suma de lo que te ha llegado (Cobros con DESTINO yo). Si lo cambias en
//   la hoja se apunta (o se quita) la diferencia como pago.
// Se ejecuta antes de cada lectura de ingresos y después de cada escritura (app y Telegram).
import { leerRangos, aTabla, aObjeto, col, letra, siguienteId, anadirFilas, modificarVariosPorId, borrarPorIds, escribirCelda, ultimaEscritura, GID, type Tabla } from "./sheets";
import { n8n, ErrorN8n, avisarTelegram, escHtml } from "./n8n";
import { aCobro, type Cobro } from "./ingresos";
import { num, tieneNumero, normaliza, isoAEs, hoyISO } from "./parse";

const HOJA = "Trabajos taller";
const CAB_ID = "ID APP";
const COL_SYNC = "SYNC_HOJA";
const MAX_BAJAS = 3; // más filas desaparecidas de golpe = algo raro: no se toca nada y se avisa

const CAMPOS = ["occ", "pedido", "trabajo", "uds", "precio", "parte", "pagado", "marca"] as const;
type Campo = (typeof CAMPOS)[number];
type Vals = Record<Campo, string>;

// Redondeo como la hoja (131,285 → 131,29; con *100 daría 131,28 por la coma flotante).
const r2 = (n: number) => (Number.isFinite(n) && Math.abs(n) < 1e15 ? Number(Math.round(Number(n + "e2")) + "e-2") : 0);
const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
/** Número canónico ("" si no hay). `ceroVacio`: 0 cuenta como vacío (pagado, precio). */
const nn = (v: unknown, ceroVacio = false) => {
  if (!tieneNumero(v)) return "";
  const n = r2(num(v));
  return ceroVacio && Math.abs(n) < 0.005 ? "" : String(n);
};

interface FilaHoja {
  fila: number;
  id: string;
  vals: Vals;
  escribirId?: boolean;
}

/** Columnas de la hoja por su cabecera (la marca JF?/D está sin cabecera, justo tras «falta por pagar»). */
function columnas(cab: string[]) {
  const b = (re: RegExp) => cab.findIndex((c) => re.test(normaliza(c)));
  const c = {
    occ: b(/^occ/), pedido: b(/^pedido/), trabajo: b(/^trabajo/), uds: b(/^unidades/), precio: b(/^precio/),
    total: b(/^total$/), parte: b(/^mi parte/), pagado: b(/^pagado/), falta: b(/^falta por pagar/), id: cab.findIndex((x) => txt(x).toUpperCase() === CAB_ID),
    marca: -1,
  };
  for (const k of ["occ", "pedido", "trabajo", "uds", "precio", "total", "parte", "pagado", "falta"] as const)
    if (c[k] < 0) throw new ErrorN8n(`La hoja «${HOJA}» ha cambiado: no encuentro la columna «${k}». No sincronizo nada.`, 500);
  if (!txt(cab[c.falta + 1])) c.marca = c.falta + 1;
  return c;
}
type Cols = ReturnType<typeof columnas>;

function valsHoja(celdas: string[], c: Cols): Vals {
  const precio = nn(celdas[c.precio], true);
  return {
    occ: txt(celdas[c.occ]),
    pedido: txt(celdas[c.pedido]),
    trabajo: txt(celdas[c.trabajo]),
    uds: nn(celdas[c.uds]),
    precio,
    // Sin precio la fórmula da 0 €: eso es "sin precio todavía", no 0 €.
    parte: precio || nn(celdas[c.parte], true) ? nn(celdas[c.parte]) : "",
    pagado: nn(celdas[c.pagado], true),
    marca: c.marca >= 0 ? txt(celdas[c.marca]) : "",
  };
}

function valsApp(o: Record<string, string>, cobrado: number): Vals {
  const ref = txt(o.REFERENCIA);
  const occ = ref.match(/\bOCC\s+(\S+)/i)?.[1] || "";
  let pedido = ref.match(/\bpedido\s+(\S+)/i)?.[1] || "";
  if (!occ && !pedido && ref) pedido = ref;
  const uds = nn(o.UNIDADES);
  let precio = nn(o.PRECIO_UNIT, true);
  if (!precio && tieneNumero(o.TOTAL_TRABAJO) && num(uds) > 0) precio = nn(num(o.TOTAL_TRABAJO) / num(uds), true);
  return {
    occ, pedido,
    trabajo: txt(o.CONCEPTO),
    uds, precio,
    parte: nn(o.IMPORTE),
    pagado: nn(cobrado, true),
    marca: txt(o.NOTAS).match(/marca:\s*([^·]+)/i)?.[1]?.trim() || "",
  };
}

const igual = (a: Vals, b: Vals) => CAMPOS.every((k) => a[k] === b[k]);
const leerFoto = (s: string): Vals | null => {
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? (Object.fromEntries(CAMPOS.map((k) => [k, String(o[k] ?? "")])) as Vals) : null;
  } catch {
    return null;
  }
};
const foto = (v: Vals) => JSON.stringify(v);

/** Columnas de «Ingresos» que salen de los valores de la hoja. */
function aIngreso(v: Vals, o: Record<string, string> = {}): Record<string, string> {
  const total = v.precio && v.uds ? String(r2(num(v.uds) * num(v.precio))) : "";
  let notas = txt(o.NOTAS);
  if (/marca:/i.test(notas)) notas = notas.replace(/marca:\s*[^·]*/i, v.marca ? `marca: ${v.marca} ` : "");
  else if (v.marca) notas = `marca: ${v.marca}` + (notas ? " · " + notas : "");
  if (v.precio) notas = notas.replace(/·?\s*precio por confirmar/i, "");
  notas = notas.replace(/^\s*·\s*|\s*·\s*$/g, "").replace(/\s*·\s*·\s*/g, " · ").replace(/\s+/g, " ").trim();
  return {
    REFERENCIA: [v.occ && `OCC ${v.occ}`, v.pedido && `pedido ${v.pedido}`].filter(Boolean).join(" · "),
    CONCEPTO: v.trabajo,
    UNIDADES: v.uds,
    PRECIO_UNIT: v.precio,
    TOTAL_TRABAJO: total,
    IMPORTE: v.parte,
    PORCENTAJE: total && v.parte ? String(r2((num(v.parte) / num(total)) * 100)) : o.PORCENTAJE || "10",
    NOTAS: notas,
  };
}

const esTrabajoTaller = (o: Record<string, string>) => normaliza(o.NEGOCIO) === "taller" && /trabajo/i.test(o.TIPO || "");
const anulado = (o: Record<string, string>) => /anulad|cancelad/i.test(o.ESTADO || "");

let ultimaSync = 0;
let enCurso: Promise<void> | null = null;

/**
 * Sincroniza. Sin cambios desde la última vez (ni escrituras de la app/bot) y hace menos de
 * 4 s, no vuelve a leer: una misma consulta llama varias veces a leerIngresos.
 */
export async function sincronizarTaller(forzar = false): Promise<void> {
  if (enCurso) await enCurso.catch(() => {});
  const tocado = Math.max(ultimaEscritura["Ingresos"] || 0, ultimaEscritura["Cobros"] || 0);
  if (!forzar && tocado < ultimaSync && Date.now() - ultimaSync < 4000) return;
  enCurso = sincronizar();
  try {
    await enCurso;
  } catch (e) {
    // Que un fallo de la hoja no deje al bot sin contestar, pero que no pase en silencio.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[taller-sync]", msg);
    await avisarTelegram(`⚠️ <b>No he podido sincronizar «${HOJA}»</b> con los ingresos del bot:\n${escHtml(msg)}`);
  } finally {
    enCurso = null;
  }
}

async function sincronizar() {
  const inicio = Date.now();
  // La hoja de él sin formato (números de verdad); Ingresos/Cobros con formato, como el resto de la app
  // (se reescriben filas enteras: leerlas sin formato convertiría fechas en números de serie).
  const [[hv], [iv, cv]] = await Promise.all([
    leerRangos([`'${HOJA}'!A1:Z1000`], "UNFORMATTED_VALUE"),
    leerRangos(["'Ingresos'!A1:Z3000", "'Cobros'!A1:Z5000"]),
  ]);
  let ti = aTabla("Ingresos", iv);
  const tc = aTabla("Cobros", cv);
  const cab = (hv[0] || []).map((c) => txt(c));
  const c = columnas(cab);

  // Columnas de enlace (solo la primera vez).
  if (c.id < 0) {
    c.id = Math.max(cab.length, 13); // N: a la derecha de tus notas
    if (hv.some((f, i) => i > 0 && txt((f || [])[c.id]))) throw new ErrorN8n(`La columna ${letra(c.id)} de «${HOJA}» no está vacía; no puedo poner ahí el ID APP.`, 500);
    await escribirCelda(HOJA, `${letra(c.id)}1`, CAB_ID);
  }
  if (col(ti, COL_SYNC) < 0) {
    await escribirCelda("Ingresos", `${letra(ti.cabecera.length)}1`, COL_SYNC, false);
    ti = await leerTablaIngresos();
  }

  // Filas de la hoja con algo escrito por él.
  const filas: FilaHoja[] = [];
  hv.forEach((f, i) => {
    if (i === 0) return;
    const celdas = (f || []).map((x) => String(x ?? ""));
    const vals = valsHoja(celdas, c);
    if (!(vals.occ || vals.pedido || vals.trabajo || vals.uds || vals.precio || vals.pagado)) return;
    filas.push({ fila: i + 1, id: txt(celdas[c.id]).toUpperCase(), vals });
  });
  const ultimaFila = filas.length ? Math.max(...filas.map((f) => f.fila)) : 1;

  const cobros = tc.filas.map((f) => aCobro(f.fila, aObjeto(tc, f.celdas))).filter((x) => x.id);
  const cobradoYo = (id: string) => r2(cobros.filter((x) => x.ingreso === id && x.destino === "yo").reduce((s, x) => s + x.importe, 0));
  const ings = new Map<string, { fila: number; o: Record<string, string> }>();
  for (const f of ti.filas) {
    const o = aObjeto(ti, f.celdas);
    if (txt(o.ID)) ings.set(txt(o.ID), { fila: f.fila, o });
  }
  if (!ings.size) throw new ErrorN8n("La pestaña Ingresos ha llegado vacía: no sincronizo para no borrar nada.", 502);

  // 1) Enlazar cada fila de la hoja con su ingreso.
  const enlazado = new Map<string, FilaHoja>(); // id ingreso → fila
  const sinId: FilaHoja[] = [];
  const quitarDeHoja: FilaHoja[] = [];
  for (const f of filas) {
    if (f.id && enlazado.has(f.id)) f.id = ""; // fila copiada y pegada: es una nueva
    if (!f.id) {
      sinId.push(f);
      continue;
    }
    const ing = ings.get(f.id);
    if (!ing || anulado(ing.o)) quitarDeHoja.push(f); // borrado o anulado desde la app / Telegram
    else enlazado.set(f.id, f);
  }
  // Primera vez: las filas migradas el 23-09 se reconocen por ORIGEN "Trabajos taller fila N".
  const nuevasHoja: FilaHoja[] = [];
  for (const f of sinId) {
    // Sin mirar SYNC_HOJA: si una alta se quedó a medias (ingreso creado, ID sin escribir), se reengancha.
    const libre = (id: string, o: Record<string, string>) => !enlazado.has(id) && esTrabajoTaller(o) && !anulado(o);
    let m = [...ings].find(([id, x]) => libre(id, x.o) && txt(x.o.ORIGEN) === `${HOJA} fila ${f.fila}` && normaliza(x.o.CONCEPTO) === normaliza(f.vals.trabajo));
    if (!m) m = [...ings].find(([id, x]) => libre(id, x.o) && normaliza(x.o.CONCEPTO) === normaliza(f.vals.trabajo) && valsApp(x.o, 0).pedido === f.vals.pedido);
    if (m) {
      f.id = m[0];
      enlazado.set(m[0], f);
      f.escribirId = true;
    } else nuevasHoja.push(f);
  }

  // Ingresos del taller que no están en la hoja.
  const nuevosApp: string[] = [];
  const bajasHoja: string[] = [];
  for (const [id, x] of ings) {
    if (!esTrabajoTaller(x.o) || anulado(x.o) || enlazado.has(id)) continue;
    if (txt(x.o[COL_SYNC])) bajasHoja.push(id); // estaba en la hoja y ya no: la ha borrado él
    else nuevosApp.push(id);
  }
  if (bajasHoja.length > MAX_BAJAS || quitarDeHoja.length > MAX_BAJAS)
    throw new ErrorN8n(
      `Han desaparecido ${Math.max(bajasHoja.length, quitarDeHoja.length)} filas de golpe (${[...bajasHoja, ...quitarDeHoja.map((f) => f.id)].join(", ")}). Por seguridad no he tocado nada: revisa la hoja.`,
      409,
    );

  // 2) Calcular cambios.
  const cambiosIng = new Map<string, Record<string, string>>();
  const escribirHoja: { range: string; values: (string | number)[][] }[] = [];
  const celda = (fila: number, i: number, v: string | number) => escribirHoja.push({ range: `'${HOJA}'!${letra(i)}${fila}`, values: [[v]] });
  const ajustesPago: { id: string; objetivo: number }[] = [];
  const resumen: string[] = [];

  for (const [id, f] of enlazado) {
    const { o } = ings.get(id)!;
    const app = valsApp(o, cobradoYo(id));
    const vieja = leerFoto(o[COL_SYNC] || "");
    const res = {} as Vals;
    for (const k of CAMPOS) {
      if (!vieja) res[k] = f.vals[k] !== "" || app[k] === "" ? f.vals[k] : app[k]; // primera vez: manda la hoja
      else res[k] = f.vals[k] !== vieja[k] ? f.vals[k] : app[k];
    }
    // El precio y lo tuyo van juntos: si uno vino de la hoja, el otro también.
    if (vieja && (f.vals.precio !== vieja.precio || f.vals.uds !== vieja.uds)) res.parte = f.vals.parte;

    // Hoja → app
    if (!igual(res, app)) {
      const cols = aIngreso(res, o);
      const cambiado = Object.fromEntries(Object.entries(cols).filter(([k, v]) => txt(o[k]) !== v));
      if (Object.keys(cambiado).length) {
        cambiosIng.set(id, { ...(cambiosIng.get(id) || {}), ...cambiado });
        resumen.push(`hoja → bot #${id} ${escHtml(res.trabajo)}: ${Object.keys(cambiado).map((k) => k.toLowerCase()).join(", ")}`);
      }
      if (res.pagado !== app.pagado) ajustesPago.push({ id, objetivo: num(res.pagado) });
    }
    // App → hoja
    const enHoja: Partial<Record<Campo, string | number>> = {};
    for (const k of CAMPOS) if (res[k] !== f.vals[k]) enHoja[k] = res[k];
    if (Object.keys(enHoja).length) {
      const n = (v: string) => (v === "" ? "" : num(v));
      if ("occ" in enHoja) celda(f.fila, c.occ, res.occ);
      if ("pedido" in enHoja) celda(f.fila, c.pedido, res.pedido);
      if ("trabajo" in enHoja) celda(f.fila, c.trabajo, res.trabajo);
      if ("uds" in enHoja) celda(f.fila, c.uds, n(res.uds));
      if ("precio" in enHoja) celda(f.fila, c.precio, n(res.precio));
      if ("uds" in enHoja || "precio" in enHoja) celda(f.fila, c.total, `=${letra(c.uds)}${f.fila}*${letra(c.precio)}${f.fila}`);
      if ("parte" in enHoja || "uds" in enHoja || "precio" in enHoja) celda(f.fila, c.parte, formulaParte(res, f.fila, c));
      if ("pagado" in enHoja) celda(f.fila, c.pagado, n(res.pagado));
      if ("marca" in enHoja && c.marca >= 0) celda(f.fila, c.marca, res.marca);
      resumen.push(`bot → hoja fila ${f.fila} (#${id}): ${Object.keys(enHoja).join(", ")}`);
    }
    if (f.escribirId) celda(f.fila, c.id, id);
    if (txt(o[COL_SYNC]) !== foto(res)) cambiosIng.set(id, { ...(cambiosIng.get(id) || {}), [COL_SYNC]: foto(res) });
  }

  // Filas borradas en la hoja → ingreso anulado (se conservan sus pagos).
  for (const id of bajasHoja) {
    const { o } = ings.get(id)!;
    cambiosIng.set(id, { ESTADO: "anulado", [COL_SYNC]: "", NOTAS: [txt(o.NOTAS), `fila borrada de «${HOJA}» el ${isoAEs(hoyISO())}`].filter(Boolean).join(" · ") });
    resumen.push(`hoja → bot: borraste la fila de #${id} ${escHtml(o.CONCEPTO)} → anulado`);
  }

  // 3) Escribir. Primero la app (Ingresos/Cobros), luego la hoja.
  // Filas nuevas escritas por él en la hoja → ingresos nuevos.
  if (nuevasHoja.length) {
    let sig = +siguienteId(ti, "I").slice(1);
    const altas: Record<string, string>[] = [];
    for (const f of nuevasHoja) {
      const id = "I" + String(sig++).padStart(3, "0");
      const fila = { ...aIngreso(f.vals), ID: id, NEGOCIO: "Taller", TIPO: "trabajo", FECHA: isoAEs(hoyISO()), ORIGEN: `${HOJA} (escrito a mano)`, [COL_SYNC]: foto(f.vals) };
      altas.push(fila);
      f.id = id;
      celda(f.fila, c.id, id);
      if (num(f.vals.pagado) > 0) ajustesPago.push({ id, objetivo: num(f.vals.pagado) });
      resumen.push(`hoja → bot: fila nueva ${f.fila} «${escHtml(f.vals.trabajo)}» → #${id}`);
    }
    await anadirFilas("Ingresos", altas, ti.cabecera);
  }
  if (cambiosIng.size) await modificarVariosPorId("Ingresos", cambiosIng, ti);
  if (ajustesPago.length) await ajustarPagos(ajustesPago, cobros, tc);

  if (escribirHoja.length)
    await n8n({ op: "sheets", method: "POST", path: "/values:batchUpdate", body: { valueInputOption: "USER_ENTERED", data: escribirHoja } });

  // Filas que sobran (borradas o anuladas en la app) y filas nuevas (creadas en la app / Telegram).
  const altasHoja = nuevosApp.map((id) => ({ id, v: valsApp(ings.get(id)!.o, cobradoYo(id)) }));
  const borrar = quitarDeHoja.map((f) => f.fila).sort((a, b) => b - a);
  const requests: unknown[] = borrar.map((fila) => ({ deleteDimension: { range: { sheetId: GID[HOJA], dimension: "ROWS", startIndex: fila - 1, endIndex: fila } } }));
  // Se insertan justo debajo de la última fila con datos: así los totales (SUMA) las incluyen.
  const desde = ultimaFila - borrar.filter((x) => x <= ultimaFila).length; // 1-based, última fila tras borrar
  if (altasHoja.length)
    requests.push({ insertDimension: { range: { sheetId: GID[HOJA], dimension: "ROWS", startIndex: desde, endIndex: desde + altasHoja.length }, inheritFromBefore: true } });
  if (requests.length) await n8n({ op: "sheets", method: "POST", path: ":batchUpdate", body: { requests } });
  for (const f of quitarDeHoja) resumen.push(`bot → hoja: quitada la fila ${f.fila} (#${f.id || "?"}, borrado o anulado en el bot)`);
  if (altasHoja.length) {
    const data = altasHoja.map(({ id, v }, i) => {
      const fila = desde + 1 + i;
      const linea: (string | number)[] = [];
      const pon = (k: number, x: string | number) => {
        while (linea.length <= k) linea.push("");
        linea[k] = x;
      };
      const n = (s: string) => (s === "" ? "" : num(s));
      pon(c.occ, v.occ); pon(c.pedido, v.pedido); pon(c.trabajo, v.trabajo); pon(c.uds, n(v.uds)); pon(c.precio, n(v.precio));
      pon(c.total, `=${letra(c.uds)}${fila}*${letra(c.precio)}${fila}`);
      pon(c.parte, formulaParte(v, fila, c));
      pon(c.pagado, n(v.pagado));
      pon(c.falta, `=${letra(c.parte)}${fila}-${letra(c.pagado)}${fila}`);
      if (c.marca >= 0) pon(c.marca, v.marca);
      pon(c.id, id);
      resumen.push(`bot → hoja: fila nueva ${fila} «${escHtml(v.trabajo)}» (#${id})`);
      return { range: `'${HOJA}'!A${fila}:${letra(linea.length - 1)}${fila}`, values: [linea] };
    });
    await n8n({ op: "sheets", method: "POST", path: "/values:batchUpdate", body: { valueInputOption: "USER_ENTERED", data } });
    // La foto se guarda DESPUÉS de escribir la hoja: con foto y sin fila, se tomaría por borrada a mano.
    await modificarVariosPorId("Ingresos", new Map(altasHoja.map(({ id, v }) => [id, { [COL_SYNC]: foto(v) }])), await leerTablaIngresos());
  }

  ultimaSync = Date.now();
  if (resumen.length) console.log(`[taller-sync] ${Date.now() - inicio} ms\n` + resumen.join("\n"));
}

async function leerTablaIngresos() {
  return aTabla("Ingresos", (await leerRangos(["'Ingresos'!A1:Z3000"]))[0]);
}

/** «mi parte»: si es el 10 % del total, fórmula (como las tuyas); si no, el número tal cual. */
function formulaParte(v: Vals, fila: number, c: Cols): string | number {
  if (!v.parte) return v.precio ? `=${letra(c.total)}${fila}/10` : "";
  const total = num(v.uds) * num(v.precio);
  return v.precio && Math.abs(total / 10 - num(v.parte)) < 0.01 ? `=${letra(c.total)}${fila}/10` : num(v.parte);
}

/** Deja lo que te ha llegado (Cobros «yo») igual al «pagado» de la hoja: apunta o quita la diferencia. */
async function ajustarPagos(ajustes: { id: string; objetivo: number }[], cobros: Cobro[], tc: Tabla) {
  const altas: Record<string, string>[] = [];
  const cambios = new Map<string, Record<string, string>>();
  const bajas: string[] = [];
  let max = 0;
  for (const f of tc.filas) {
    const m = (aObjeto(tc, f.celdas).ID || "").match(/^C(\d+)$/);
    if (m) max = Math.max(max, +m[1]);
  }
  for (const { id, objetivo } of ajustes) {
    const mios = cobros.filter((x) => x.ingreso === id && x.destino === "yo");
    let dif = r2(objetivo - mios.reduce((s, x) => s + x.importe, 0));
    if (dif > 0.005) {
      altas.push({ ID: "C" + String(++max).padStart(3, "0"), INGRESO: id, FECHA: isoAEs(hoyISO()), IMPORTE: String(dif), METODO: "", NOTAS: `apuntado a mano en la hoja «${HOJA}»`, DESTINO: "yo" });
    } else if (dif < -0.005) {
      // Se quita empezando por el pago más reciente.
      for (const x of [...mios].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))) {
        if (dif > -0.005) break;
        if (x.importe <= -dif + 0.005) {
          bajas.push(x.id);
          dif = r2(dif + x.importe);
        } else {
          cambios.set(x.id, { IMPORTE: String(r2(x.importe + dif)), NOTAS: [x.notas, `ajustado desde la hoja «${HOJA}»`].filter(Boolean).join(" · ") });
          dif = 0;
        }
      }
    }
  }
  if (altas.length) await anadirFilas("Cobros", altas, tc.cabecera);
  if (cambios.size) await modificarVariosPorId("Cobros", cambios, tc);
  if (bajas.length) await borrarPorIds("Cobros", bajas);
}

