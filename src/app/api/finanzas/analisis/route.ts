import { manejar } from "@/lib/ruta";
import { n8n, ErrorN8n } from "@/lib/n8n";

export const maxDuration = 120;

// La IA recibe un resumen YA CALCULADO y solo redacta. No puede añadir cifras nuevas
// salvo operaciones simples sobre las que le pasamos (y lo tiene que decir).
const SISTEMA = `Eres el asesor financiero personal de Juanky (Murcia). Hablas claro, directo y sin relleno, en español de España.
Recibes un JSON con sus gastos e ingresos YA CALCULADOS por código, hallazgos detectados y referencias de mercado.
REGLAS:
- Usa SOLO cifras que estén en el JSON. Si haces una cuenta (p.ej. ahorro anual = diferencia mensual × 12), di de dónde sale.
- No inventes precios de mercado: usa solo las referencias del JSON. Si no hay referencia para algo, dilo.
- Sé crítico y concreto: nombra proveedores, importes y qué hacer mañana mismo.
- Si un dato parece un error de apunte (importe absurdo), dilo antes de sacar conclusiones con él.
Devuelve SOLO JSON:
{"resumen": "3-4 frases con la foto general",
 "puntos_fuertes": ["..."],
 "puntos_debiles": ["..."],
 "acciones": [{"accion": "...", "por_que": "...", "ahorro_anual": number|null, "prioridad": "alta"|"media"|"baja"}],
 "preguntas": ["datos que le faltan para afinar el análisis"]}`;

export const POST = manejar(async (req: Request) => {
  const resumen = await req.json();
  if (!resumen || typeof resumen !== "object") throw new ErrorN8n("Falta el resumen", 400);
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "medium",
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SISTEMA },
          { role: "user", content: JSON.stringify(resumen).slice(0, 60000) },
        ],
      },
    },
    120000,
  );
  try {
    return JSON.parse(r.choices?.[0]?.message?.content || "");
  } catch {
    throw new ErrorN8n("La IA no ha devuelto un análisis legible. Reinténtalo.", 502);
  }
});
