import { manejar } from "@/lib/ruta";
import { leerIngresos, crearIngreso, modificarIngreso, borrarIngreso, registrarCobro, modificarCobro, borrarCobro, type EntradaIngreso } from "@/lib/ingresosSrv";
import { textoCobros, resumir, porFuente, normId, type Ingreso } from "@/lib/ingresos";
import { escHtml, ErrorN8n } from "@/lib/n8n";
import { eur, isoAEs, normaliza } from "@/lib/parse";

// Entrada del bot de Telegram (comandos /cobros /cobrado y tool "Ingresos" del agente).
// Devuelve SIEMPRE el texto ya montado: el modelo no calcula ni suma nada (regla de la casa).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ficha(i: Ingreso) {
  const L = [
    `<code>#${i.id}</code> <b>${escHtml(i.concepto)}</b>`,
    `Te paga: <b>${i.negocio === "Flownexion" ? "💻 Flownexion" : i.negocio === "Taller" ? "🔧 el taller, directo" : "otros"}</b>${i.negocio === "Flownexion" && i.cliente ? " · " + escHtml(i.cliente) : ""}${i.referencia ? " · " + escHtml(i.referencia) : ""}`,
    `Fecha del trabajo: ${i.fecha ? isoAEs(i.fecha) : "⚠️ sin fecha"}`,
    i.importe === null ? "Importe: sin precio todavía" : `Importe: <b>${eur(i.importe)}</b>${i.totalTrabajo && i.porcentaje ? ` (${i.porcentaje} % de ${eur(i.totalTrabajo)})` : ""}`,
    `Te han pagado a ti: ${eur(i.cobrado)} · Te deben: <b>${eur(i.pendiente)}</b> · ${i.estado === "retenido" ? "lo tiene Flownexion" : i.estado}${i.vencido ? " 🔴 vencido" : ""}`,
  ];
  if (i.negocio === "Flownexion" && i.importe !== null)
    L.push(`🏦 El cliente ya pagó a Flownexion tu parte de ${eur(i.clientePago)} → Flownexion te debe <b>${eur(i.debeFlownexion)}</b>${i.esperaCliente > 0.005 ? ` · ⏳ el cliente aún no ha pagado ${eur(i.esperaCliente)}` : ""}`);
  if (i.cobros.length) {
    L.push("Pagos:");
    for (const c of i.cobros)
      L.push(`  • ${c.fecha ? isoAEs(c.fecha) : "sin fecha"} · ${eur(c.importe)} · ${c.destino === "flownexion" ? "cliente → Flownexion" : "a ti"}${c.metodo ? " · " + escHtml(c.metodo) : ""} <code>${c.id}</code>`);
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
  const b = (await req.json()) as { accion: string; id?: string; busqueda?: string; filtro?: string; importe?: string | number; fecha?: string; metodo?: string; notas?: string; destino?: string; datos?: EntradaIngreso & { cobroInicial?: number | string } };
  const acc = normaliza(b.accion);
  if (acc === "cobros" || acc === "pendientes") return { resultado: textoCobros(await leerIngresos(), b.filtro || b.busqueda || "") };
  // Para el parte de las 8:00: solo el número de líneas por cobrar (sin cifras, lo pidió así).
  if (acc === "contar") return { resultado: String(resumir(await leerIngresos()).nPendientes) };
  if (acc === "resumen") {
    const ings = await leerIngresos();
    const f = resumir(ings, "Flownexion"), t = resumir(ings, "Taller");
    return {
      resultado: [
        `<b>🔧 Taller (te paga directo)</b>: tuyo ${eur(t.facturado)} · cobrado ${eur(t.cobrado)} · te debe <b>${eur(t.pendiente)}</b> (${t.nPendientes} por cobrar, ${t.nSinPrecio} sin precio)`,
        `<b>💻 Flownexion</b>: tuyo ${eur(f.facturado)} · te ha pagado ${eur(f.cobrado)} · te debe <b>${eur(f.pendiente)}</b>`,
        `  🏦 ya cobrado del cliente: ${eur(f.debeFlownexion)} · ⏳ el cliente aún no ha pagado: ${eur(f.esperaCliente)}`,
        "",
        "<b>Por fuente</b>",
        ...porFuente(ings).map((x) => `• ${escHtml(x.fuente)}: tuyo ${eur(x.facturado)} · cobrado ${eur(x.cobrado)} · pendiente ${eur(x.pendiente)}`),
      ].join("\n"),
    };
  }
  if (acc === "ver" || acc === "buscar") {
    const xs = buscar(await leerIngresos(), b.id || b.busqueda || "");
    if (!xs.length) return { resultado: "No encuentro ningún ingreso con eso." };
    if (xs.length > 6) return { resultado: `Hay ${xs.length}. Los primeros:\n` + xs.slice(0, 12).map((i) => `<code>#${i.id}</code> ${escHtml(i.concepto)} — pendiente ${eur(i.pendiente)}`).join("\n") };
    return { resultado: xs.map(ficha).join("\n\n") };
  }
  // cobrar = el dinero te ha llegado a TI. cliente_pago = el cliente ha pagado a Flownexion (a ti aún no).
  if (acc === "cobrar" || acc === "cobrado" || acc === "cliente_pago" || acc === "pago_cliente") {
    if (!b.id) throw new ErrorN8n("Dime qué ingreso (p.ej. #I012)", 400);
    const destino = acc.includes("cliente") || /flow|cliente/i.test(b.destino || "") ? "flownexion" : "yo";
    const r = await registrarCobro({ ingreso: b.id, importe: b.importe === "" ? undefined : b.importe, fecha: b.fecha || undefined, metodo: b.metodo, notas: b.notas, destino }, false);
    const i = (await leerIngresos()).find((x) => x.id === r.ingreso)!;
    return { resultado: `${destino === "yo" ? `✅ Cobro apuntado: te han pagado ${eur(r.importe)}` : `🏦 Apuntado: el cliente ha pagado a Flownexion (tu parte ${eur(r.importe)}). Flownexion te lo debe`} <code>${r.id}</code>\n\n${ficha(i)}` };
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
    await modificarCobro(normId(b.id, "C"), { importe: b.importe || undefined, fecha: b.fecha || undefined, metodo: b.metodo || undefined, notas: b.notas || undefined, destino: b.destino || undefined }, false);
    return { resultado: `✏️ Cobro ${normId(b.id, "C")} modificado` };
  }
  if (acc === "borrar_cobro") {
    if (!b.id) throw new ErrorN8n("Falta el ID del cobro", 400);
    await borrarCobro(normId(b.id, "C"), false);
    return { resultado: `↩️ Cobro ${normId(b.id, "C")} borrado` };
  }
  throw new ErrorN8n("Acción no válida: cobros, resumen, ver, cobrar, cliente_pago, crear, modificar, borrar, modificar_cobro, borrar_cobro", 400);
});
