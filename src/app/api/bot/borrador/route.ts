import { manejar } from "@/lib/ruta";
import { crearBorrador, yaVistoCorreo, modificarBorrador, confirmarBorrador, descartarBorrador, leerBorrador, borradoresPendientes, tarjetaDe, urlDe, lineaPendiente, type FichaBorrador, type CambiosTaller, type Borrador } from "@/lib/borradores";
import { ErrorN8n, n8n } from "@/lib/n8n";
import { normId } from "@/lib/ingresos";
import { sincronizarTaller } from "@/lib/tallerSync";

// Facturas que llegan por Telegram (foto o PDF): borrador + tarjeta con botones.
// Respuesta: { resultado (html), id, estado, url, clase, boton } — el bot pinta los botones si
// estado=pendiente. clase "taller" = factura DEL TALLER: confirmar = apuntar tu 10 % como cobrado.
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { accion: string; id?: string; origen?: string; nombre?: string; base64?: string; mime?: string; texto?: string; enlace?: string; datos?: (Partial<FichaBorrador> & CambiosTaller) | string; forzar?: boolean };
  const id = b.id ? normId(b.id, "B") : "";
  const salida = async (x: Borrador) => ({
    resultado: await tarjetaDe(x),
    id: x.id,
    estado: x.estado,
    url: urlDe(x),
    clase: x.taller ? "taller" : "gasto",
    boton: x.taller ? "✅ Confirmar cobro" : "✅ Guardar",
  });
  let datos = b.datos || {};
  if (typeof datos === "string") {
    try {
      datos = datos.trim() ? JSON.parse(datos) : {};
    } catch {
      throw new ErrorN8n("datos tiene que ser un JSON", 400);
    }
  }
  switch (b.accion) {
    case "crear": {
      // Del correo (remitente fuera de la lista): cada mensaje se propone UNA vez.
      const origen = /^correo:/.test(b.origen || "") ? String(b.origen).slice(0, 300) : "telegram";
      if (origen !== "telegram") {
        const ya = await yaVistoCorreo(origen);
        if (ya) return { resultado: `Ese correo ya te lo propuse (${ya.id}).`, id: ya.id, estado: "repetido", url: "", clase: "", boton: "" };
      }
      // El PDF del correo se guarda en Drive (como los de la lista blanca), para tenerlo y poder mandártelo luego.
      let enlace = b.enlace || "";
      if (!enlace && b.base64 && origen !== "telegram") {
        const d = await n8n<{ enlace?: string }>({ op: "drive", base64: b.base64, mime: b.mime || "application/pdf", nombre: (b.nombre || "factura_correo.pdf").slice(0, 120) }, 90000).catch(() => null);
        enlace = d?.enlace || "";
      }
      return salida(await crearBorrador({ base64: b.base64, mime: b.mime, texto: b.texto, enlace, origen }));
    }
    case "modificar":
      if (!id) throw new ErrorN8n("¿Qué borrador? (B001…)", 400);
      return salida(await modificarBorrador(id, datos as Partial<FichaBorrador> & CambiosTaller));
    case "confirmar":
      try {
        const r = await confirmarBorrador(id, !!b.forzar);
        if (r.taller) await sincronizarTaller(); // los cobros bajan también a «Trabajos taller»
        return salida(r);
      } catch (e) {
        const msg = (e as Error).message;
        // Doble toque en ✅: se enseña otra vez la tarjeta (ya apuntada), no un error.
        if ((e as ErrorN8n).status === 409 && /ya está/.test(msg)) return salida(await leerBorrador(id));
        if (/^DUPLICADO/.test(msg)) return { resultado: "⚠️ " + msg.replace(/^DUPLICADO: /, "") + "\n\nSi de verdad es otra factura, pulsa «Guardar igualmente».", id, estado: "duplicado", url: "" };
        throw e;
      }
    case "descartar":
      return salida(await descartarBorrador(id));
    case "ver":
      return salida(await leerBorrador(id));
    case "pendientes": {
      const xs = await borradoresPendientes();
      return { resultado: xs.length ? xs.map(lineaPendiente).join("\n") : "No hay facturas esperando confirmación.", id: xs[0]?.id || "", estado: "lista", url: "" };
    }
  }
  throw new ErrorN8n("Acción no válida: crear, modificar, confirmar, descartar, ver, pendientes", 400);
});
