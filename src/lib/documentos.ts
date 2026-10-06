import "server-only";
// Mandar archivos a Juanky por Telegram (facturas de Drive, informes). Lo hace el workflow n8n
// «DOCUMENTOS A TELEGRAM (app)»: baja de Drive con la credencial de Sheets (scope drive.file),
// junta un ZIP si se le pide y lo manda al chat. Las facturas subidas antes del 23-09-2026 (con la
// credencial de Drive ya revocada) NO se pueden bajar: de esas se da el enlace.
import { webhook, ErrorN8n } from "./n8n";

export interface Archivo { driveId?: string; base64?: string; nombre: string; mime?: string }

/** Id de Drive de un enlace (".../file/d/<id>/view", "?id=<id>"). "" si no es de Drive. */
export function driveIdDe(enlace: string) {
  const e = String(enlace || "");
  return e.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1] || e.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1] || "";
}

/** Extensión según el tipo, para que el archivo se abra bien en el móvil. */
export const extDe = (mime: string) => (/pdf/.test(mime) ? ".pdf" : /png/.test(mime) ? ".png" : /jpe?g|image/.test(mime) ? ".jpg" : /csv/.test(mime) ? ".csv" : "");

export async function enviarArchivos(archivos: Archivo[], caption = "", zip = "") {
  if (!archivos.length) throw new ErrorN8n("No hay archivos que mandar", 400);
  const r = await webhook<{ ok?: boolean; enviados?: number; archivos?: number; fallos?: string[]; error?: string }>("app-juanky-docs", { caption, zip, archivos }, 180000);
  if (!r || typeof r !== "object") throw new ErrorN8n("El envío de documentos no ha respondido", 502);
  return { ok: !!r.ok, archivos: r.archivos || 0, fallos: r.fallos || [], error: r.error || "" };
}
