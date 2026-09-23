import { manejar } from "@/lib/ruta";
import { leerRangos, aTabla, aObjeto } from "@/lib/sheets";
import { n8n, webhook, ErrorN8n } from "@/lib/n8n";
import { normaliza, claveEmpresa } from "@/lib/parse";

// "¿Quién me puede vender X?" en dos niveles, y SIN mezclarlos:
// 1) SEGURO: lo que está escrito en tus hojas (buscador de /prov: ficha de contacto, matriz de
//    marcas por proveedor, maestro). Esto no se interpreta.
// 2) PROBABLE: la IA razona sobre TU lista de proveedores (marcas que distribuyen, qué dice su
//    ficha y a qué se dedican) y propone candidatos. Solo puede nombrar empresas que existen
//    en tus hojas (se comprueba en código) y cada una lleva el porqué y la confianza.
export const dynamic = "force-dynamic";
export const maxDuration = 90;

interface Candidato { empresa: string; motivo: string; confianza: "alta" | "media" | "baja"; pregunta?: string }

export const GET = manejar(async (req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) throw new ErrorN8n("Escribe qué producto, marca o material buscas", 400);

  const [exacto, [mat, tar]] = await Promise.all([
    webhook<{ resultado?: string }>("consulta-proveedores-test", { busqueda: q }).catch(() => ({ resultado: "" })),
    leerRangos(["'Proveedores'!A1:AZ60", "'tarjetas visitas'!A1:K300"]),
  ]);

  // Matriz: cada columna es un proveedor y debajo las marcas/productos que distribuye.
  const provs = new Map<string, { empresa: string; marcas: string[]; ficha: string[] }>();
  const cab = mat[0] || [];
  cab.forEach((p, j) => {
    const empresa = String(p || "").trim();
    if (!empresa) return;
    const marcas = mat.slice(1).map((f) => String((f || [])[j] || "").replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
    provs.set(claveEmpresa(empresa), { empresa, marcas, ficha: [] });
  });
  const tt = aTabla("tarjetas visitas", tar);
  for (const f of tt.filas) {
    const o = aObjeto(tt, f.celdas);
    const empresa = (o.Empresa || "").trim();
    if (!empresa) continue;
    const k = claveEmpresa(empresa);
    const x = provs.get(k) || { empresa, marcas: [], ficha: [] };
    x.ficha.push([o.Contacto && `persona: ${o.Contacto}`, o["Pagina Web"] && `web: ${o["Pagina Web"]}`, o.Otros && `notas: ${o.Otros}`, `#C${f.fila}`].filter(Boolean).join(" · "));
    provs.set(k, x);
  }
  const lista = [...provs.values()].map((p) => `- ${p.empresa}${p.marcas.length ? ` | marcas/productos: ${p.marcas.join(", ")}` : ""}${p.ficha.length ? ` | ficha: ${p.ficha.join(" / ")}` : ""}`).join("\n");

  const r = await n8n<{ choices?: { message?: { content?: string } }[] }>(
    {
      op: "openai",
      body: {
        model: "gpt-5.4-mini",
        reasoning_effort: "medium",
        max_completion_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Eres el comprador técnico de una fábrica de golosinas (mantenimiento industrial: repuestos, automatización, transmisión, neumática, hidráulica, inox, bandas, etc.).
Te doy la LISTA de proveedores de Juanky (con las marcas que distribuyen y sus fichas) y un producto. Di quién de ESA lista puede tenerlo.
REGLAS:
- Solo empresas que aparezcan EXACTAMENTE en la lista. Nunca inventes ni añadas otras.
- confianza "alta": el producto o su marca está escrito en su fila. "media": por las marcas que distribuye o el tipo de empresa es muy probable que lo tenga. "baja": podría, pero habría que preguntar.
- motivo: una frase concreta (qué marca/línea suya encaja). Si propones marca, di cuál.
- pregunta: qué le preguntarías al llamar (referencia, medida...). Opcional.
- Máximo 6, de más a menos probable. Si nadie encaja, lista vacía y dilo en "nota".
Devuelve SOLO JSON: {"interpretacion":"qué es el producto en una frase","candidatos":[{"empresa":"...","motivo":"...","confianza":"alta|media|baja","pregunta":"..."}],"nota":"..."}`,
          },
          { role: "user", content: `PRODUCTO: ${q}\n\nLISTA DE PROVEEDORES:\n${lista}`.slice(0, 60000) },
        ],
      },
    },
    90000,
  );
  let d: { interpretacion?: string; candidatos?: Candidato[]; nota?: string } = {};
  try {
    d = JSON.parse(r.choices?.[0]?.message?.content || "{}");
  } catch {
    d = {};
  }
  // Filtro duro: cualquier empresa que no esté en tus hojas se descarta.
  const validos = (d.candidatos || [])
    .map((c) => {
      const p = provs.get(claveEmpresa(c.empresa)) || [...provs.values()].find((x) => normaliza(x.empresa) === normaliza(c.empresa));
      return p ? { ...c, empresa: p.empresa, marcas: p.marcas, ficha: p.ficha, confianza: (["alta", "media", "baja"].includes(c.confianza) ? c.confianza : "baja") as Candidato["confianza"] } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 6);
  return { exacto: exacto.resultado || "", interpretacion: d.interpretacion || "", candidatos: validos, nota: d.nota || "", descartados: (d.candidatos || []).length - validos.length };
});
