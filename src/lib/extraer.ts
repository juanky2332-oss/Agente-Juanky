import "server-only";
// Lector de facturas (foto, PDF o texto de un PDF). Lo usan la app (subir factura) y los
// borradores de Telegram. La IA lee; los importes los valida el código.
import { n8n, ErrorN8n } from "./n8n";
import { CATEGORIAS, clasificar } from "./finanzas";
import { num, fechaISO } from "./parse";
import type { LineaFactura } from "./facturaTaller";

const PROMPT = `Eres un lector de facturas españolas. Lee TODO el documento antes de responder.
Devuelve SOLO un JSON con esta forma (usa null si un dato NO aparece; NUNCA lo inventes ni lo estimes):
{
 "tipo": "gasto" | "ingreso" | "presupuesto" | "albaran",
 "proveedor": "razón social del EMISOR",
 "nif_proveedor": string|null,
 "numero": "nº de factura",
 "fecha": "YYYY-MM-DD (fecha de emisión)",
 "concepto": "resumen corto de lo facturado (máx. 80 caracteres)",
 "base": number, "iva": number, "total": number,
 "categoria": una de ${JSON.stringify(CATEGORIAS)},
 "subcategoria": string|null,
 "periodo_desde": "YYYY-MM-DD"|null, "periodo_hasta": "YYYY-MM-DD"|null,
 "consumo": number|null, "unidad": "kWh"|"m3"|"GB"|"litros"|null,
 "recurrencia": "mensual"|"bimestral"|"trimestral"|"anual"|null,
 "pago": "domiciliación"|"tarjeta"|"transferencia"|"efectivo"|null,
 "detalle": {
   "tarifa": nombre comercial de la tarifa|null,
   "potencia_kw": number|null,
   "precio_kwh": precio del término de ENERGÍA en €/kWh SIN impuestos (si hay varios periodos, la media ponderada que venga en la factura; si no viene, null)|null,
   "precio_potencia_kw_dia": €/kW/día|null,
   "dias": días facturados|null,
   "cups": string|null,
   "datos_gb": number|null, "lineas": number|null,
   "permanencia": string|null,
   "descuentos": string|null,
   "cargos_extra": [ {"concepto": string, "importe": number} ]  (servicios añadidos, alquileres, mantenimientos, seguros, recargos: todo lo que NO es consumo ni potencia ni impuestos)
 },
 "cliente": "razón social del DESTINATARIO de la factura"|null,
 "lineas": [ {"pedido": "nº de pedido del cliente de esa línea ('Su pedido', 'Pedido', 'Ped.', 'S/Ref'; en facturas de taller suele ser 4500… o venir en la cabecera del albarán que agrupa varias líneas: aplícalo a TODAS sus líneas)"|null, "occ": "nº de OCC / orden / albarán de esa línea"|null, "descripcion": string, "unidades": number|null, "precio": precio unitario SIN IVA|null, "importe": importe de la línea SIN IVA} ]  (todas las líneas facturadas, en orden; [] si no hay detalle),
 "observaciones": "qué llama la atención de esta factura para ahorrar (cargos extra, penalizaciones, tarifa cara, permanencia...). Frases cortas. Solo lo que se ve en el documento.",
 "confianza": número de 0 a 1
}
Importes con punto decimal. El total es lo que se paga (con impuestos).`;

export async function leerFactura({ base64, mime, texto }: { base64?: string; mime?: string; texto?: string }) {
  if (!base64 && !texto) throw new ErrorN8n("Falta el archivo", 400);
  const esPdf = /pdf/i.test(mime || "");
  const adjunto = texto
    ? { type: "text", text: "TEXTO DEL DOCUMENTO:\n" + texto.slice(0, 15000) }
    : esPdf
      ? { type: "file", file: { filename: "factura.pdf", file_data: `data:application/pdf;base64,${base64}` } }
      : { type: "image_url", image_url: { url: `data:${mime || "image/jpeg"};base64,${base64}` } };
  const r = await n8n<{ choices?: { message?: { content?: string } }[]; error?: { message: string } }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [adjunto, { type: "text", text: PROMPT }] }],
      },
    },
    120000,
  );
  const txt = r.choices?.[0]?.message?.content || "";
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(txt);
  } catch {
    throw new ErrorN8n("La IA no ha devuelto una ficha legible. Prueba con una foto más nítida.", 502);
  }

  // Las cifras las valida el código, no el modelo.
  const avisos: string[] = [];
  const total = num(d.total);
  let base = num(d.base), iva = num(d.iva);
  if (!(total > 0)) avisos.push("No se lee el total: escríbelo tú.");
  if (total > 0 && base > 0 && Math.abs(base + iva - total) > Math.max(0.05, total * 0.02)) {
    avisos.push(`Base + IVA (${(base + iva).toFixed(2)}) no cuadra con el total (${total.toFixed(2)}). Revísalo.`);
  }
  if (total > 0 && !base) { base = +(total / 1.21).toFixed(2); iva = +(total - base).toFixed(2); avisos.push("Sin desglose de IVA: calculado al 21 %."); }
  const fecha = fechaISO(d.fecha) || null;
  if (!fecha) avisos.push("No se lee la fecha.");
  const proveedor = String(d.proveedor || "");
  const concepto = String(d.concepto || "");
  const categoria = CATEGORIAS.includes(d.categoria as never) ? (d.categoria as string) : clasificar(proveedor, concepto);
  const det = (d.detalle || {}) as Record<string, unknown>;
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(det)) if (v !== null && v !== "" && !(Array.isArray(v) && !v.length)) limpio[k] = v;
  if (typeof limpio.precio_kwh === "number" && (limpio.precio_kwh <= 0 || limpio.precio_kwh > 1)) {
    avisos.push("El precio del kWh leído no es creíble; lo descarto.");
    delete limpio.precio_kwh;
  }
  if (d.nif_proveedor) limpio.nif = d.nif_proveedor;
  if (d.observaciones) limpio.observaciones = d.observaciones;
  // Líneas con su nº de pedido (las facturas del taller se casan por ahí con tus trabajos).
  const vacio = (v: unknown) => v === null || v === undefined || v === "";
  const lineas: LineaFactura[] = (Array.isArray(d.lineas) ? (d.lineas as Record<string, unknown>[]) : [])
    .map((l) => ({
      pedido: String(l?.pedido ?? "").trim(),
      occ: String(l?.occ ?? "").trim(),
      descripcion: String(l?.descripcion ?? "").trim(),
      unidades: vacio(l?.unidades) ? null : num(l.unidades),
      precio: vacio(l?.precio) ? null : num(l.precio),
      importe: num(l?.importe),
    }))
    .filter((l) => l.importe || l.descripcion);
  return {
    lineas,
    nif: String(d.nif_proveedor || ""),
    cliente: String(d.cliente || ""),
    ficha: {
      tipo: ["gasto", "ingreso", "presupuesto", "albaran"].includes(String(d.tipo)) ? d.tipo : "gasto",
      proveedor,
      concepto,
      doc: String(d.numero || ""),
      fecha: fecha || "",
      base, iva, total,
      categoria,
      subcategoria: String(d.subcategoria || ""),
      periodoDesde: fechaISO(d.periodo_desde) || "",
      periodoHasta: fechaISO(d.periodo_hasta) || "",
      consumo: d.consumo === null || d.consumo === undefined ? "" : num(d.consumo),
      unidad: String(d.unidad || ""),
      recurrencia: String(d.recurrencia || ""),
      pago: String(d.pago || ""),
      detalle: limpio,
    },
    confianza: typeof d.confianza === "number" ? d.confianza : null,
    avisos,
  };
}
