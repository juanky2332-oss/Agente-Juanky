import "server-only";
// Ayudas, deducciones y trámites por el nacimiento (pestaña "Ayudas bebé").
// Los datos legales se verificaron en fuentes oficiales el 23/09/2026 (columna VERIFICADO).
// Nada de cifras de memoria: si algo no está en la hoja, se dice que hay que confirmarlo.
import { leerTabla, aObjeto, modificarPorId } from "./sheets";
import { n8n, ErrorN8n, escHtml } from "./n8n";
import { fechaISO, isoAEs, hoyISO, num, normaliza } from "./parse";

export const PERFIL = "Pareja empadronada en Murcia (municipio de Murcia, Región de Murcia). Padre 38 años, madre 32. Primer hijo (niño).";
export const ESTADOS_AYUDA = ["por pedir", "pedida", "concedida", "cobrando", "hecho", "comprobar", "vigilar", "opcional", "no aplica"] as const;

// Días desde el nacimiento para el plazo de cada trámite (cuando la hoja no trae FECHA_LIMITE).
const PLAZO_DIAS: Record<string, number> = { B13: 10, B01: 15, B12: 20, B04: 30, B16: 30, B03: 60, B10: 133 };

export interface Ayuda {
  fila: number;
  id: string;
  ambito: string;
  ayuda: string;
  tipo: string;
  quien: string;
  importe: string;
  eurosAnio: number;
  cuando: string;
  como: string;
  documentos: string;
  requisitos: string;
  estado: string;
  limite: string | null; // ISO
  fuente: string;
  verificado: string;
  notas: string;
}

export async function leerBebe() {
  const t = await leerTabla("Ayudas bebé");
  const filas = t.filas.map((f) => ({ fila: f.fila, o: aObjeto(t, f.celdas) }));
  const cfg = filas.find((x) => x.o.ID === "_CONFIG");
  const nacimiento = fechaISO(cfg?.o.IMPORTE) || null;
  const confirmado = !!cfg && !/sin confirmar/i.test(cfg.o.ESTADO || "");
  const ayudas: Ayuda[] = filas
    .filter((x) => x.o.ID && x.o.ID !== "_CONFIG")
    .map(({ fila, o }) => {
      const lim = fechaISO(o.FECHA_LIMITE) || (nacimiento && PLAZO_DIAS[o.ID] ? new Date(Date.parse(nacimiento) + PLAZO_DIAS[o.ID] * 86400000).toISOString().slice(0, 10) : null);
      return {
        fila, id: o.ID, ambito: o.AMBITO || "", ayuda: o.AYUDA || "", tipo: o.TIPO || "", quien: o.QUIEN || "", importe: o.IMPORTE || "",
        eurosAnio: num(o.EUROS_ANIO), cuando: o.CUANDO || "", como: o.COMO || "", documentos: o.DOCUMENTOS || "", requisitos: o.REQUISITOS || "",
        estado: normaliza(o.ESTADO) || "por pedir", limite: lim, fuente: o.FUENTE || "", verificado: o.VERIFICADO || "", notas: o.NOTAS || "",
      };
    });
  return { ayudas, nacimiento, confirmado };
}

export async function cambiarAyuda(id: string, c: { estado?: string; notas?: string }) {
  const o: Record<string, string> = {};
  if (c.estado !== undefined) {
    if (!ESTADOS_AYUDA.includes(normaliza(c.estado) as never)) throw new ErrorN8n("Estado no válido: " + ESTADOS_AYUDA.join(", "), 400);
    o.ESTADO = normaliza(c.estado);
  }
  if (c.notas !== undefined) o.NOTAS = c.notas;
  await modificarPorId("Ayudas bebé", id, o);
}

export async function fijarNacimiento(fecha: string) {
  const f = fechaISO(fecha);
  if (!f) throw new ErrorN8n("Fecha no válida", 400);
  if (f > hoyISO()) throw new ErrorN8n("Esa fecha es futura: pon la fecha real del nacimiento", 400);
  await modificarPorId("Ayudas bebé", "_CONFIG", { IMPORTE: isoAEs(f), ESTADO: "confirmada" });
}


export function textoBebe(d: Awaited<ReturnType<typeof leerBebe>>, hoy = hoyISO()) {
  const L = [`🍼 <b>Ayudas y trámites del bebé</b>`, d.nacimiento ? `Nacimiento: ${isoAEs(d.nacimiento)}${d.confirmado ? "" : " (sin confirmar: dime la fecha real con /bebe nacimiento dd/mm/aaaa)"}` : ""];
  const urg = d.ayudas.filter((a) => ["por pedir", "pedida"].includes(a.estado)).sort((a, b) => (a.limite || "9").localeCompare(b.limite || "9"));
  if (urg.length) {
    L.push("", "<b>Lo siguiente que toca</b>");
    for (const a of urg.slice(0, 8))
      L.push(`${a.limite && a.limite < hoy ? "🔴" : "▫️"} <code>${a.id}</code> ${escHtml(a.ayuda)}${a.limite ? ` — antes del ${isoAEs(a.limite)}` : ""}${a.estado === "pedida" ? " (pedida)" : ""}`);
  }
  const dinero = d.ayudas.filter((a) => a.eurosAnio > 0 && !["no aplica"].includes(a.estado));
  if (dinero.length) L.push("", `💶 Con lo que ya está cuantificado: unos <b>${dinero.reduce((s, a) => s + a.eurosAnio, 0).toLocaleString("es-ES")} € al año</b> (sin contar las 19 semanas de prestación, que son vuestro sueldo).`);
  const comp = d.ayudas.filter((a) => a.estado === "comprobar").length;
  if (comp) L.push(`🔎 ${comp} dependen de vuestra renta: hay que comprobarlas.`);
  L.push("", "Detalle: <code>/bebe B03</code> · marcar: <code>/bebe B03 pedida</code>");
  return L.filter((x) => x !== "").join("\n").replace(/\n(<b>|💶|🔎|Detalle)/g, "\n\n$1");
}

export function fichaAyuda(a: Ayuda) {
  return [
    `<code>${a.id}</code> <b>${escHtml(a.ayuda)}</b> · ${escHtml(a.ambito)}`,
    `💶 ${escHtml(a.importe)}`,
    `👤 ${escHtml(a.quien)} · estado: <b>${escHtml(a.estado)}</b>${a.limite ? ` · límite ${isoAEs(a.limite)}` : ""}`,
    a.cuando && `🕐 ${escHtml(a.cuando)}`,
    a.como && `👉 ${escHtml(a.como)}`,
    a.documentos && `📄 ${escHtml(a.documentos)}`,
    a.requisitos && `✅ Requisitos: ${escHtml(a.requisitos)}`,
    a.notas && `📝 ${escHtml(a.notas)}`,
    `<i>Fuente: ${escHtml(a.fuente)} (verificado ${escHtml(a.verificado)})</i>`,
  ].filter(Boolean).join("\n");
}

/** Pregunta libre: la IA solo puede usar lo que hay en la hoja (y lo dice si falta). */
export async function preguntarBebe(pregunta: string) {
  const d = await leerBebe();
  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "low",
        max_completion_tokens: 1200,
        messages: [
          {
            role: "system",
            content: `Eres el asesor de Juanky y su pareja para las ayudas, deducciones y trámites por el nacimiento de su hijo. ${PERFIL}
Respondes en español de España, claro y práctico (pasos concretos, dónde, qué papeles, plazos).
REGLA: usa SOLO la información del JSON de ayudas (verificada en fuentes oficiales). Si la pregunta no está cubierta, dilo y di dónde confirmarlo (Seguridad Social, Agencia Tributaria, sede.carm.es, murcia.es). Nunca inventes importes ni plazos.
Cita los IDs (B01...) de lo que uses. Formato HTML de Telegram (<b>, <i>), sin markdown. Máximo 1.200 caracteres.`,
          },
          { role: "user", content: JSON.stringify({ nacimiento: d.nacimiento, ayudas: d.ayudas.map((a) => ({ ...a, fila: undefined })) }).slice(0, 50000) + "\n\nPREGUNTA: " + pregunta },
        ],
      },
    },
    90000,
  );
  return r.choices?.[0]?.message?.content?.trim() || "No he podido responder ahora mismo. Repite la pregunta.";
}
