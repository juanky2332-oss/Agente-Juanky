import { manejar } from "@/lib/ruta";
import { leerBebe, cambiarAyuda, fijarNacimiento, preguntarBebe, textoBebe, fichaAyuda } from "@/lib/bebe";
import { normaliza } from "@/lib/parse";

// Entrada del bot: /bebe y la tool "Bebe" del agente. Texto ya montado.
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as { accion?: string; id?: string; estado?: string; fecha?: string; pregunta?: string; texto?: string };
  let acc = normaliza(b.accion);
  let id = (b.id || "").toUpperCase();
  let estado = b.estado || "";
  // "/bebe B03 pedida" o "/bebe nacimiento 12/09/2026" en crudo
  const t = (b.texto || "").trim();
  if (!acc && t) {
    const m = t.match(/^(B\d{2})\s*(.*)$/i);
    if (m) [acc, id, estado] = [m[2] ? "estado" : "ficha", m[1].toUpperCase(), m[2]];
    else if (/^nacimiento\s+/i.test(t)) [acc, b.fecha] = ["nacimiento", t.replace(/^nacimiento\s+/i, "")];
    else if (t) [acc, b.pregunta] = ["pregunta", t];
  }
  if (acc === "nacimiento") {
    await fijarNacimiento(b.fecha || "");
    return { resultado: "✅ Fecha de nacimiento guardada. Plazos recalculados.\n\n" + textoBebe(await leerBebe()) };
  }
  if (acc === "estado" && id) {
    await cambiarAyuda(id, { estado });
    const a = (await leerBebe()).ayudas.find((x) => x.id === id);
    return { resultado: "✅ Apuntado\n\n" + (a ? fichaAyuda(a) : id) };
  }
  if (acc === "ficha" && id) {
    const a = (await leerBebe()).ayudas.find((x) => x.id === id);
    return { resultado: a ? fichaAyuda(a) : `No existe ${id}` };
  }
  if (acc === "pregunta" && b.pregunta) return { resultado: await preguntarBebe(b.pregunta) };
  return { resultado: textoBebe(await leerBebe()) };
});
