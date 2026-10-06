import { manejar } from "@/lib/ruta";
import { buscarTodo } from "@/lib/buscarTodo";

// Búsqueda global por Telegram (/buscar y tool «Buscar todo»): notas, contactos, gastos, ingresos, vinos, restaurantes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { busqueda?: string; q?: string };
  return { resultado: await buscarTodo(String(b.busqueda || b.q || "")) };
});
