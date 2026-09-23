"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Cargando, FalloCarga, Titulo, Chip, Vacio, inputCls, Kpi } from "@/components/ui";
import { normaliza, num, eur } from "@/lib/parse";

type R = Record<string, string> & { fila: number };

export default function Correo() {
  const { datos, error, cargando, recargar } = useApi<{ correos: R[]; facturas: R[] }>("/api/correo");
  const [vista, setVista] = useState<"correos" | "facturas">("correos");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);

  const correos = useMemo(() => (datos?.correos || []).filter((c) => !q || normaliza(`${c.DE} ${c.CORREO} ${c.ASUNTO} ${c.RESUMEN}`).includes(normaliza(q))), [datos, q]);
  const facturas = useMemo(() => (datos?.facturas || []).filter((f) => f.ESTADO !== "pendiente" || f.REMITENTE).filter((f) => !q || normaliza(Object.values(f).join(" ")).includes(normaliza(q))), [datos, q]);
  const remitentes = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of datos?.correos || []) m.set(c.DE, (m.get(c.DE) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [datos]);

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  const guardadas = (datos?.facturas || []).filter((f) => f.ESTADO === "guardado");

  return (
    <div>
      <Titulo titulo="Correo" sub="Archivo de juancarlos@flownexion.com (lo que llega a INBOX) y las facturas que el bot saca cada mañana de tus correos." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi etiqueta="Correos Flownexion archivados" valor={datos?.correos.length || 0} />
        <Kpi etiqueta="Quién más escribe" valor={<span className="text-base">{remitentes[0]?.[0] || "—"}</span>} sub={remitentes[0] ? `${remitentes[0][1]} correos` : ""} />
        <Kpi etiqueta="Facturas cazadas del correo" valor={guardadas.length} sub={eur(guardadas.reduce((s, f) => s + num(f.TOTAL), 0))} />
        <Kpi etiqueta="Por revisar" valor={(datos?.facturas || []).filter((f) => f.ESTADO === "revisar").length} tono={(datos?.facturas || []).some((f) => f.ESTADO === "revisar") ? "aviso" : "bien"} />
      </div>
      <Tarjeta titulo={vista === "correos" ? `${correos.length} correos` : `${facturas.length} facturas analizadas`}
        extra={<><Chip activo={vista === "correos"} onClick={() => setVista("correos")}>Correos</Chip><Chip activo={vista === "facturas"} onClick={() => setVista("facturas")}>Facturas</Chip><input className={inputCls + " !w-36 !py-1 text-xs"} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /></>}>
        {vista === "correos" ? (
          correos.length ? (
            <ul className="divide-y divide-borde">
              {correos.slice(0, 150).map((c) => (
                <li key={c.fila} className="py-2.5">
                  <button className="w-full text-left" onClick={() => setAbierto(abierto === c.fila ? null : c.fila)}>
                    <div className="flex justify-between gap-3">
                      <span className="text-sm font-medium truncate">{c.DE}</span>
                      <span className="text-[11px] text-txt-3 shrink-0">{c.FECHA}</span>
                    </div>
                    <div className="text-sm text-txt-2 truncate">{c.PRIORIDAD && <span className="mr-1">{/alta/i.test(c.PRIORIDAD) ? "🔴" : /media/i.test(c.PRIORIDAD) ? "🟡" : "⚪"}</span>}{c.ASUNTO}</div>
                    {c.RESUMEN && <div className="text-xs text-txt-3 truncate">{c.RESUMEN}</div>}
                  </button>
                  {abierto === c.fila && (
                    <div className="mt-2 rounded-lg bg-card-2 p-3 text-xs">
                      {c.ACCION && <p className="mb-2 font-medium">👉 {c.ACCION}</p>}
                      <pre className="whitespace-pre-wrap font-sans text-txt-2 max-h-80 overflow-y-auto">{c.CUERPO}</pre>
                      <a href={`mailto:${c.CORREO}?subject=${encodeURIComponent("Re: " + c.ASUNTO)}`} className="mt-2 inline-block text-acento underline">Responder</a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <Vacio>Sin correos.</Vacio>
        ) : facturas.length ? (
          <div className="overflow-x-auto scroll-fino">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-left text-xs text-txt-3"><th className="py-1.5">Alta</th><th>Remitente / asunto</th><th>Proveedor</th><th className="text-right">Total</th><th>Estado</th></tr></thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.fila} className="border-t border-borde">
                    <td className="py-2 text-xs text-txt-3 whitespace-nowrap">{f.FECHA_ALTA}</td>
                    <td className="py-2"><div className="truncate max-w-64">{f.REMITENTE}</div><div className="text-[11px] text-txt-3 truncate max-w-64">{f.ASUNTO}</div></td>
                    <td className="py-2 text-xs">{f.PROVEEDOR}</td>
                    <td className="py-2 text-right tabular">{f.TOTAL && num(f.TOTAL) ? eur(num(f.TOTAL)) : "—"}</td>
                    <td className="py-2 text-xs"><span className={f.ESTADO === "guardado" ? "text-bien-txt" : f.ESTADO === "revisar" ? "text-aviso-txt" : "text-txt-3"}>{f.ESTADO}</span>{f.ENLACE && <a href={f.ENLACE} target="_blank" rel="noreferrer" className="ml-2 text-acento underline">ver</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vacio>Sin facturas.</Vacio>}
      </Tarjeta>
    </div>
  );
}
