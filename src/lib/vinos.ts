import "server-only";
// Foto de una botella desde la app: la IA LEE la etiqueta y el motor GUIA GASTRO del bot hace
// el resto (mira si ya lo tienes, lo investiga a fondo en internet y lo guarda). Mismas reglas
// que una foto por Telegram, así los dos caminos no pueden dar respuestas distintas.
import { n8n, webhook, ErrorN8n } from "./n8n";

// Las mismas reglas de lectura que "Analizar Documento" del multiagente (etiqueta_vino).
const PROMPT = `Es la foto de una botella, etiqueta o contraetiqueta de vino. LEE LA ETIQUETA ENTERA ANTES DE DECIDIR NADA.
Devuelve SOLO un JSON: {"es_vino":true|false,"texto_etiqueta":"","nombre":"","bodega":"","do":"","tipo":"","uva":"","anada":"","graduacion":"","confianza":"alta|baja","dudas":""}
1) "texto_etiqueta": transcribe TODO lo que se lea, también la letra pequeña.
2) Con todo ese texto delante, reparte:
- "nombre": el nombre COMERCIAL del vino. NO es siempre lo más grande ni lo primero que se lee.
  · Si hay un nombre de bodega y además otro nombre propio, el vino es el OTRO ("EMILIO MORO" + "MALLEOLUS" -> Malleolus).
  · Si hay una COLECCIÓN o línea y además el nombre de la parcela o del vino, van los dos
    ("BRUMA del estrecho de marín" + "PARCELA VEREDA" -> "Bruma del Estrecho de Marín Parcela Vereda").
  · NO metas en el nombre la D.O., el año, el volumen, el grado, premios ni "Producto de España".
  · Crianza / Reserva / Gran Reserva / Roble SÍ van si forman parte de la marca ("Valtravieso Crianza").
- "bodega": quien lo elabora ("Bodegas ...", "Embotellado por ..."). Si se llaman igual, lo mismo en los dos.
- "do": la denominación A SECAS ("Rioja", "Jumilla"). Vino de la tierra o IGP: "IGP <zona>".
- "tipo": SOLO el color (Tinto, Blanco, Rosado, Espumoso, Dulce).
- "uva", "anada" (año de cosecha), "graduacion".
- "confianza": "alta" si tienes claro el nombre del vino; "baja" si dudas. "dudas": qué no queda claro, en una frase.
Lo que no se lea va VACÍO: no lo deduzcas ni lo completes de memoria. Si la foto no es de un vino, "es_vino": false.`;

export interface Etiqueta {
  es_vino: boolean;
  nombre: string;
  bodega: string;
  do: string;
  tipo: string;
  uva: string;
  anada: string;
  graduacion: string;
  confianza: string;
  dudas: string;
}

export async function leerEtiqueta(base64: string, mime: string): Promise<Etiqueta> {
  if (!base64) throw new ErrorN8n("Falta la foto", 400);
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:${mime || "image/jpeg"};base64,${base64}` } }, { type: "text", text: PROMPT }] }],
      },
    },
    90000,
  );
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(r.choices?.[0]?.message?.content || "");
  } catch {
    throw new ErrorN8n("No he podido leer la etiqueta. Prueba con una foto más nítida y de cerca.", 502);
  }
  const s = (k: string) => String(d[k] ?? "").trim();
  return {
    es_vino: d.es_vino !== false,
    nombre: s("nombre"), bodega: s("bodega"), do: s("do"), tipo: s("tipo"), uva: s("uva"),
    anada: s("anada"), graduacion: s("graduacion"), confianza: s("confianza"), dudas: s("dudas"),
  };
}

/** Manda el vino al motor GUIA GASTRO (apuntar = crea o valora; si es nuevo, lo investiga). */
export async function apuntarVino(e: Etiqueta, extra: { nota?: string; comentario?: string; donde?: string } = {}) {
  // "clave: valor; ..." es el formato que entiende el motor. Se quitan los ";" de los valores.
  const limpio = (v: string) => v.replace(/[;\n]+/g, ",").trim();
  const datos = (
    [["bodega", e.bodega], ["do", e.do], ["tipo", e.tipo], ["uva", e.uva], ["anada", e.anada], ["graduacion", e.graduacion], ["donde", extra.donde || ""]] as const
  )
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${limpio(v)}`)
    .join("; ");
  const r = await webhook<{ ok?: boolean; resultado?: string }>(
    "guia-gastro-test",
    { que: "vinos", accion: "apuntar", nombre: e.nombre, nota: extra.nota || "", comentario: extra.comentario || "", datos, avisar: "" },
    150000,
  );
  return { ok: r.ok !== false, resultado: r.resultado || "" };
}
