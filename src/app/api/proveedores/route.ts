import { manejar } from "@/lib/ruta";
import { webhook, ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

// Mismo buscador que /prov del bot (todas las palabras cuentan, nivel 1 nombre/NIF...).
export const GET = manejar(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) throw new ErrorN8n("Escribe qué buscas", 400);
  const r = await webhook<{ resultado?: string }>("consulta-proveedores-test", { busqueda: q });
  return { resultado: r.resultado || "" };
});
