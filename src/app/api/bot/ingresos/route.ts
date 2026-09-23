import { manejar } from "@/lib/ruta";
import { leerIngresos, crearIngreso, modificarIngreso, borrarIngreso, registrarCobro, modificarCobro, borrarCobro, type EntradaIngreso } from "@/lib/ingresosSrv";
import { textoCobros, resumir, normId, type Ingreso } from "@/lib/ingresos";
import { escHtml, ErrorN8n } from "@/lib/n8n";
import { eur, isoAEs, normaliza } from "@/lib/parse";

// Entrada del bot de Telegram (comandos /cobros /cobrado y tool "Ingresos" del agente).
// Devuelve SIEMPRE el texto ya montado: el modelo no calcula ni suma nada (regla de la casa).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ficha(i: Ingreso) {
  const L = [
    `<code>#${i.id}</code> <b>${escHtml(i.concepto)}</b>`,
    `${i.negocio}${i.cliente ? " · " + escHtml(i.cliente) : ""}${i.referencia ? " · " + escHtml(i.referencia) : ""}`,
    `Fecha del trabajo: ${i.fecha ? isoAEs(i.fecha) : "⚠️ sin fecha"}`,
    i.importe === null ? "Importe: sin precio todavía" : `Importe: <b>${eur(i.importe)}</b>${i.totalTrabajo && i.porcentaje ? ` (${i.porcentaje} % de ${eur(i.totalTrabajo)})` : ""}`,
    `Cobrado: ${eur(i.cobrado)} · Pendiente: <b>${eur(i.pendiente)}</b> · ${i.estado}${i.vencido ? " 🔴 vencido" : ""}`,
  ];
  if (i.cobros.length) {
    L.push("Pagos:");
    for (const c of i.cobros) L.push(`  • ${c.fecha ? isoAEs(c.fecha) : "sin fecha"} · ${eur(c.importe)}${c.metodo ? " · " + escHtml(c.metodo) : ""} <code>${c.id}</code>`);
  }
  if (i.notas) L.push("📝 " + escHtml(i.notas));
  return L.join("\n");
}

function buscar(ings: Ingreso[], q: string) {
  const exacto = ings.find((x) => x.id === normId(q));
  if (exacto) return [exacto];
  const ps = normaliza(q).split(" ").filter(Boolean);
  return ings.filter((x) => {
    const t = " " + normaliza(`${x.negocio} ${x.cliente} ${x.concepto} ${x.referencia} ${x.notas}`) + " ";
    return ps.every((p) => t.includes(" " + p) || t.includes(p));
  });
}

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { accion: string; id?: string; busqueda?: string; filtro?: string; importe?: string | number; fecha?: string; metodo?: string; notas?: string; datos?: EntradaIngreso & { cobroInicial?: number | string } };
  const acc = normaliza(b.accion);
  if (acc === "cobros" || acc === "pendientes") return { resultado: textoCobros(await leerIngresos(), b.filtro || b.busqueda || "") };
  if (acc === "resumen") {
    const ings = await leerIngresos();
    const r = ["Taller", "Flownexion"].map((n) => resumir(ings, n as "Taller"));
    return { resultado: r.map((x) => `<b>${x.negocio}</b>: tuyo ${eur(x.facturado)} · cobrado ${eur(x.cobrado)} · pendiente <b>${eur(x.pendiente)}</b> (${x.nPendientes} por cobrar, ${x.nParciales} a medias, ${x.nSinPrecio} sin precio)`).join("\n") };
  }
  if (acc === "ver" || acc === "buscar") {
    const xs = buscar(await leerIngresos(), b.id || b.busqueda || "");
    if (!xs.length) return { resultado: "No encuentro ningún ingreso con eso." };
    if (xs.length > 6) return { resultado: `Hay ${xs.length}. Los primeros:\n` + xs.slice(0, 12).map((i) => `<code>#${i.id}</code> ${escHtml(i.concepto)} — pendiente ${eur(i.pendiente)}`).join("\n") };
    return { resultado: xs.map(ficha).join("\n\n") };
  }
  if (acc === "cobrar" || acc === "cobrado") {
    if (!b.id) throw new ErrorN8n("Dime qué ingreso (p.ej. #I012)", 400);
    const r = await registrarCobro({ ingreso: b.id, importe: b.importe === "" ? undefined : b.importe, fecha: b.fecha || undefined, metodo: b.metodo, notas: b.notas }, false);
    const i = (await leerIngresos()).find((x) => x.id === r.ingreso)!;
    return { resultado: `✅ Cobro apuntado (${eur(r.importe)}) <code>${r.id}</code>\n\n${ficha(i)}` };
  }
  if (acc === "crear" || acc === "alta") {
    const r = await crearIngreso(b.datos || {}, false);
    const i = (await leerIngresos()).find((x) => x.id === r.id)!;
    return { resultado: `💰 Ingreso creado\n\n${ficha(i)}` };
  }
  if (acc === "modificar") {
    if (!b.id) throw new ErrorN8n("Falta el ID", 400);
    await modificarIngreso(normId(b.id), b.datos || {}, false);
    const i = (await leerIngresos()).find((x) => x.id === normId(b.id!))!;
    return { resultado: `✏️ Modificado\n\n${ficha(i)}` };
  }
  if (acc === "borrar") {
    if (!b.id) throw new ErrorN8n("Falta el ID", 400);
    const r = await borrarIngreso(normId(b.id), false);
    return { resultado: `🗑 Borrado #${r.id}${r.cobrosBorrados ? ` y sus ${r.cobrosBorrados} pagos` : ""}` };
  }
  if (acc === "modificar_cobro") {
    if (!b.id) throw new ErrorN8n("Falta el ID del cobro", 400);
    await modificarCobro(normId(b.id, "C"), { importe: b.importe, fecha: b.fecha, metodo: b.metodo, notas: b.notas }, false);
    return { resultado: `✏️ Cobro ${normId(b.id, "C")} modificado` };
  }
  if (acc === "borrar_cobro") {
    if (!b.id) throw new ErrorN8n("Falta el ID del cobro", 400);
    await borrarCobro(normId(b.id, "C"), false);
    return { resultado: `↩️ Cobro ${normId(b.id, "C")} borrado` };
  }
  throw new ErrorN8n("Acción no válida: cobros, resumen, ver, cobrar, crear, modificar, borrar, modificar_cobro, borrar_cobro", 400);
});
