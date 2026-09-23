import { manejar } from "@/lib/ruta";
import { borradoresPendientes, leerBorrador, confirmarBorrador, descartarBorrador, type FichaBorrador } from "@/lib/borradores";
import { avisarTelegram, escHtml } from "@/lib/n8n";
import { eur } from "@/lib/parse";

// Facturas leídas por Telegram que esperan confirmación: la app las enseña para revisarlas.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id");
  if (id) return { borrador: await leerBorrador(id) };
  return { borradores: await borradoresPendientes() };
});

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { id: string; accion: "confirmar" | "descartar"; cambios?: Partial<FichaBorrador>; forzar?: boolean };
  if (b.accion === "descartar") return { ok: true, borrador: await descartarBorrador(b.id) };
  const r = await confirmarBorrador(b.id, !!b.forzar, b.cambios);
  await avisarTelegram(`✅ <b>Factura confirmada desde la app</b> (${r.id}): ${escHtml(r.ficha.proveedor)} · ${eur(r.ficha.total)} → <code>#G${r.fila}</code>`);
  return { ok: true, borrador: r };
});
