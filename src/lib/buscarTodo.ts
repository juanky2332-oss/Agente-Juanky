import "server-only";
// /buscar por Telegram: una palabra y se mira en TODO a la vez (notas y tareas, contactos, gastos,
// ingresos, vinos y restaurantes). Resultado agrupado, con el código para pedir más de cada uno.
import { leerRangos, aTabla, aObjeto } from "./sheets";
import { aMovimiento } from "./finanzas";
import { leerIngresos } from "./ingresosSrv";
import { nombreIngreso } from "./ingresos";
import { escHtml } from "./n8n";
import { eur, isoAEs, normaliza } from "./parse";

const casa = (txt: string, ws: string[]) => { const t = " " + normaliza(txt) + " "; return ws.every((w) => (/^\d+$/.test(w) ? t.includes(w) : t.includes(w))); };
const corta = (s: string, n = 90) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export async function buscarTodo(q: string) {
  const ws = normaliza(q).split(" ").filter((w) => w.length > 1 && !["de", "del", "la", "el", "los", "las", "en", "y"].includes(w));
  if (!ws.length) return "Dime qué busco (p. ej. <i>«iberdrola»</i>, <i>«4500144834»</i>, <i>«dentista»</i>).";
  const [notas, contactos, gestoria, vinos, restos] = await leerRangos(["'Notas Juanky'!A1:H3000", "'tarjetas visitas'!A1:U3000", "'GestorIA'!A1:Z3000", "'Vinos'!A1:L1000", "'Restaurantes'!A1:L1000"]);
  const tabla = (n: string, v: string[][]) => { const t = aTabla(n, v); return t.filas.map((f) => ({ fila: f.fila, o: aObjeto(t, f.celdas) })); };
  const bloques: [string, string[]][] = [];

  const ns = tabla("Notas Juanky", notas).filter((x) => casa(Object.values(x.o).join(" "), ws));
  if (ns.length) bloques.push([`📝 Notas y tareas (${ns.length})`, ns.slice(-6).reverse().map((x) => `<code>#${x.fila}</code> ${escHtml(x.o.TIPO || "")} · ${escHtml(corta(x.o.CONTENIDO))}${(x.o.ESTADO || "").toLowerCase() === "hecha" ? " ✔️" : ""}`)]);

  const cs = tabla("tarjetas visitas", contactos).filter((x) => casa(Object.values(x.o).join(" "), ws));
  if (cs.length) bloques.push([`👤 Contactos (${cs.length})`, cs.slice(0, 6).map((x) => `<code>#C${x.fila}</code> <b>${escHtml(x.o.Contacto || x.o.Empresa || "?")}</b>${x.o.Empresa && x.o.Contacto ? " · " + escHtml(x.o.Empresa) : ""}${x.o["Teléfono"] || x.o.Telefono ? " · " + escHtml(x.o["Teléfono"] || x.o.Telefono) : ""}${x.o.Email || x.o.email ? " · " + escHtml(x.o.Email || x.o.email) : ""}`)]);

  const tg = aTabla("GestorIA", gestoria);
  const gs = tg.filas.map((f) => aMovimiento(f.fila, aObjeto(tg, f.celdas))).filter((m) => casa(`${m.proveedor} ${m.concepto} ${m.doc} ${m.categoria} ${m.notas} ${m.subcategoria}`, ws)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (gs.length) bloques.push([`🧾 Gastos (${gs.length} · ${eur(gs.reduce((s, m) => s + m.total, 0))})`, gs.slice(0, 6).map((m) => `<code>#G${m.fila}</code> ${m.sinFecha ? "sin fecha" : isoAEs(m.fecha)} · ${escHtml(m.proveedor)} · <b>${eur(m.total)}</b>${m.enlace ? ` · <a href="${escHtml(m.enlace)}">📎</a>` : ""}`)]);

  const is = (await leerIngresos()).filter((i) => i.estado !== "anulado" && casa(`${i.id} ${i.negocio} ${i.cliente} ${i.concepto} ${i.referencia} ${i.notas}`, ws));
  if (is.length) bloques.push([`💰 Ingresos (${is.length})`, is.slice(0, 6).map((i) => `${nombreIngreso(i)} · ${i.importe === null ? "sin precio" : eur(i.importe)} · ${i.pendiente > 0.005 ? `te deben ${eur(i.pendiente)}` : i.estado}`)]);

  const vs = tabla("Vinos", vinos).filter((x) => casa(Object.entries(x.o).filter(([k]) => k !== "FICHA").map(([, v]) => v).join(" "), ws));
  if (vs.length) bloques.push([`🍷 Vinos (${vs.length})`, vs.slice(0, 5).map((x) => `<code>#V${x.fila}</code> ${escHtml(corta(Object.values(x.o).slice(0, 3).filter(Boolean).join(" · "), 80))}`)]);
  const rs = tabla("Restaurantes", restos).filter((x) => casa(Object.values(x.o).join(" "), ws));
  if (rs.length) bloques.push([`🍽 Restaurantes (${rs.length})`, rs.slice(0, 5).map((x) => `<code>#R${x.fila}</code> ${escHtml(corta(Object.values(x.o).slice(0, 3).filter(Boolean).join(" · "), 80))}`)]);

  if (!bloques.length) return `🔎 No encuentro nada con «${escHtml(q)}» en notas, contactos, gastos, ingresos, vinos ni restaurantes.`;
  return [`🔎 <b>«${escHtml(q)}»</b>`, ...bloques.flatMap(([t, ls]) => ["", `<b>${t}</b>`, ...ls])].join("\n");
}
