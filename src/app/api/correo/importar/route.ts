import { manejar } from "@/lib/ruta";
import { ErrorN8n } from "@/lib/n8n";

// Lanza FACTURAS DEL CORREO a demanda: busca en Gmail, baja el PDF a Drive, lo lee y lo apunta
// en GestorIA (sin duplicar: compara nº de factura y proveedor+importe+fecha).
const BASE = process.env.N8N_BASE_URL || "https://paneln8n.transformaconia.com";

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { remitente?: string; desde?: string; hasta?: string; texto?: string; forzar?: boolean };
  const rem = String(b.remitente || "").trim().replace(/[{}()"]/g, "");
  const partes = [rem ? `from:${rem}` : "", b.texto ? String(b.texto).replace(/[{}()"]/g, " ") : "", b.desde ? `after:${b.desde.replace(/-/g, "/")}` : "", b.hasta ? `before:${b.hasta.replace(/-/g, "/")}` : ""].filter(Boolean);
  if (!rem && !b.texto) throw new ErrorN8n("Di al menos el remitente o una palabra a buscar", 400);
  const r = await fetch(BASE + "/webhook/facturas-correo-importar", {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-key": process.env.N8N_APP_KEY || "" },
    body: JSON.stringify({ q: partes.join(" ") + " -in:sent", limite: 30, forzar: !!b.forzar }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new ErrorN8n("n8n no ha aceptado la importación: " + r.status, 502);
  return { ok: true, consulta: partes.join(" ") };
});
