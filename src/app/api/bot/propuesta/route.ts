import { manejar } from "@/lib/ruta";
import { ErrorN8n } from "@/lib/n8n";
import { cuotaMensual, ErrorPropuesta, fechaLarga, generarPropuestaPdf, PLANES, TARIFA, validarPeticion, type PeticionPropuesta } from "@/lib/propuesta";

// Propuesta comercial de «IndunexIA» en PDF (2 páginas) para mandarla por Telegram.
// Entrada (JSON): { cliente, plan? (básico | profesional | pro; por defecto profesional), usuariosExtra?, modulos?, notas? }
// Salida: { ok, archivo, mime, base64, paginas, cliente, usuariosExtra, cuotaMensual, texto }
// Protegida como el resto de /api/bot/* (x-app-key del workflow de n8n).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json().catch(() => null)) as PeticionPropuesta | null;
  if (!b || typeof b !== "object") throw new ErrorN8n("El cuerpo tiene que ser un JSON: { cliente, usuariosExtra?, modulos?, notas? }", 400);
  let datos;
  try {
    datos = validarPeticion(b);
  } catch (e) {
    if (e instanceof ErrorPropuesta) throw new ErrorN8n(e.message, 400);
    throw e;
  }
  const hoy = new Date();
  const { pdf, archivo, paginas } = await generarPropuestaPdf(datos, hoy);
  const cuota = cuotaMensual(datos.usuariosExtra, datos.plan);
  const plan = PLANES[datos.plan];
  const texto = `📄 Propuesta de IndunexIA para ${datos.cliente} (${fechaLarga(hoy)}): plan ${plan.nombre}, puesta en marcha ${plan.puestaEnMarcha} €, ${TARIFA.mesesGratis} meses de mantenimiento gratis y después ${cuota} €/mes${datos.usuariosExtra ? ` (con ${datos.usuariosExtra} usuario${datos.usuariosExtra === 1 ? "" : "s"} extra)` : ""}. Sin IVA.`;
  return {
    ok: true,
    archivo,
    mime: "application/pdf",
    base64: Buffer.from(pdf).toString("base64"),
    paginas,
    cliente: datos.cliente,
    usuariosExtra: datos.usuariosExtra,
    cuotaMensual: cuota,
    // «resultado» es lo que el PUENTE de n8n contesta en Telegram
    resultado: texto,
    texto,
  };
});
