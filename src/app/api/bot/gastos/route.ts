import { manejar } from "@/lib/ruta";
import { leerGastos, textoConsulta, textoMes, buscarGasto, fichaGasto, modificarGasto, borrarGasto, mandarFacturas, informeCsv } from "@/lib/gastosBot";
import { ErrorN8n } from "@/lib/n8n";
import { normaliza } from "@/lib/parse";

// Gastos por Telegram (tool «Gastos» del agente). Todo a petición; devuelve el texto YA MONTADO.
//   consulta · mes · ver · facturas (mandar al chat) · informe (CSV) · modificar · borrar
// modificar/borrar van en dos pasos: sin confirmar=si solo enseñan lo que harían.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const si = (v: unknown) => v === true || /^(s[ií]|true|1|ok|vale)$/i.test(String(v ?? "").trim());

export const POST = manejar(async (req: Request) => {
  const b = (await req.json()) as {
    accion: string; id?: string; busqueda?: string; categoria?: string; proveedor?: string; ambito?: string; desde?: string; hasta?: string; mes?: string;
    tipo?: string; datos?: Record<string, unknown> | string; confirmar?: string | boolean; clave?: string; zip?: string | boolean; con_facturas?: string | boolean;
  };
  const f = { busqueda: b.busqueda, categoria: b.categoria, proveedor: b.proveedor, ambito: b.ambito, desde: b.desde, hasta: b.hasta, tipo: b.tipo };
  let datos = b.datos || {};
  if (typeof datos === "string") {
    try {
      datos = datos.trim() ? JSON.parse(datos) : {};
    } catch {
      throw new ErrorN8n("datos tiene que ser un JSON", 400);
    }
  }
  switch (normaliza(b.accion)) {
    case "consulta":
    case "cuanto":
      return { resultado: textoConsulta(await leerGastos(), f) };
    case "mes":
    case "resumen":
      return { resultado: textoMes(await leerGastos(), b.mes || b.desde) };
    case "ver":
    case "buscar": {
      const xs = buscarGasto(await leerGastos(), b.id || b.busqueda || "ultimo", f);
      if (!xs.length) return { resultado: "No encuentro ese gasto." };
      return { resultado: xs.length === 1 ? fichaGasto(xs[0]) : `Hay ${xs.length}:\n` + xs.slice(0, 10).map(fichaGasto).join("\n\n") };
    }
    case "facturas":
    case "mandar":
    case "enviar": {
      const ids = String(b.id || "").split(/[\s,;]+/).filter((x) => /\d/.test(x));
      return { resultado: (await mandarFacturas({ ...f, ids, zip: si(b.zip) })).texto };
    }
    case "informe":
    case "excel":
    case "csv":
      return { resultado: (await informeCsv({ ...f, conFacturas: si(b.con_facturas) })).texto };
    case "modificar":
    case "cambiar":
      return { resultado: (await modificarGasto(b.id || "ultimo", datos as Record<string, unknown>, si(b.confirmar), b.clave)).texto };
    case "borrar":
      return { resultado: (await borrarGasto(b.id || "", si(b.confirmar), b.clave)).texto };
  }
  throw new ErrorN8n("Acción no válida: consulta, mes, ver, facturas, informe, modificar, borrar", 400);
});
