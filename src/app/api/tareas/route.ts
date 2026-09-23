import { manejar } from "@/lib/ruta";
import { cargarNotas } from "@/lib/datos";
import { anadirFila, modificarFila, borrarFila } from "@/lib/sheets";
import { webhook, ErrorN8n, avisarTelegram, escHtml } from "@/lib/n8n";
import { hoyEs, fechaHora } from "@/lib/parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async () => ({ notas: await cargarNotas() }));

function aTexto(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Misma gramática de periodos que el bot: [mensual] [anual] [15d] [3m] [2a]...
function periodo(txt: string): { d?: number; m?: number } | null {
  const t = txt.toLowerCase().trim();
  const fijo: Record<string, { d?: number; m?: number }> = {
    semanal: { d: 7 }, quincenal: { d: 14 }, mensual: { m: 1 }, bimestral: { m: 2 }, trimestral: { m: 3 },
    cuatrimestral: { m: 4 }, semestral: { m: 6 }, anual: { m: 12 }, bianual: { m: 24 },
  };
  if (fijo[t]) return fijo[t];
  const m = t.match(/^(\d+)\s*([dsma])$/);
  if (!m) return null;
  const n = +m[1];
  return m[2] === "d" ? { d: n } : m[2] === "s" ? { d: n * 7 } : m[2] === "m" ? { m: n } : { m: n * 12 };
}

function siguiente(desde: Date, p: { d?: number; m?: number }) {
  const d = new Date(desde);
  const ahora = Date.now();
  // Se suma desde el vencimiento anterior hasta pasar de hoy: marcarla tarde no desplaza la serie.
  for (let i = 0; i < 500 && d.getTime() <= ahora; i++) {
    if (p.d) d.setDate(d.getDate() + p.d);
    if (p.m) d.setMonth(d.getMonth() + p.m);
  }
  return d;
}

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { contenido: string; tipo?: string; vencimiento?: string };
  const contenido = (b.contenido || "").trim();
  if (!contenido) throw new ErrorN8n("Escribe la tarea", 400);
  const tipo = /\[[^\]]+\]\s*$/.test(contenido) ? "recurrente" : b.tipo || "tarea";
  if (b.vencimiento) {
    const d = new Date(b.vencimiento);
    if (isNaN(d.getTime())) throw new ErrorN8n("Fecha de aviso no válida", 400);
    // El DESPERTADOR crea la fila y deja programado el aviso de Telegram a esa hora.
    const r = await webhook<unknown>("despertador-juanky", { texto: contenido, cuando: aTexto(d), tipo, fila: 0, ya_existe: false });
    return { ok: true, programado: aTexto(d), respuesta: r };
  }
  const { fila } = await anadirFila("Notas Juanky", { FECHA: hoyEs(), TIPO: tipo, CONTENIDO: contenido, ESTADO: "pendiente" });
  return { ok: true, fila };
});

export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as { fila: number; esperado: string; estado?: string; contenido?: string; vencimiento?: string | null; tipo?: string };
  const cambios: Record<string, string> = {};
  const notas = await cargarNotas();
  const n = notas.find((x) => x.fila === b.fila);
  if (!n || n.contenido !== b.esperado) throw new ErrorN8n("Esa nota ha cambiado o ya no existe (quizá la tocaste desde Telegram). Recarga.", 409);
  let reprogramar: Date | null = null;
  if (b.estado) {
    if (b.estado === "hecha" && n.recurrente && periodo(n.recurrente)) {
      const base = fechaHora(n.vencimiento) || new Date();
      reprogramar = siguiente(base, periodo(n.recurrente)!);
      cambios.ESTADO = "pendiente";
      cambios.VENCIMIENTO = aTexto(reprogramar);
    } else cambios.ESTADO = b.estado;
  }
  if (b.contenido !== undefined) cambios.CONTENIDO = b.contenido.trim();
  if (b.tipo) cambios.TIPO = b.tipo;
  if (b.vencimiento !== undefined) {
    if (b.vencimiento) {
      const d = new Date(b.vencimiento);
      if (isNaN(d.getTime())) throw new ErrorN8n("Fecha no válida", 400);
      cambios.VENCIMIENTO = aTexto(d);
      reprogramar = d;
      if (!b.estado) cambios.ESTADO = "pendiente";
    } else cambios.VENCIMIENTO = "";
  }
  await modificarFila("Notas Juanky", b.fila, cambios, (o) => o.CONTENIDO === b.esperado);
  let aviso = "";
  if (reprogramar) {
    try {
      await webhook("despertador-juanky", { texto: cambios.CONTENIDO || n.contenido, cuando: aTexto(reprogramar), tipo: n.tipo, fila: b.fila, ya_existe: true });
      aviso = "Aviso programado para el " + aTexto(reprogramar);
    } catch {
      aviso = "Guardado, pero no he podido programar el aviso de Telegram (saldrá en el parte de las 8:00).";
    }
  }
  if (b.estado === "hecha") await avisarTelegram(`✅ <b>Hecho desde la app</b>: ${escHtml(n.contenido)}${reprogramar ? `\n🔁 Próxima: ${aTexto(reprogramar)}` : ""}`);
  return { ok: true, aviso };
});

export const DELETE = manejar(async (req: Request) => {
  const u = new URL(req.url);
  const fila = Number(u.searchParams.get("fila"));
  const esperado = u.searchParams.get("esperado") || "";
  await borrarFila("Notas Juanky", fila, (o) => o.CONTENIDO === esperado);
  return { ok: true };
});
