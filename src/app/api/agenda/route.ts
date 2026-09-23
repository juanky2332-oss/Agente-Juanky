import { manejar } from "@/lib/ruta";
import { n8n, ErrorN8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

interface Ev {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
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
  const b = (await req.json()) as { titulo: string; inicio: string; fin?: string; todoElDia?: boolean; descripcion?: string; lugar?: string };
  if (!b.titulo || !b.inicio) throw new ErrorN8n("Falta título o inicio", 400);
  let start, end;
  if (b.todoElDia) {
    const f = b.inicio.slice(0, 10);
    const hasta = (b.fin || b.inicio).slice(0, 10);
    const siguiente = new Date(Date.parse(hasta + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    start = { date: f };
    end = { date: siguiente };
  } else {
    const ini = b.inicio.length === 16 ? b.inicio + ":00" : b.inicio;
    let fin = b.fin ? (b.fin.length === 16 ? b.fin + ":00" : b.fin) : "";
    if (!fin) {
      const d = new Date(ini + "Z");
      d.setUTCHours(d.getUTCHours() + 1);
      fin = d.toISOString().slice(0, 19);
    }
    start = { dateTime: ini, timeZone: "Europe/Madrid" };
    end = { dateTime: fin, timeZone: "Europe/Madrid" };
  }
  const e = await n8n<Ev>({ op: "calendar", method: "POST", path: "/events", body: { summary: b.titulo, description: b.descripcion || "", location: b.lugar || "", start, end } });
  if (!e.id) throw new ErrorN8n("Google no confirmó el evento", 502);
  return { ok: true, id: e.id };
});

export const DELETE = manejar(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[a-zA-Z0-9_]+$/.test(id)) throw new ErrorN8n("Id no válido", 400);
  await n8n({ op: "calendar", method: "DELETE", path: "/events/" + id });
  return { ok: true };
});
