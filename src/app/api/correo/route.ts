import { manejar } from "@/lib/ruta";
import { leerRangos, aTabla, aObjeto } from "@/lib/sheets";
import { n8n, ErrorN8n } from "@/lib/n8n";
import { clasificar, type Mensaje } from "@/lib/correo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dos buzones que no se parecen en nada, y por eso van separados:
// - personal (juanky2332@gmail.com): se lee en vivo y se clasifica; el ruido se esconde.
// - Flownexion (juancarlos@flownexion.com): archivo que alimenta el bot con cada correo que llega.
export const GET = manejar(async (req: Request) => {
  const dias = Math.min(Math.max(Number(new URL(req.url).searchParams.get("dias")) || 14, 1), 60);
  const [[c, f, fi], gm] = await Promise.all([
    leerRangos(["'Correos Flownexion'!A1:H3000", "'Facturas correo'!A1:K3000", "'Filtros correo'!A1:J200"]),
    n8n<{ mensajes: Mensaje[] }>({ op: "gmail", q: `in:inbox newer_than:${dias}d`, limite: 60 }).catch((e) => ({ mensajes: [] as Mensaje[], error: (e as Error).message })),
  ]);
  const tc = aTabla("Correos Flownexion", c), tf = aTabla("Facturas correo", f), tfi = aTabla("Filtros correo", fi);
  // El cuerpo llega de IMAP en UTF-8 leído como latin1 ("AsÃ­"): se repara solo si mejora.
  const arregla = (t: string) => {
    const malos = (x: string) => (x.match(/[ÃÂâ�]/g) || []).length;
    if (!malos(t)) return t;
    try {
      const u = Buffer.from(t, "latin1").toString("utf8");
      return malos(u) < malos(t) ? u : t;
    } catch {
      return t;
    }
  };
  const filtros = tfi.filas.map((x) => ({ ...aObjeto(tfi, x.celdas), fila: x.fila }) as Record<string, string> & { fila: number }).filter((x) => x.ID);
  const remitentes = filtros.filter((x) => !/^no$/i.test(x.ACTIVO || "")).map((x) => x.REMITENTE || "");
  const personal = (gm.mensajes || []).map((m) => ({ ...m, ...clasificar(m, remitentes) }));
  return {
    flownexion: tc.filas
      .map((x) => {
        const o = aObjeto(tc, x.celdas);
        return { fila: x.fila, ...o, ASUNTO: arregla(o.ASUNTO || ""), CUERPO: arregla(o.CUERPO || "").slice(0, 3000), RESUMEN: arregla(o.RESUMEN || "") };
      })
      .reverse(),
    personal,
    errorGmail: "error" in gm ? (gm as { error: string }).error : "",
    facturas: tf.filas.map((x) => ({ fila: x.fila, ...aObjeto(tf, x.celdas) })).reverse(),
    filtros,
    dias,
  };
});

// Resumen con IA de lo importante (bajo demanda: cuesta una llamada).
export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { buzon: "personal" | "flownexion"; correos: { de: string; asunto: string; resumen: string; fecha: string }[] };
  if (!b.correos?.length) throw new ErrorN8n("No hay correos que resumir", 400);
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
            content: `Eres el asistente de Juanky (Murcia; compras industriales, taller y su empresa Flownexion de apps con IA; acaba de ser padre). Te paso correos del buzón ${b.buzon === "flownexion" ? "de EMPRESA (Flownexion: clientes y proyectos)" : "PERSONAL"}.
Saca SOLO lo que requiere acción o es útil (pagos, plazos, clientes esperando, trámites del bebé, avisos de servicios que caducan). Ignora publicidad.
Devuelve SOLO JSON: {"titular":"una frase","acciones":[{"que":"acción concreta","de":"remitente","prioridad":"alta|media|baja","cuando":"plazo si lo hay"}],"info":["datos útiles sin acción"]}. Nada inventado: solo lo que dicen los correos.`,
          },
          { role: "user", content: JSON.stringify(b.correos.slice(0, 60)).slice(0, 40000) },
        ],
      },
    },
    90000,
  );
  try {
    return JSON.parse(r.choices?.[0]?.message?.content || "");
  } catch {
    throw new ErrorN8n("La IA no ha devuelto un resumen legible. Reinténtalo.", 502);
  }
});
