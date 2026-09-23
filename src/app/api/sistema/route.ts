import { manejar } from "@/lib/ruta";
import { n8n } from "@/lib/n8n";

export const dynamic = "force-dynamic";

const CLAVE: Record<string, string> = {
  uIr6eehJA1h2l3tP: "Multiagente (Telegram)",
  Pw3b7KyPHAW0gk52: "API de esta app",
  Ocz8o0pav2FnKIG0: "Despertador (avisos a su hora)",
  iBvgbnb5hXSR1wWl: "Parte diario 8:00",
  AgpzNgIonWtRKdd4: "Facturas del correo 7:50",
  kQACPfwoJsl2xEXj: "Avisos correo Flownexion",
  etOYwN744NIvru6T: "Consulta correos",
  b5vQp7gZYvsTCNbq: "Consulta notas",
  "2IzxG3jD4WXDfxB5": "Consulta fichas (gastos, contactos, trabajos)",
  RZVu9kZsrXmlI879: "Buscador de proveedores",
  qJICFPSWjDXjoKkt: "Guía gastro",
  "4ipnweYAXHQA8Pvb": "Checklist bebé",
  yz6Y1xvbiTKGH0kS: "Centinela de fallos",
};

export const GET = manejar(async () => {
  const [w, e] = await Promise.all([
    n8n<{ data: { id: string; name: string; active: boolean; updatedAt: string }[] }>({ op: "n8n", path: "/workflows?limit=250" }),
    n8n<{ data: { id: string; workflowId: string; status: string; startedAt: string; stoppedAt: string; mode: string }[] }>({ op: "n8n", path: "/executions?limit=100" }),
  ]);
  const ejec = e.data || [];
  return {
    workflows: Object.entries(CLAVE).map(([id, nombre]) => {
      const wf = (w.data || []).find((x) => x.id === id);
      const suyas = ejec.filter((x) => x.workflowId === id);
      return {
        id, nombre, existe: !!wf, activo: !!wf?.active, actualizado: wf?.updatedAt || "",
        ultima: suyas[0]?.startedAt || "", ultimoEstado: suyas[0]?.status || "",
        errores: suyas.filter((x) => x.status === "error").length, ejecuciones: suyas.length,
      };
    }),
    ejecuciones: ejec.slice(0, 40).map((x) => ({ ...x, nombre: CLAVE[x.workflowId] || x.workflowId })),
  };
});
