import { manejar } from "@/lib/ruta";
import { borradoresPendientes, leerBorrador, confirmarBorrador, descartarBorrador, modificarBorrador, tarjetaDe, seguimientoDe, type FichaBorrador, type CambiosTaller } from "@/lib/borradores";
import { avisarTelegram, escHtml } from "@/lib/n8n";
import { eur } from "@/lib/parse";
import { sincronizarTaller } from "@/lib/tallerSync";

// Facturas leídas por Telegram que esperan confirmación: la app las enseña para revisarlas.
// ?clase=gastos (pantalla de gastos) · ?clase=taller (facturas del taller, en Ingresos).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async (req: Request) => {
  const u = new URL(req.url);
  const id = u.searchParams.get("id");
  if (id) return { borrador: await leerBorrador(id) };
  const clase = u.searchParams.get("clase");
  const xs = await borradoresPendientes(clase === "taller" || clase === "gastos" ? clase : "todas");
  // Las del taller llevan el seguimiento de cada pedido (lo facturado, lo cobrado y si falta algo).
  if (clase === "taller") return { borradores: await Promise.all(xs.map(async (b) => {
      const s = await seguimientoDe(b);
      return { ...b, taller: s.taller || b.taller, seguimiento: s.seguimiento };
    })) };
  return { borradores: xs };
});

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { id: string; accion: "confirmar" | "descartar" | "modificar"; cambios?: Partial<FichaBorrador> & CambiosTaller; forzar?: boolean };
  if (b.accion === "descartar") return { ok: true, borrador: await descartarBorrador(b.id) };
  if (b.accion === "modificar") return { ok: true, borrador: await modificarBorrador(b.id, b.cambios || {}) };
  const r = await confirmarBorrador(b.id, !!b.forzar, b.cambios);
  if (r.taller) {
    await sincronizarTaller();
    await avisarTelegram(`📲 <b>Confirmada desde la app</b>\n\n${await tarjetaDe(r)}`);
  } else await avisarTelegram(`✅ <b>Factura confirmada desde la app</b> (${r.id}): ${escHtml(r.ficha.proveedor)} · ${eur(r.ficha.total)} → <code>#G${r.fila}</code>`);
  return { ok: true, borrador: r };
});
