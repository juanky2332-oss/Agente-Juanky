import "server-only";
import { n8n, ErrorN8n, escHtml } from "./n8n";
import { leerTabla, aObjeto, anadirFila, modificarPorId, escribirCelda, filaPorId, type Tabla } from "./sheets";
import { hoyISO } from "./parse";
import { TEMARIO, leccion, type Leccion } from "./estudioTemario";
import { MATERIAS, materia, materiaDe, type IdMateria, type Materia } from "./estudioMaterias";

// Bloque Estudio: materias (técnica, compras, inglés, refranes), progreso («lo entiendo / no»), explicación más
// sencilla con ejemplos, resumen de lo visto, corrector de inglés y novedades de IA. Todo a petición (nada diario).
// Sin repaso espaciado (lo pidió el 28-10-2026): lo entendido no vuelve a salir; queda en «Lo visto».
// Progreso en la pestaña «Estudio» (se crea sola la primera vez). Fila «_NOVEDADES» = caché del resumen.

const HOJA = "Estudio";
const CAB = ["ID", "TITULO", "ESTADO", "VECES", "ULTIMA", "EXPLICACION", "DUDA"];
const APP = "https://agente-juanky.vercel.app/estudio";

export type EstadoLeccion = "nueva" | "entendida" | "repasar";
export interface Explicacion { explicacion: string; ejemplo: string; enTusApps: string; pregunta: string; fecha: string }
export interface Progreso { id: string; estado: EstadoLeccion; veces: number; ultima: string; explicacion: Explicacion | null; duda: string }
export interface Noticia { titulo: string; resumen: string; importa: string; termino: string; enlace: string; fuente: string }
export interface Novedades { fecha: string; noticias: Noticia[] }
export interface Correccion { correcta: string; natural: string; errores: { mal: string; bien: string; porque: string }[]; nota: string }

// Lecciones creadas con «Ampliar» (búsqueda web + IA): una fila por lección, la lección entera en JSON.
const HOJA_EXTRA = "Estudio extra";
const CAB_EXTRA = ["ID", "MATERIA", "FECHA", "PETICION", "LECCION"];

/** Lee una pestaña y, si aún no existe, la crea con su cabecera. */
async function tablaCreando(hoja: string, cab: string[]): Promise<Tabla> {
  try {
    return await leerTabla(hoja);
  } catch (e) {
    if (!/Unable to parse range|no encontr|not found/i.test(String((e as Error).message))) throw e;
    await n8n({ op: "sheets", method: "POST", path: ":batchUpdate", body: { requests: [{ addSheet: { properties: { title: hoja, gridProperties: { rowCount: 200, columnCount: cab.length } } } }] } });
    await n8n({ op: "sheets", method: "PUT", path: `/values/${encodeURIComponent(`'${hoja}'!A1:${String.fromCharCode(64 + cab.length)}1`)}?valueInputOption=RAW`, body: { values: [cab] } });
    return leerTabla(hoja);
  }
}
const tabla = () => tablaCreando(HOJA, CAB);

/** Las materias con sus lecciones fijas + las creadas con «Ampliar» (al final, con sus temas nuevos). */
async function materiasCompletas(): Promise<Materia[]> {
  const t = await tablaCreando(HOJA_EXTRA, CAB_EXTRA);
  const extra = new Map<string, Leccion[]>();
  for (const f of t.filas) {
    const o = aObjeto(t, f.celdas);
    const l = jsonSeguro<Leccion>(o.LECCION);
    if (!o.ID || !l?.titulo || !MATERIAS.some((m) => m.id === o.MATERIA)) continue;
    extra.set(o.MATERIA, [...(extra.get(o.MATERIA) || []), { ...l, id: o.ID, flujo: l.flujo || [], relacionadas: l.relacionadas || [] }]);
  }
  return MATERIAS.map((m) => {
    const mas = extra.get(m.id) || [];
    return mas.length ? { ...m, lecciones: [...m.lecciones, ...mas], temas: [...m.temas, ...[...new Set(mas.map((l) => l.tema))].filter((x) => !m.temas.includes(x))] } : m;
  });
}

function buscarEn(ms: Materia[], id: string) {
  for (const m of ms) {
    const l = m.lecciones.find((x) => x.id === id);
    if (l) return { l, m };
  }
  return null;
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

/** Siguiente lección de una materia: primero lo marcado «no lo entiendo», luego lo nuevo en orden. Lo entendido ya no vuelve. */
export function siguiente(prog: Map<string, Progreso>, lista: Leccion[] = TEMARIO): Leccion | null {
  const p = (l: Leccion) => prog.get(l.id) || vacio(l.id);
  const repasar = lista.filter((l) => p(l).estado === "repasar").sort((a, b) => p(a).ultima.localeCompare(p(b).ultima));
  return repasar[0] || lista.find((l) => p(l).estado === "nueva") || null;
}

export async function cargarEstudio(idMateria?: string) {
  const [ms, t] = await Promise.all([materiasCompletas(), tabla()]);
  const m = ms.find((x) => x.id === materia(idMateria).id)!;
  const prog = progresoDe(t);
  const lista = m.lecciones.map((l) => ({ ...l, progreso: prog.get(l.id) || vacio(l.id) }));
  const cuenta = { entendidas: lista.filter((l) => l.progreso.estado === "entendida").length, repasar: lista.filter((l) => l.progreso.estado === "repasar").length, total: lista.length };
  // Cuánto lleva en cada materia, para las pestañas de arriba
  const materias = ms.map((x) => ({ id: x.id, nombre: x.nombre, emoji: x.emoji, vistas: x.lecciones.filter((l) => prog.get(l.id)?.estado === "entendida").length, total: x.lecciones.length }));
  return { materia: m.id, temas: m.temas, lecciones: lista, cuenta, siguiente: siguiente(prog, m.lecciones)?.id || null, materias };
}

async function guardar(id: string, titulo: string, cambios: Record<string, unknown>) {
  const t = await tabla();
  if (filaPorId(t, id)) return modificarPorId(HOJA, id, cambios);
  return anadirFila(HOJA, { ID: id, TITULO: titulo, ESTADO: "nueva", VECES: 0, ...cambios }, t.cabecera);
}

export async function marcar(id: string, entendida: boolean) {
  const x = buscarEn(await materiasCompletas(), id);
  if (!x) throw new ErrorN8n(`No hay ninguna lección «${id}»`, 404);
  const prog = progresoDe(await tabla()).get(id) || vacio(id);
  // Entendida = vista para siempre (sin repaso); no entendida = sale la primera la próxima vez.
  await guardar(id, x.l.titulo, { ESTADO: entendida ? "entendida" : "repasar", VECES: entendida ? prog.veces + 1 : prog.veces, ULTIMA: hoyISO() });
  return { id, estado: entendida ? "entendida" : "repasar" };
}

/** «No lo entiendo»: otra explicación más sencilla, con ejemplo cotidiano y otro de su trabajo o sus apps. Se guarda. */
export async function explicarMejor(id: string, duda = "") {
  const x = buscarEn(await materiasCompletas(), id);
  if (!x) throw new ErrorN8n(`No hay ninguna lección «${id}»`, 404);
  const { l, m } = x;
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
            content: `Eres el profesor particular de Juanky (materia: ${m.nombre}). ${m.profesor} Explica en español de España, como a un amigo listo, frases cortas, cero jerga sin explicar.
Devuelve SOLO JSON: {"explicacion": "3-5 frases, más sencilla que la anterior y desde otro ángulo", "ejemplo": "un ejemplo de la vida diaria o del trabajo en 2-3 frases", "enTusApps": "${m.et.enTusApps.toLowerCase()}, en 1-2 frases", "pregunta": "una pregunta corta para que compruebe si lo ha entendido"}.
No nombres empresas cliente. No inventes datos, cifras ni normas.`,
          },
          {
            role: "user",
            content: `Lección: ${l.titulo}\n${m.et.frase}: ${l.frase}\nExplicación que ya leyó: ${l.explicacion}\n${m.et.analogia}: ${l.analogia}\n${m.et.enTusApps}: ${l.enTusApps}${prev?.explicacion ? `\nOtra explicación que tampoco le sirvió: ${prev.explicacion.explicacion}` : ""}\nLo que no entiende: ${duda.trim() || "(no lo ha dicho: no lo entiende en general)"}`,
          },
        ],
      },
    },
    90000,
  );
  const d = jsonSeguro<Partial<Explicacion>>(r.choices?.[0]?.message?.content || "");
  if (!d?.explicacion) throw new ErrorN8n("La IA no devolvió una explicación. Prueba otra vez.", 502);
  const ex: Explicacion = { explicacion: String(d.explicacion), ejemplo: String(d.ejemplo || ""), enTusApps: String(d.enTusApps || ""), pregunta: String(d.pregunta || ""), fecha: hoyISO() };
  await guardar(id, l.titulo, { ESTADO: "repasar", ULTIMA: hoyISO(), EXPLICACION: JSON.stringify(ex), DUDA: duda.slice(0, 500) });
  return ex;
}

/** Resumen de lo visto en una materia: lo esencial de cada lección entendida, en el orden del temario. */
export async function resumen(idMateria?: string) {
  const m = (await materiasCompletas()).find((x) => x.id === materia(idMateria).id)!;
  const prog = progresoDe(await tabla());
  return {
    materia: m.id,
    lecciones: m.lecciones
      .filter((l) => prog.get(l.id)?.estado === "entendida")
      .map((l) => ({ id: l.id, tema: l.tema, titulo: l.titulo, frase: l.frase, clave: l.paraCliente, ultima: prog.get(l.id)?.ultima || "" })),
  };
}

// ───────── Ampliar: lecciones nuevas investigadas en internet ─────────
// Paso 1: gpt-5-search-api busca en fuentes fiables y devuelve notas con enlaces.
// Paso 2: gpt-5.4-mini monta las lecciones con el formato de la materia usando SOLO esas notas.
// Los enlaces se quedan solo si aparecen en las notas de la búsqueda (la IA no puede inventarse fuentes).
const PISTAS: Record<IdMateria, string> = {
  tecnica: "IA aplicada, desarrollo de software con IA, agentes, RAG, bases de datos, seguridad. Fuentes: documentación oficial (OpenAI, Anthropic, Google), blogs técnicos reconocidos.",
  compras: "Compras industriales y gestión de proveedores en España: negociación, contratos, logística, normativa. Fuentes: CIPS, ISM, Harvard (PON), escuelas de negocio, BOE para normas españolas.",
  ingles: "Inglés práctico de negocios para compras: frases hechas, vocabulario y gramática con ejemplos reales (correos, llamadas, reuniones, negociación). NADA de consejos de cómo estudiar. Fuentes: British Council, Cambridge Dictionary, BBC Learning English, Oxford Learner's Dictionaries.",
  refranes: "Refranes españoles reales y su significado; si piden de Murcia, refranes y dichos recogidos en la Región de Murcia (huerta, Campo de Cartagena, Lorca, Noroeste). Fuentes: Refranero multilingüe del Centro Virtual Cervantes, regmurcia.com, revista Cangilón, Universidad de Murcia, prensa regional.",
};

export async function ampliar(idMateria: string, peticion: string) {
  const ms = await materiasCompletas();
  const m = ms.find((x) => x.id === materia(idMateria).id)!;
  const pide = peticion.trim().slice(0, 300) || (m.id === "refranes" ? "más refranes útiles para compras y el trabajo" : "un nivel más avanzado que lo que ya tengo");
  const yaTiene = m.lecciones.map((l) => l.titulo).join(" | ");

  const busqueda = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5-search-api",
        web_search_options: { search_context_size: "high" },
        messages: [
          {
            role: "user",
            content: `Investiga en internet para preparar lecciones de estudio en español (materia: ${m.nombre}). Lo que pide el alumno: «${pide}».
Contexto del alumno: ${m.profesor}
Ámbito y fuentes preferidas: ${PISTAS[m.id]}
Ya tiene estas lecciones (no repitas sus temas): ${yaTiene}
Devuelve notas detalladas para 4 lecciones nuevas, cada una con los datos concretos que encuentres y la URL exacta de cada fuente. Solo información que esté en las fuentes; si algo no lo encuentras, no lo pongas.`,
          },
        ],
      },
    },
    100000,
  );
  const notas = busqueda.choices?.[0]?.message?.content || "";
  if (notas.length < 200) throw new ErrorN8n("La búsqueda no ha encontrado suficiente información. Prueba a pedirlo de otra forma.", 502);
  const urlsNotas = new Set((notas.match(/https?:\/\/[^\s)\]»"<>]+/g) || []).map((u) => u.replace(/[.,;]+$/, "").replace(/[?&]utm_source=openai$/, "")));

  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Preparas lecciones de estudio para Juanky (materia: ${m.nombre}). ${m.profesor}
Escribe en español de España, claro y útil, que merezca la pena leerlo: nada de relleno ni frases genéricas. Usa SOLO la información de las notas de investigación.
Cada lección tiene estos campos (lo que significa cada uno en esta materia va entre paréntesis):
- "titulo" (${m.id === "refranes" ? "el refrán literal" : "título corto"})
- "frase" (${m.et.frase}, una línea)
- "explicacion" (${m.et.explicacion}, 3-5 frases con datos concretos)
- "analogia" (${m.et.analogia}${m.id === "ingles" ? ": el error típico de un hispanohablante y cómo se dice bien" : ""})
- "enTusApps" (${m.et.enTusApps})
- "paraCliente" (${m.et.paraCliente}${m.id === "ingles" ? "; frases en inglés con su traducción, una por línea con \\n" : ""})
- "flujo" (${m.et.flujo}: 3-5 pasos cortos)
- "fuentes" (las URL de las notas de donde sale)
Devuelve SOLO JSON {"tema": "nombre corto para agrupar estas lecciones (p. ej. «Nivel avanzado» o «Refranes de Murcia»)", "lecciones": [3 o 4 lecciones]}.
No repitas lo que ya tiene: ${yaTiene}`,
          },
          { role: "user", content: `Petición: ${pide}\n\nNotas de investigación:\n${notas}` },
        ],
      },
    },
    70000,
  );
  const d = jsonSeguro<{ tema?: string; lecciones?: Partial<Leccion>[] }>(r.choices?.[0]?.message?.content || "");
  const tema = String(d?.tema || "Ampliación").slice(0, 40);
  const base = `x-${m.id.slice(0, 3)}-${Date.now().toString(36)}`;
  const nuevas: Leccion[] = (d?.lecciones || [])
    .filter((l) => l?.titulo && l.frase && l.explicacion && !m.lecciones.some((x) => x.titulo.toLowerCase() === String(l.titulo).toLowerCase()))
    .slice(0, 4)
    .map((l, i) => ({
      id: `${base}-${i + 1}`,
      tema,
      titulo: String(l.titulo).slice(0, 120),
      frase: String(l.frase),
      explicacion: String(l.explicacion),
      analogia: String(l.analogia || ""),
      enTusApps: String(l.enTusApps || ""),
      paraCliente: String(l.paraCliente || ""),
      flujo: (Array.isArray(l.flujo) ? l.flujo : []).map(String).slice(0, 6),
      relacionadas: [],
      fuentes: (Array.isArray(l.fuentes) ? l.fuentes : []).map((u) => String(u).replace(/[?&]utm_source=openai$/, "")).filter((u) => urlsNotas.has(u)).slice(0, 4),
    }));
  if (!nuevas.length) throw new ErrorN8n("La IA no ha preparado lecciones nuevas. Prueba otra vez o pídelo de otra forma.", 502);
  const t = await tablaCreando(HOJA_EXTRA, CAB_EXTRA);
  for (const l of nuevas) await anadirFila(HOJA_EXTRA, { ID: l.id, MATERIA: m.id, FECHA: hoyISO(), PETICION: pide, LECCION: JSON.stringify(l) }, t.cabecera);
  return { materia: m.id, tema, lecciones: nuevas };
}

// ───────── Practicar inglés: ejercicios que la IA pone y corrige ─────────
// El ejercicio en curso y el marcador se guardan en la fila «_PRACTICA» de la pestaña Estudio (columna EXPLICACION),
// así sirve igual desde la app que desde Telegram (/ingles practica → /ingles r tu respuesta).
export interface Ejercicio { tipo: "traducir" | "completar" | "responder" | "corregir"; tema: string; enunciado: string; texto: string; pista: string; solucion: string; fecha: string }
export interface Marcador { hechos: number; bien: number; recientes: string[] }
export interface Correccion2 { bien: boolean; nota: number; tuya: string; corregida: string; natural: string; explicacion: string; errores: { mal: string; bien: string; porque: string }[] }
interface Practica { actual: Ejercicio | null; marcador: Marcador }
const TIPOS: Ejercicio["tipo"][] = ["traducir", "traducir", "completar", "responder", "corregir"];

async function leerPractica(): Promise<Practica> {
  const t = await tabla();
  const f = filaPorId(t, "_PRACTICA");
  const p = f ? jsonSeguro<Practica>(aObjeto(t, f.celdas).EXPLICACION) : null;
  return { actual: p?.actual || null, marcador: { hechos: p?.marcador?.hechos || 0, bien: p?.marcador?.bien || 0, recientes: p?.marcador?.recientes || [] } };
}
const guardarPractica = (p: Practica) => guardar("_PRACTICA", "Práctica de inglés (no tocar)", { EXPLICACION: JSON.stringify(p) });

/** Ejercicio nuevo. «tema» = id de una lección de inglés, un tema libre («llamadas») o vacío (variado). */
export async function nuevoEjercicio(tema = "", tipo = ""): Promise<{ ejercicio: Omit<Ejercicio, "solucion">; marcador: Marcador }> {
  const ms = await materiasCompletas();
  const ing = ms.find((m) => m.id === "ingles")!;
  const l = ing.lecciones.find((x) => x.id === tema.trim());
  const sobre = l
    ? `la lección «${l.titulo}»: ${l.frase} ${l.explicacion} Frases: ${l.paraCliente}`
    : tema.trim() || `cualquiera de estos temas, variando: ${ing.lecciones.map((x) => x.titulo).join("; ")}`;
  const p = await leerPractica();
  const t = (TIPOS as string[]).includes(tipo) ? (tipo as Ejercicio["tipo"]) : TIPOS[(p.marcador.hechos + Math.floor(Math.random() * 3)) % TIPOS.length];
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Pones ejercicios de inglés a un español que trabaja en compras industriales (nivel básico-intermedio, sube poco a poco: lleva ${p.marcador.hechos} ejercicios y ${p.marcador.bien} bien). Situaciones reales de su trabajo: proveedores, pedidos, ofertas, plazos, facturas, llamadas, reuniones.
Tipo de ejercicio: ${t}.
- traducir: «texto» = 1-2 frases en ESPAÑOL para que las pase al inglés.
- completar: «texto» = frase en inglés con un hueco «___» (una palabra o dos); en el enunciado di qué falta (p. ej. «la preposición de tiempo»).
- responder: «texto» = correo corto (2-4 frases) de un proveedor EN INGLÉS; él contesta en inglés lo que se le pida en el enunciado.
- corregir: «texto» = frase en inglés con 1-2 errores típicos de hispanohablante; él la escribe bien.
Devuelve SOLO JSON {"enunciado": "qué tiene que hacer, en español, una línea", "texto": "...", "pista": "una ayuda corta en español", "solucion": "la respuesta correcta en inglés", "tema": "tema en 2-4 palabras"}.
No repitas estos ejercicios recientes: ${p.marcador.recientes.join(" | ") || "(ninguno)"}`,
          },
          { role: "user", content: `Ejercicio sobre ${sobre}` },
        ],
      },
    },
    60000,
  );
  const d = jsonSeguro<Partial<Ejercicio>>(r.choices?.[0]?.message?.content || "");
  if (!d?.texto || !d.solucion) throw new ErrorN8n("La IA no ha preparado el ejercicio. Prueba otra vez.", 502);
  const ej: Ejercicio = { tipo: t, tema: String(d.tema || l?.titulo || "Variado"), enunciado: String(d.enunciado || ""), texto: String(d.texto), pista: String(d.pista || ""), solucion: String(d.solucion), fecha: hoyISO() };
  p.actual = ej;
  p.marcador.recientes = [...p.marcador.recientes, ej.texto.slice(0, 80)].slice(-12);
  await guardarPractica(p);
  const { solucion: _s, ...sinSolucion } = ej;
  void _s;
  return { ejercicio: sinSolucion, marcador: p.marcador };
}

/** Corrige su respuesta al ejercicio en curso, explica los fallos y suma al marcador. */
export async function responderEjercicio(respuesta: string): Promise<{ correccion: Correccion2; ejercicio: Ejercicio; marcador: Marcador }> {
  const tuya = respuesta.trim().slice(0, 1500);
  if (!tuya) throw new ErrorN8n("Escribe tu respuesta.", 400);
  const p = await leerPractica();
  if (!p.actual) throw new ErrorN8n("No hay ningún ejercicio en curso. Pide uno nuevo.", 400);
  const ej = p.actual;
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Corriges ejercicios de inglés de un español que trabaja en compras (nivel básico-intermedio). Sé justo: si su respuesta es correcta aunque no coincida con la solución propuesta, está bien. Usa nombres gramaticales correctos y explica en español, corto y claro.
Devuelve SOLO JSON {"bien": true|false, "nota": 0-10, "corregida": "su respuesta corregida cambiando lo mínimo", "natural": "cómo lo diría un nativo en el trabajo", "explicacion": "1-2 frases en español: qué ha hecho bien y qué debe recordar", "errores": [{"mal": "...", "bien": "...", "porque": "..."}]}.`,
          },
          { role: "user", content: `Ejercicio (${ej.tipo}): ${ej.enunciado}\nTexto: ${ej.texto}\nSolución propuesta: ${ej.solucion}\nSu respuesta: ${tuya}` },
        ],
      },
    },
    60000,
  );
  const d = jsonSeguro<Partial<Correccion2>>(r.choices?.[0]?.message?.content || "");
  if (!d || typeof d.bien !== "boolean") throw new ErrorN8n("La IA no ha devuelto la corrección. Prueba otra vez.", 502);
  const c: Correccion2 = {
    bien: d.bien,
    nota: Math.max(0, Math.min(10, Number(d.nota) || 0)),
    tuya,
    corregida: String(d.corregida || tuya),
    natural: String(d.natural || ""),
    explicacion: String(d.explicacion || ""),
    errores: (Array.isArray(d.errores) ? d.errores : []).slice(0, 8).map((e) => ({ mal: String(e?.mal || ""), bien: String(e?.bien || ""), porque: String(e?.porque || "") })),
  };
  p.marcador.hechos += 1;
  if (c.bien) p.marcador.bien += 1;
  p.actual = null;
  await guardarPractica(p);
  return { correccion: c, ejercicio: ej, marcador: p.marcador };
}

/** Corrector de inglés: corrige una frase suya, explica los fallos en español y propone una versión natural. No se guarda. */
export async function corregirIngles(texto: string): Promise<Correccion> {
  const t = texto.trim().slice(0, 1500);
  if (!t) throw new ErrorN8n("Escribe la frase en inglés que quieres corregir.", 400);
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Eres profesor de inglés de un español que trabaja en compras industriales (nivel básico-intermedio). Corrige lo que escribe.
Devuelve SOLO JSON: {"correcta": "su texto corregido, cambiando lo mínimo", "natural": "cómo lo diría un nativo en un correo de trabajo", "errores": [{"mal": "trozo con error", "bien": "corregido", "porque": "explicación corta en español"}], "nota": "un ánimo o consejo de una frase, en español"}.
Usa los nombres gramaticales correctos (el «to» de «want to know» es la partícula del infinitivo, no una preposición) y no marques como error lo que también es correcto. Si no hay errores, "errores" vacío y dilo en "nota". Si escribe en español, tradúcelo en "correcta" y "natural" y explícalo en "nota".`,
          },
          { role: "user", content: t },
        ],
      },
    },
    60000,
  );
  const d = jsonSeguro<Partial<Correccion>>(r.choices?.[0]?.message?.content || "");
  if (!d?.correcta) throw new ErrorN8n("La IA no devolvió la corrección. Prueba otra vez.", 502);
  return {
    correcta: String(d.correcta),
    natural: String(d.natural || ""),
    errores: (Array.isArray(d.errores) ? d.errores : []).slice(0, 10).map((e) => ({ mal: String(e?.mal || ""), bien: String(e?.bien || ""), porque: String(e?.porque || "") })),
    nota: String(d.nota || ""),
  };
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
const dominio = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 40);
  }
};

export function tarjetaHtml(l: Leccion, p?: Progreso, m: Materia = materiaDe(l.id)) {
  const ex = p?.explicacion;
  return [
    `${m.emoji} <b>${escHtml(l.titulo)}</b>  <i>(${escHtml(l.tema)})</i>`,
    `\n<b>${escHtml(m.et.frase)}:</b> ${escHtml(l.frase)}`,
    `\n${escHtml(l.explicacion)}`,
    `\n🧩 <b>${escHtml(m.et.analogia)}:</b> ${escHtml(l.analogia)}`,
    `🛠 <b>${escHtml(m.et.enTusApps)}:</b> ${escHtml(l.enTusApps)}`,
    `💬 <b>${escHtml(m.et.paraCliente)}:</b> ${escHtml(l.paraCliente)}`,
    `\n➡️ ${l.flujo.map(escHtml).join(" → ")}`,
    l.fuentes?.length ? `📎 Fuentes: ${l.fuentes.map((u) => `<a href="${escHtml(u)}">${escHtml(dominio(u))}</a>`).join(" · ")}` : "",
    ex ? `\n🔁 <b>Tu explicación sencilla:</b> ${escHtml(ex.explicacion)}\n<b>Ejemplo:</b> ${escHtml(ex.ejemplo)}` : "",
    m.id === "ingles" ? `\n🎯 Practícalo: <code>/ingles practica ${l.id}</code>` : "",
    `\n✅ <code>/${m.comando} ok ${l.id}</code> · ❓ <code>/${m.comando} no ${l.id} lo que no entiendes</code>`,
    `📊 Gráfico y progreso: ${APP}?m=${m.id}&l=${l.id}`,
  ].filter(Boolean).join("\n");
}

/** Une líneas sin pasar del límite de Telegram (4096) y sin cortar ninguna a medias (rompería el HTML). */
function cortar(lineas: string[], pie = "") {
  let s = "";
  for (const l of lineas) {
    if (s.length + l.length + pie.length + 40 > 4000) return `${s}\n…${pie}`;
    s += (s ? "\n" : "") + l;
  }
  return s + pie;
}

const COMANDOS: Record<string, IdMateria> = {
  estudio: "tecnica", estudiar: "tecnica", aprender: "tecnica", tecnica: "tecnica", "técnica": "tecnica", ia: "tecnica",
  compras: "compras", compra: "compras",
  ingles: "ingles", "inglés": "ingles", english: "ingles",
  refranes: "refranes", refran: "refranes", "refrán": "refranes",
};

/** Comandos de Telegram: /estudio /compras /ingles /refranes [tema|ok id|no id duda|lista|visto], /ingles corrige …, /novedades [ya]. */
export async function deTexto(texto: string): Promise<string> {
  const entrada = texto.trim();
  if (/^\/?(novedades|noticias)\b/i.test(entrada)) {
    const n = await novedades(/\b(ya|nuevas|forzar)\b/i.test(entrada));
    return [`🗞 <b>Novedades de IA</b> (${n.fecha})`, ...n.noticias.map((x, i) => `\n<b>${i + 1}. ${escHtml(x.titulo)}</b>\n${escHtml(x.resumen)}\n👉 <i>${escHtml(x.importa)}</i>${x.termino ? ` · <code>/estudio ${x.termino}</code>` : ""}\n<a href="${escHtml(x.enlace)}">${escHtml(x.fuente)}</a>`), `\n${APP}?vista=novedades`].join("\n");
  }
  const cm = entrada.match(/^\/([a-záéíóúñ]+)(?:@\S+)?\s*([\s\S]*)$/i);
  let m = materia(COMANDOS[(cm?.[1] || "").toLowerCase()] || "tecnica");
  let t = (cm ? cm[2] : entrada).trim();
  // «/estudio compras …» también vale
  const sub = t.match(/^(\S+)\s*([\s\S]*)$/);
  const otra = sub ? COMANDOS[sub[1].toLowerCase()] : undefined;
  if (m.id === "tecnica" && otra && otra !== "tecnica") {
    m = materia(otra);
    t = sub![2].trim();
  }

  if (m.id === "ingles") {
    // /ingles practica [tema o id de lección] → ejercicio · /ingles r tu respuesta → corrección
    const pr = t.match(/^(practica|practicar|ejercicio|ej)\b\s*([\s\S]*)$/i);
    if (pr) {
      const { ejercicio: e, marcador: mk } = await nuevoEjercicio(pr[2]);
      return [
        `🎯 <b>Ejercicio</b> · <i>${escHtml(e.tema)}</i>${mk.hechos ? ` · llevas ${mk.bien}/${mk.hechos} bien` : ""}`,
        `\n${escHtml(e.enunciado)}`,
        `\n<b>${escHtml(e.texto)}</b>`,
        e.pista ? `\n💡 Pista: <tg-spoiler>${escHtml(e.pista)}</tg-spoiler>` : "",
        `\nResponde así: <code>/ingles r tu respuesta</code>`,
      ].filter(Boolean).join("\n");
    }
    const rs = t.match(/^(r|resp|respuesta)\s+([\s\S]+)$/i);
    if (rs) {
      const { correccion: c, ejercicio: e, marcador: mk } = await responderEjercicio(rs[2]);
      return [
        `${c.bien ? "✅ <b>¡Bien!</b>" : "❌ <b>Casi</b>"} · ${c.nota}/10 · llevas ${mk.bien}/${mk.hechos} bien`,
        !c.bien || c.corregida !== c.tuya ? `\n✍️ <b>Corregida:</b> ${escHtml(c.corregida)}` : "",
        c.natural ? `🗣 <b>Natural:</b> ${escHtml(c.natural)}` : "",
        c.errores.length ? `\n${c.errores.map((x) => `• <s>${escHtml(x.mal)}</s> → <b>${escHtml(x.bien)}</b>: ${escHtml(x.porque)}`).join("\n")}` : "",
        c.explicacion ? `\n💡 ${escHtml(c.explicacion)}` : "",
        `\n<i>Solución propuesta: ${escHtml(e.solucion)}</i>`,
        `\nOtro: <code>/ingles practica</code>`,
      ].filter(Boolean).join("\n");
    }
    const c = t.match(/^(corrige|corregir|corrígeme|corrigeme|check)\s+([\s\S]+)$/i);
    if (c) {
      const r = await corregirIngles(c[2]);
      return [
        `✍️ <b>Tu frase corregida</b>\n${escHtml(r.correcta)}`,
        r.natural ? `\n🗣 <b>Más natural:</b> ${escHtml(r.natural)}` : "",
        r.errores.length ? `\n<b>Fallos:</b>\n${r.errores.map((e) => `• <s>${escHtml(e.mal)}</s> → <b>${escHtml(e.bien)}</b>: ${escHtml(e.porque)}`).join("\n")}` : "",
        r.nota ? `\n💡 ${escHtml(r.nota)}` : "",
      ].filter(Boolean).join("\n");
    }
  }

  if (/^(visto|lo visto|resumen)$/i.test(t)) {
    const r = await resumen(m.id);
    if (!r.lecciones.length) return `${m.emoji} Aún no has marcado nada como entendido en <b>${escHtml(m.nombre)}</b>. Empieza con <code>/${m.comando}</code>.`;
    return cortar([`${m.emoji} <b>Lo visto en ${escHtml(m.nombre)}</b> (${r.lecciones.length})`, ...r.lecciones.map((l) => `\n<b>${escHtml(l.titulo)}</b>\n${escHtml(l.frase)}`)], `\n\nCompleto en ${APP}?m=${m.id}&vista=visto`);
  }

  // «/ingles más algo más difícil», «/refranes más de Murcia», «/compras amplia contratos marco»
  const mas = t.match(/^(m[aá]s|amplia|ampliar|añade|nuevas?)\b\s*([\s\S]*)$/i);
  if (mas) {
    const r = await ampliar(m.id, mas[2]);
    return cortar([
      `${m.emoji} <b>${r.lecciones.length} lecciones nuevas de ${escHtml(m.nombre)}</b> · <i>${escHtml(r.tema)}</i> (buscadas en internet)`,
      ...r.lecciones.map((l) => `\n<b>${escHtml(l.titulo)}</b>\n${escHtml(l.frase)}\n👉 <code>/${m.comando} ${l.id}</code>`),
      `\n${APP}?m=${m.id}`,
    ]);
  }

  const { lecciones, cuenta, siguiente: sig } = await cargarEstudio(m.id);
  const ok = t.match(/^(ok|si|sí|vale|entendido|no)\s+(\S+)\s*([\s\S]*)$/i);
  if (ok) {
    const id = ok[2].toLowerCase();
    const ms = await materiasCompletas();
    const x = buscarEn(ms, id);
    if (!x) return `No conozco la lección «${escHtml(id)}». Escribe <code>/${m.comando} lista</code>.`;
    const mm = x.m;
    if (ok[1].toLowerCase() !== "no") {
      await marcar(id, true);
      const prog = mm.id === m.id ? lecciones.map((l) => [l.id, l.id === id ? { ...l.progreso, estado: "entendida" as const } : l.progreso] as const) : (await cargarEstudio(mm.id)).lecciones.map((l) => [l.id, l.progreso] as const);
      const despues = siguiente(new Map(prog), mm.lecciones);
      return `✅ Apuntado: <b>${escHtml(x.l.titulo)}</b> queda en lo visto (<code>/${mm.comando} visto</code>).${despues ? `\nSiguiente: <code>/${mm.comando} ${despues.id}</code> (${escHtml(despues.titulo)})` : `\n🎉 Has terminado esta materia. ¿Más? <code>/${mm.comando} más lo que quieras</code>`}`;
    }
    const ex = await explicarMejor(id, ok[3]);
    return `🔁 <b>${escHtml(x.l.titulo)}</b>, de otra forma:\n\n${escHtml(ex.explicacion)}\n\n🏠 <b>Ejemplo:</b> ${escHtml(ex.ejemplo)}\n🛠 <b>${escHtml(mm.et.enTusApps)}:</b> ${escHtml(ex.enTusApps)}\n\n❔ ${escHtml(ex.pregunta)}\n\n✅ <code>/${mm.comando} ok ${id}</code> · ❓ <code>/${mm.comando} no ${id} …</code>`;
  }
  if (/^(lista|temario|indice|índice)$/i.test(t)) {
    const ico = { entendida: "✅", repasar: "🔁", nueva: "▫️" } as const;
    return cortar([`${m.emoji} <b>${escHtml(m.nombre)}</b> · ${cuenta.entendidas}/${cuenta.total} vistas${cuenta.repasar ? ` · ${cuenta.repasar} sin entender` : ""}`, ...lecciones.map((l) => `${ico[l.progreso.estado]} <code>/${m.comando} ${l.id}</code> ${escHtml(l.titulo)}`)], `\nCompleto: ${APP}?m=${m.id}&vista=temario`);
  }
  const busca = t.toLowerCase();
  const l = busca ? lecciones.find((x) => x.id === busca) || lecciones.find((x) => x.titulo.toLowerCase().includes(busca)) : lecciones.find((x) => x.id === sig);
  if (!l) return busca ? `No encuentro «${escHtml(t)}». Escribe <code>/${m.comando} lista</code>.` : `🎉 Has visto todo ${escHtml(m.nombre)}: ${cuenta.entendidas}/${cuenta.total}. Tienes el resumen con <code>/${m.comando} visto</code>.${m.id === "ingles" ? "\nY practica cuando quieras: <code>/ingles corrige tu frase</code>." : ""}`;
  return tarjetaHtml(l, l.progreso, m);
}
