import { manejar } from "@/lib/ruta";
import { crearBorrador, modificarBorrador, confirmarBorrador, descartarBorrador, leerBorrador, borradoresPendientes, tarjeta, urlRevisar, type FichaBorrador } from "@/lib/borradores";
import { ErrorN8n } from "@/lib/n8n";
import { normId } from "@/lib/ingresos";

// Facturas que llegan por Telegram (foto o PDF): borrador + tarjeta con botones.
// Respuesta: { resultado (html), id, estado, url } — el bot pinta los botones si estado=pendiente.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { accion: string; id?: string; base64?: string; mime?: string; texto?: string; enlace?: string; datos?: Partial<FichaBorrador>; forzar?: boolean };
  const id = b.id ? normId(b.id, "B") : "";
  const salida = (x: Awaited<ReturnType<typeof leerBorrador>>) => ({ resultado: tarjeta(x), id: x.id, estado: x.estado, url: urlRevisar(x.id) });
  switch (b.accion) {
    case "crear":
      return salida(await crearBorrador({ base64: b.base64, mime: b.mime, texto: b.texto, enlace: b.enlace }));
    case "modificar":
      if (!id) throw new ErrorN8n("¿Qué borrador? (B001…)", 400);
      return salida(await modificarBorrador(id, b.datos || {}));
    case "confirmar":
      try {
        return salida(await confirmarBorrador(id, !!b.forzar));
      } catch (e) {
        const msg = (e as Error).message;
        if (/^DUPLICADO/.test(msg)) return { resultado: "⚠️ " + msg.replace(/^DUPLICADO: /, "") + "\n\nSi de verdad es otra factura, pulsa «Guardar igualmente».", id, estado: "duplicado", url: urlRevisar(id) };
        throw e;
      }
    case "descartar":
      return salida(await descartarBorrador(id));
    case "ver":
      return salida(await leerBorrador(id));
    case "pendientes": {
      const xs = await borradoresPendientes();
      return { resultado: xs.length ? xs.map((x) => `<code>${x.id}</code> ${x.ficha?.proveedor || "?"} · ${x.ficha?.total ?? "?"} €`).join("\n") : "No hay facturas esperando confirmación.", id: xs[0]?.id || "", estado: "lista", url: "" };
    }
  }
  throw new ErrorN8n("Acción no válida: crear, modificar, confirmar, descartar, ver, pendientes", 400);
});
