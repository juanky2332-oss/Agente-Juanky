import { manejar } from "@/lib/ruta";
import { leerRangos, aTabla, aObjeto } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export const GET = manejar(async () => {
  const [c, f] = await leerRangos(["'Correos Flownexion'!A1:H3000", "'Facturas correo'!A1:K3000"]);
  const tc = aTabla("Correos Flownexion", c), tf = aTabla("Facturas correo", f);
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
  return {
    correos: tc.filas
      .map((x) => {
        const o = aObjeto(tc, x.celdas);
        return { fila: x.fila, ...o, ASUNTO: arregla(o.ASUNTO || ""), CUERPO: arregla(o.CUERPO || "").slice(0, 3000), RESUMEN: arregla(o.RESUMEN || "") };
      })
      .reverse(),
    facturas: tf.filas.map((x) => ({ fila: x.fila, ...aObjeto(tf, x.celdas) })).reverse(),
  };
});
