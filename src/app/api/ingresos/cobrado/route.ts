import { manejar } from "@/lib/ruta";
import { leerRangos, aTabla, escribirCelda, letra } from "@/lib/sheets";
import { ErrorN8n, avisarTelegram, escHtml } from "@/lib/n8n";
import { num, eur } from "@/lib/parse";

// Port de /cobrado del bot. Las hojas de trabajos están llenas de fórmulas:
// - si "falta por pagar" es una fórmula que mira la celda de "pagado" → se escribe en pagado;
// - si es un número suelto → se baja ese número;
// - si es una fórmula que NO mira a pagado → no se escribe nada y se explica por qué.
// Después se relee y se comprueba que el pendiente ha bajado de verdad.

const HOJAS = {
  taller: { nombre: "Trabajos taller", pagado: /^pagado$/i, desc: (c: string[], i: (re: RegExp) => number) => c[i(/^trabajo$/i)] },
  flownexion: { nombre: "Trabajos flownexion", pagado: /^total pagado$/i, desc: (c: string[]) => c[0] },
} as const;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { hoja: keyof typeof HOJAS; fila: number; importe?: number; esperado: string };
  const h = HOJAS[b.hoja];
  if (!h || !b.fila) throw new ErrorN8n("Petición incompleta", 400);
  const rango = `'${h.nombre}'!A1:AB300`;
  const [valores, formulas] = [(await leerRangos([rango]))[0], (await leerRangos([rango], "FORMULA"))[0]];
  const t = aTabla(h.nombre, valores, /falta\s*por\s*pagar/i);
  const i = (re: RegExp) => t.cabecera.findIndex((c) => re.test(c.trim()));
  const iFalta = t.cabecera.findIndex((c) => /falta por pagar/i.test(c));
  const iPagado = i(h.pagado);
  const fila = valores[b.fila - 1] || [];
  const desc = String(h.desc(fila, i) || "").trim();
  if (!desc || desc !== b.esperado) throw new ErrorN8n("Esa línea ha cambiado desde que la cargaste. Recarga y repite.", 409);
  const falta = num(fila[iFalta]);
  if (!(falta > 0.005)) throw new ErrorN8n(`«${desc}» ya no tiene nada pendiente.`, 400);
  const importe = b.importe && b.importe > 0 ? Math.min(b.importe, falta) : falta;

  const fFalta = String((formulas[b.fila - 1] || [])[iFalta] ?? "");
  const celdaPagado = iPagado >= 0 ? letra(iPagado) + b.fila : "";
  const celdaFalta = letra(iFalta) + b.fila;
  let escrito = "";
  if (fFalta.startsWith("=")) {
    if (celdaPagado && new RegExp(`(^|[^A-Z])\\$?${letra(iPagado)}\\$?${b.fila}(?!\\d)`, "i").test(fFalta)) {
      const nuevo = num(fila[iPagado]) + importe;
      await escribirCelda(h.nombre, celdaPagado, String(Math.round(nuevo * 100) / 100).replace(".", ","));
      escrito = `${celdaPagado} (pagado) = ${eur(nuevo)}`;
    } else {
      throw new ErrorN8n(
        `No escribo nada: el pendiente (${celdaFalta}) es la fórmula ${fFalta}, que no depende de la columna «pagado». Apúntalo a mano en la hoja o cambia la fórmula para que reste lo pagado.`,
        409,
      );
    }
  } else {
    await escribirCelda(h.nombre, celdaFalta, String(Math.round((falta - importe) * 100) / 100).replace(".", ","));
    escrito = `${celdaFalta} (falta por pagar) = ${eur(falta - importe)}`;
  }

  const [despues] = await leerRangos([`'${h.nombre}'!A${b.fila}:AB${b.fila}`]);
  const faltaDespues = num((despues[0] || [])[iFalta]);
  if (!(faltaDespues < falta - 0.004))
    throw new ErrorN8n(`He escrito ${escrito}, pero el pendiente sigue en ${eur(faltaDespues)}. Revisa la hoja.`, 409);
  await avisarTelegram(`✅ <b>Cobrado desde la app</b>: ${escHtml(desc)} · ${eur(importe)}\nPendiente ahora: ${eur(faltaDespues)}`);
  return { ok: true, escrito, faltaAntes: falta, faltaDespues };
});
