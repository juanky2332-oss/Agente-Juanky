import "server-only";
import { n8n, ErrorN8n, escHtml } from "./n8n";
import { leerTabla, aObjeto, anadirFila, modificarPorId, escribirCelda, filaPorId, type Tabla } from "./sheets";
import { hoyISO } from "./parse";
import { TEMARIO, leccion, type Leccion } from "./estudioTemario";

// Bloque Estudio: temario técnico, progreso («lo entiendo / no»), explicación más sencilla con ejemplos
// y novedades de IA. Todo a petición (regla de Juanky: nada diario automático).
// Progreso en la pestaña «Estudio» (se crea sola la primera vez). Fila «_NOVEDADES» = caché del resumen.

const HOJA = "Estudio";
const CAB = ["ID", "TITULO", "ESTADO", "VECES", "ULTIMA", "EXPLICACION", "DUDA"];
const APP = "https://agente-juanky.vercel.app/estudio";
// Repaso espaciado: días que tienen que pasar para volver a preguntar algo ya entendido, según las veces.
const ESPERA = [2, 5, 12, 30, 60];

export type EstadoLeccion = "nueva" | "entendida" | "repasar";
export interface Explicacion { explicacion: string; ejemplo: string; enTusApps: string; pregunta: string; fecha: string }
export interface Progreso { id: string; estado: EstadoLeccion; veces: number; ultima: string; explicacion: Explicacion | null; duda: string }
export interface Noticia { titulo: string; resumen: string; importa: string; termino: string; enlace: string; fuente: string }
export interface Novedades { fecha: string; noticias: Noticia[] }

async function tabla(): Promise<Tabla> {
  try {
    return await leerTabla(HOJA);
  } catch (e) {
    if (!/Unable to parse range|no encontr|not found/i.test(String((e as Error).message))) throw e;
    await n8n({ op: "sheets", method: "POST", path: ":batchUpdate", body: { requests: [{ addSheet: { properties: { title: HOJA, gridProperties: { rowCount: 200, columnCount: CAB.length } } } }] } });
    await n8n({ op: "sheets", method: "PUT", path: `/values/${encodeURIComponent(`'${HOJA}'!A1:G1`)}?valueInputOption=RAW`, body: { values: [CAB] } });
    return leerTabla(HOJA);
  }
}

const jsonSeguro = <T>(s: string): T | null => {
  try {
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
};

function progresoDe(t: Tabla): Map<string, Progreso> {
  const m = new Map<string, Progreso>();
  for (const f of t.filas) {
    const o = aObjeto(t, f.celdas);
    if (!o.ID || o.ID.startsWith("_")) continue;
    const estado = (["entendida", "repasar"].includes(o.ESTADO) ? o.ESTADO : "nueva") as EstadoLeccion;
    m.set(o.ID, { id: o.ID, estado, veces: +o.VECES || 0, ultima: o.ULTIMA || "", explicacion: jsonSeguro<Explicacion>(o.EXPLICACION), duda: o.DUDA || "" });
  }
  return m;
}

const vacio = (id: string): Progreso => ({ id, estado: "nueva", veces: 0, ultima: "", explicacion: null, duda: "" });
const dias = (iso: string) => (iso ? Math.floor((Date.parse(hoyISO()) - Date.parse(iso)) / 86400000) : 9999);

/** Siguiente lección: primero lo marcado «no lo entiendo», luego lo nuevo en orden, luego repaso espaciado. */
export function siguiente(prog: Map<string, Progreso>): Leccion | null {
  const p = (l: Leccion) => prog.get(l.id) || vacio(l.id);
  const repasar = TEMARIO.filter((l) => p(l).estado === "repasar").sort((a, b) => p(a).ultima.localeCompare(p(b).ultima));
  if (repasar.length) return repasar[0];
  const nueva = TEMARIO.find((l) => p(l).estado === "nueva");
  if (nueva) return nueva;
  const toca = TEMARIO.filter((l) => dias(p(l).ultima) >= ESPERA[Math.min(p(l).veces, ESPERA.length) - 1]).sort((a, b) => p(a).ultima.localeCompare(p(b).ultima));
  return toca[0] || null;
}

export async function cargarEstudio() {
  const prog = progresoDe(await tabla());
  const lista = TEMARIO.map((l) => ({ ...l, progreso: prog.get(l.id) || vacio(l.id) }));
  const cuenta = { entendidas: lista.filter((l) => l.progreso.estado === "entendida").length, repasar: lista.filter((l) => l.progreso.estado === "repasar").length, total: lista.length };
  return { lecciones: lista, cuenta, siguiente: siguiente(prog)?.id || null };
}

async function guardar(id: string, cambios: Record<string, unknown>) {
  const t = await tabla();
  const l = leccion(id);
  if (filaPorId(t, id)) return modificarPorId(HOJA, id, cambios);
  return anadirFila(HOJA, { ID: id, TITULO: l?.titulo || id, ESTADO: "nueva", VECES: 0, ...cambios }, t.cabecera);
}

export async function marcar(id: string, entendida: boolean) {
  const l = leccion(id);
  if (!l) throw new ErrorN8n(`No hay ninguna lección «${id}»`, 404);
  const prog = progresoDe(await tabla()).get(id) || vacio(id);
  // Entender suma una vez al repaso espaciado; no entender lo deja para repasar el primero.
  await guardar(id, { ESTADO: entendida ? "entendida" : "repasar", VECES: entendida ? prog.veces + 1 : prog.veces, ULTIMA: hoyISO() });
  return { id, estado: entendida ? "entendida" : "repasar" };
}

/** «No lo entiendo»: otra explicación más sencilla, con ejemplo cotidiano y uno de sus proyectos. Se guarda. */
export async function explicarMejor(id: string, duda = "") {
  const l = leccion(id);
  if (!l) throw new ErrorN8n(`No hay ninguna lección «${id}»`, 404);
  const prev = progresoDe(await tabla()).get(id);
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Eres el profesor particular de Juanky: consultor y desarrollador de IA que construye muy bien (Next.js, Supabase/Neon, n8n, OpenAI, bots de Telegram, un ERP para talleres, un chatbot para una tienda online técnica) pero olvida la teoría y los términos. Explica en español de España, como a un amigo listo, frases cortas, cero jerga sin explicar.
Devuelve SOLO JSON: {"explicacion": "3-5 frases, más sencilla que la anterior y desde otro ángulo", "ejemplo": "un ejemplo de la vida diaria (taller, bar, casa) en 2-3 frases", "enTusApps": "dónde aparece en lo que él ya ha construido, en 1-2 frases", "pregunta": "una pregunta corta para que compruebe si lo ha entendido"}.
No nombres empresas cliente. No inventes datos técnicos.`,
          },
          {
            role: "user",
            content: `Lección: ${l.titulo}\nDefinición: ${l.frase}\nExplicación que ya leyó: ${l.explicacion}\nAnalogía que ya leyó: ${l.analogia}\nEn sus apps: ${l.enTusApps}${prev?.explicacion ? `\nOtra explicación que tampoco le sirvió: ${prev.explicacion.explicacion}` : ""}\nLo que no entiende: ${duda.trim() || "(no lo ha dicho: no lo entiende en general)"}`,
          },
        ],
      },
    },
    90000,
  );
  const d = jsonSeguro<Partial<Explicacion>>(r.choices?.[0]?.message?.content || "");
  if (!d?.explicacion) throw new ErrorN8n("La IA no devolvió una explicación. Prueba otra vez.", 502);
  const ex: Explicacion = { explicacion: String(d.explicacion), ejemplo: String(d.ejemplo || ""), enTusApps: String(d.enTusApps || ""), pregunta: String(d.pregunta || ""), fecha: hoyISO() };
  await guardar(id, { ESTADO: "repasar", ULTIMA: hoyISO(), EXPLICACION: JSON.stringify(ex), DUDA: duda.slice(0, 500) });
  return ex;
}

// ───────── Novedades de IA (RSS gratis + un resumen con IA, caché de 12 h) ─────────
const FUENTES = [
  ["OpenAI", "https://openai.com/news/rss.xml"],
  ["Hugging Face", "https://huggingface.co/blog/feed.xml"],
  ["TechCrunch", "https://techcrunch.com/category/artificial-intelligence/feed/"],
  ["The Verge", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"],
  ["Xataka", "https://www.xataka.com/tag/inteligencia-artificial/rss2.xml"],
  ["Genbeta", "https://www.genbeta.com/tag/inteligencia-artificial/rss2.xml"],
] as const;

const limpiar = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export function leerRss(xml: string, fuente: string) {
  const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  return items.map((it) => {
    const tag = (n: string) => limpiar(it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`))?.[1] || "");
    const link = tag("link") || it.match(/<link[^>]*href="([^"]+)"/)?.[1] || "";
    const fecha = Date.parse(tag("pubDate") || tag("updated") || tag("published")) || 0;
    return { fuente, titulo: tag("title"), enlace: link, fecha, texto: (tag("description") || tag("summary")).slice(0, 300) };
  });
}

async function titulares() {
  const lotes = await Promise.all(
    FUENTES.map(async ([f, u]) => {
      try {
        const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (EstudioJuanky)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
        return r.ok ? leerRss(await r.text(), f).slice(0, 12) : [];
      } catch {
        return [];
      }
    }),
  );
  const semana = Date.now() - 7 * 86400000;
  return lotes.flat().filter((x) => x.titulo && /^https?:\/\//.test(x.enlace) && x.fecha >= semana).sort((a, b) => b.fecha - a.fecha).slice(0, 40);
}

export async function novedades(forzar = false): Promise<Novedades> {
  const t = await tabla();
  const fila = filaPorId(t, "_NOVEDADES");
  const cache = fila ? jsonSeguro<Novedades & { hora?: number }>(aObjeto(t, fila.celdas).EXPLICACION) : null;
  if (!forzar && cache?.hora && Date.now() - cache.hora < 12 * 3600000) return cache;
  const lista = await titulares();
  if (!lista.length) throw new ErrorN8n("No he podido leer ninguna fuente de noticias ahora mismo. Prueba en un rato.", 502);
  const temario = TEMARIO.map((l) => `${l.id}: ${l.titulo}`).join("; ");
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Eliges las 6 noticias de IA de esta semana más útiles para un consultor y desarrollador de IA que vende a pymes industriales españolas (ERP con IA, chatbots técnicos, automatizaciones). Prioriza modelos nuevos, agentes, herramientas para desarrolladores, precios y regulación; descarta cotilleos y finanzas de grandes empresas.
Devuelve SOLO JSON {"noticias":[{"n": número de la lista, "titulo": "en español, máx. 90 caracteres", "resumen": "qué ha pasado, 1-2 frases", "importa": "por qué le importa a él o a sus clientes, 1 frase", "termino": "id del temario relacionado o vacío"}]}.
Usa solo lo que dice cada titular y su texto: no inventes cifras ni fechas. Temario: ${temario}`,
          },
          { role: "user", content: lista.map((x, i) => `${i + 1}. [${x.fuente}] ${x.titulo} — ${x.texto}`).join("\n") },
        ],
      },
    },
    90000,
  );
  const d = jsonSeguro<{ noticias?: { n?: number; titulo?: string; resumen?: string; importa?: string; termino?: string }[] }>(r.choices?.[0]?.message?.content || "");
  // El enlace y la fuente salen de la lista real (por número), nunca de la IA.
  const noticias: Noticia[] = (d?.noticias || [])
    .map((x) => ({ x, o: lista[(x.n || 0) - 1] }))
    .filter(({ x, o }) => o && x.titulo)
    .slice(0, 6)
    .map(({ x, o }) => ({ titulo: String(x.titulo), resumen: String(x.resumen || ""), importa: String(x.importa || ""), termino: leccion(String(x.termino || "")) ? String(x.termino) : "", enlace: o.enlace, fuente: o.fuente }));
  if (!noticias.length) throw new ErrorN8n("La IA no devolvió noticias. Prueba otra vez.", 502);
  const res = { fecha: hoyISO(), hora: Date.now(), noticias };
  if (fila) await escribirCelda(HOJA, `F${fila.fila}`, JSON.stringify(res), false);
  else await anadirFila(HOJA, { ID: "_NOVEDADES", TITULO: "Caché de novedades (no tocar)", EXPLICACION: JSON.stringify(res) }, t.cabecera);
  return res;
}

// ───────── Telegram (texto HTML) ─────────
export function tarjetaHtml(l: Leccion, p?: Progreso) {
  const ex = p?.explicacion;
  return [
    `📚 <b>${escHtml(l.titulo)}</b>  <i>(${escHtml(l.tema)})</i>`,
    `\n<b>En una frase:</b> ${escHtml(l.frase)}`,
    `\n${escHtml(l.explicacion)}`,
    `\n🧩 <b>Como si…</b> ${escHtml(l.analogia)}`,
    `🛠 <b>En tus apps:</b> ${escHtml(l.enTusApps)}`,
    `💬 <b>Para un cliente:</b> ${escHtml(l.paraCliente)}`,
    `\n➡️ ${l.flujo.map(escHtml).join(" → ")}`,
    ex ? `\n🔁 <b>Tu explicación sencilla:</b> ${escHtml(ex.explicacion)}\n<b>Ejemplo:</b> ${escHtml(ex.ejemplo)}` : "",
    `\n✅ <code>/estudio ok ${l.id}</code> · ❓ <code>/estudio no ${l.id} lo que no entiendes</code>`,
    `📊 Gráfico y progreso: ${APP}?l=${l.id}`,
  ].filter(Boolean).join("\n");
}

/** Comandos de Telegram: /estudio [tema|ok id|no id duda|lista] y /novedades [ya]. */
export async function deTexto(texto: string): Promise<string> {
  const t = texto.trim().replace(/^\/(estudio|estudiar|aprender)\b/i, "").trim();
  if (/^\/?(novedades|noticias)\b/i.test(texto.trim())) {
    const n = await novedades(/\b(ya|nuevas|forzar)\b/i.test(texto));
    return [`🗞 <b>Novedades de IA</b> (${n.fecha})`, ...n.noticias.map((x, i) => `\n<b>${i + 1}. ${escHtml(x.titulo)}</b>\n${escHtml(x.resumen)}\n👉 <i>${escHtml(x.importa)}</i>${x.termino ? ` · <code>/estudio ${x.termino}</code>` : ""}\n<a href="${escHtml(x.enlace)}">${escHtml(x.fuente)}</a>`), `\n${APP}?vista=novedades`].join("\n");
  }
  const { lecciones, cuenta, siguiente: sig } = await cargarEstudio();
  const m = t.match(/^(ok|si|sí|vale|entendido|no)\s+(\S+)\s*([\s\S]*)$/i);
  if (m) {
    const id = m[2].toLowerCase();
    if (!leccion(id)) return `No conozco la lección «${escHtml(id)}». Escribe <code>/estudio lista</code>.`;
    if (m[1].toLowerCase() !== "no") {
      await marcar(id, true);
      const otra = siguiente(new Map(lecciones.map((l) => [l.id, l.id === id ? { ...l.progreso, estado: "entendida" as const, veces: l.progreso.veces + 1, ultima: hoyISO() } : l.progreso])));
      return `✅ Apuntado: entiendes <b>${escHtml(leccion(id)!.titulo)}</b>. Volverá en unos días para repasar.${otra ? `\nSiguiente: <code>/estudio ${otra.id}</code> (${escHtml(otra.titulo)})` : "\n🎉 Todo al día."}`;
    }
    const ex = await explicarMejor(id, m[3]);
    return `🔁 <b>${escHtml(leccion(id)!.titulo)}</b>, de otra forma:\n\n${escHtml(ex.explicacion)}\n\n🏠 <b>Ejemplo:</b> ${escHtml(ex.ejemplo)}\n🛠 <b>En tus apps:</b> ${escHtml(ex.enTusApps)}\n\n❔ ${escHtml(ex.pregunta)}\n\n✅ <code>/estudio ok ${id}</code> · ❓ <code>/estudio no ${id} …</code>`;
  }
  if (/^(lista|temario|indice|índice)$/i.test(t)) {
    const ico = { entendida: "✅", repasar: "🔁", nueva: "▫️" } as const;
    return [`📚 <b>Temario</b> · ${cuenta.entendidas}/${cuenta.total} entendidas · ${cuenta.repasar} por repasar`, ...lecciones.map((l) => `${ico[l.progreso.estado]} <code>/estudio ${l.id}</code> ${escHtml(l.titulo)}`)].join("\n");
  }
  const busca = t.toLowerCase();
  const l = busca ? lecciones.find((x) => x.id === busca) || lecciones.find((x) => x.titulo.toLowerCase().includes(busca)) : lecciones.find((x) => x.id === sig);
  if (!l) return busca ? `No encuentro «${escHtml(t)}». Escribe <code>/estudio lista</code>.` : `🎉 Todo al día: ${cuenta.entendidas}/${cuenta.total} entendidas. Repasa cuando quieras con <code>/estudio lista</code> o mira <code>/novedades</code>.`;
  return tarjetaHtml(l, l.progreso);
}
