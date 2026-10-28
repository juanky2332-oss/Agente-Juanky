import { manejar } from "@/lib/ruta";
import { n8n, ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

interface Ev {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

interface Franja { inicio: string; fin?: string; todoElDia?: boolean }

const idValido = (id: string) => {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) throw new ErrorN8n("Id no válido", 400);
  return id;
};

/** start/end de Google a partir de lo que manda el formulario (todo el día = fin exclusivo al día siguiente). */
function franja(b: Franja) {
  if (b.todoElDia) {
    const f = b.inicio.slice(0, 10);
    const hasta = (b.fin || b.inicio).slice(0, 10);
    const siguiente = new Date(Date.parse(hasta + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    return { start: { date: f }, end: { date: siguiente } };
  }
  const ini = b.inicio.length === 16 ? b.inicio + ":00" : b.inicio;
  let fin = b.fin ? (b.fin.length === 16 ? b.fin + ":00" : b.fin) : "";
  if (!fin || fin <= ini) {
    const d = new Date(ini + "Z");
    d.setUTCHours(d.getUTCHours() + 1);
    fin = d.toISOString().slice(0, 19);
  }
  return { start: { dateTime: ini, timeZone: "Europe/Madrid" }, end: { dateTime: fin, timeZone: "Europe/Madrid" } };
}

/** Suma días a un start/end de Google conservando la hora y la zona (para «pasar adelante»). */
function mover(p: { date?: string; dateTime?: string; timeZone?: string }, dias: number) {
  if (p.date) return { date: new Date(Date.parse(p.date + "T00:00:00Z") + dias * 86400000).toISOString().slice(0, 10) };
  const m = String(p.dateTime).match(/^(\d{4}-\d{2}-\d{2})(T[\d:.]+)(.*)$/);
  if (!m) throw new ErrorN8n("Fecha del evento ilegible", 502);
  const dia = new Date(Date.parse(m[1] + "T00:00:00Z") + dias * 86400000).toISOString().slice(0, 10);
  // Se reescribe con la hora local y la zona de Madrid: así el cambio de hora (marzo/octubre) no lo descoloca.
  return m[3] && m[3] !== "Z" ? { dateTime: dia + m[2], timeZone: p.timeZone || "Europe/Madrid" } : { dateTime: dia + m[2] + m[3], timeZone: p.timeZone || "Europe/Madrid" };
}

export const GET = manejar(async (req: Request) => {
  const u = new URL(req.url);
  const desde = new Date(Date.now() - Number(u.searchParams.get("atras") || 7) * 86400000).toISOString();
  const hasta = new Date(Date.now() + Number(u.searchParams.get("adelante") || 60) * 86400000).toISOString();
  const d = await n8n<{ items: Ev[] }>({
    op: "calendar",
    method: "GET",
    path: `/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(desde)}&timeMax=${encodeURIComponent(hasta)}`,
  });
  return {
    eventos: (d.items || []).map((e) => ({
      id: e.id,
      titulo: e.summary || "(sin título)",
      descripcion: e.description || "",
      lugar: e.location || "",
      enlace: e.htmlLink || "",
      todoElDia: !!e.start.date,
      inicio: e.start.dateTime || e.start.date || "",
      fin: e.end.dateTime || e.end.date || "",
    })),
  };
});

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as Franja & { titulo: string; descripcion?: string; lugar?: string };
  if (!b.titulo || !b.inicio) throw new ErrorN8n("Falta título o inicio", 400);
  const e = await n8n<Ev>({ op: "calendar", method: "POST", path: "/events", body: { summary: b.titulo, description: b.descripcion || "", location: b.lugar || "", ...franja(b) } });
  if (!e.id) throw new ErrorN8n("Google no confirmó el evento", 502);
  return { ok: true, id: e.id };
});

/** Editar una cita (título, día, horas, lugar) o «pasarla adelante» N días conservando la hora. */
export const PATCH = manejar(async (req: Request) => {
  const b = (await req.json()) as Partial<Franja> & { id?: string; titulo?: string; descripcion?: string; lugar?: string; moverDias?: number };
  const id = idValido(String(b.id || ""));
  let cuerpo: Record<string, unknown>;
  if (b.moverDias) {
    const dias = Math.trunc(Number(b.moverDias));
    if (!dias || Math.abs(dias) > 366) throw new ErrorN8n("Días no válidos", 400);
    const e = await n8n<Ev>({ op: "calendar", method: "GET", path: "/events/" + id });
    if (!e.start) throw new ErrorN8n("No encuentro ese evento en Google Calendar", 404);
    cuerpo = { start: mover(e.start, dias), end: mover(e.end, dias) };
  } else {
    if (!b.titulo || !b.inicio) throw new ErrorN8n("Falta título o inicio", 400);
    cuerpo = { summary: b.titulo, location: b.lugar || "", ...franja(b as Franja) };
    if (b.descripcion !== undefined) cuerpo.description = b.descripcion;
  }
  const r = await n8n<Ev>({ op: "calendar", method: "PATCH", path: "/events/" + id, body: cuerpo });
  if (!r.id) throw new ErrorN8n("Google no confirmó el cambio", 502);
  return { ok: true, id: r.id, inicio: r.start.dateTime || r.start.date };
});

export const DELETE = manejar(async (req: Request) => {
  const id = idValido(new URL(req.url).searchParams.get("id") || "");
  await n8n({ op: "calendar", method: "DELETE", path: "/events/" + id });
  return { ok: true };
});
