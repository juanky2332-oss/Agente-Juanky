import { NextResponse } from "next/server";
import { manejar } from "@/lib/ruta";
import { leerIngresos } from "@/lib/ingresosSrv";
import { textoRecordatorioIngresos } from "@/lib/ingresos";
import { avisarTelegram } from "@/lib/n8n";
import { hoyISO } from "@/lib/parse";
import { sincronizarTaller } from "@/lib/tallerSync";

// Vercel lo llama el día 5 de cada mes (vercel.json): pregunta por Telegram si se han hecho
// los pagos de los ingresos, por si llegó alguno sin apuntar o cambió algo.
// ?forzar=1 lo manda cualquier otro día (para probarlo).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async (req: Request) => {
  const hoy = hoyISO();
  if (hoy.slice(8, 10) !== "05" && !new URL(req.url).searchParams.has("forzar")) return { ok: true, enviado: false, motivo: "hoy no es día 5" };
  await sincronizarTaller(); // lo escrito a mano en las hojas de trabajos entra antes de preguntar
  const texto = textoRecordatorioIngresos(await leerIngresos(), hoy);
  // Si Telegram falla NO se responde 200: así Vercel y el centinela lo ven.
  if (!(await avisarTelegram(texto))) return NextResponse.json({ ok: false, error: "falló el envío a Telegram" }, { status: 500 });
  return { ok: true, enviado: true };
});
