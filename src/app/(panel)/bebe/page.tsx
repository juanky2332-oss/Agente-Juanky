"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Chip, llamar, avisar, inputCls, Kpi, HtmlTelegram } from "@/components/ui";
import { fechaHora, normaliza } from "@/lib/parse";

type T = Record<string, string> & { fila: number };
const hecha = (t: T) => /hech|complet|✅/i.test(t.ESTADO || "");
const noAplica = (t: T) => /no aplica|➖/i.test(t.ESTADO || "");

export default function Bebe() {
  const { datos, error, cargando, recargar } = useApi<{ tareas: T[]; nacimiento: string }>("/api/bebe");
  const [fase, setFase] = useState("");
  const [soloPend, setSoloPend] = useState(true);
  const [fecha, setFecha] = useState("");
  const [res, setRes] = useState("");

  const tareas = useMemo(() => datos?.tareas || [], [datos]);
  const fases = useMemo(() => [...new Set(tareas.map((t) => t.FASE))], [tareas]);
  const [ahora] = useState(() => Date.now());
  const lista = tareas.filter((t) => (!fase || t.FASE === fase) && (!soloPend || (!hecha(t) && !noAplica(t))));
  const total = tareas.filter((t) => !noAplica(t)).length;
  const hechas = tareas.filter(hecha).length;
  const vencidas = tareas.filter((t) => !hecha(t) && !noAplica(t) && (fechaHora(t["FECHA LÍMITE"])?.getTime() ?? 9e15) < ahora);

  const accion = async (body: Record<string, string>, ok: string) => {
    try {
      const r = await llamar<{ resultado: string }>("/api/bebe", "POST", body);
      avisar(ok);
      setRes(r.resultado);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;

  return (
    <div>
      <Titulo titulo="Checklist del bebé" sub={`Trámites del nacimiento · fecha de nacimiento en la hoja: ${datos?.nacimiento || "sin poner"}`} />
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Kpi etiqueta="Hechas" valor={`${hechas} / ${total}`} sub={total ? `${Math.round((hechas / total) * 100)} %` : ""} tono={hechas === total ? "bien" : undefined} />
        <Kpi etiqueta="Pasadas de fecha" valor={vencidas.length} tono={vencidas.length ? "alerta" : "bien"} />
        <Kpi etiqueta="Fases" valor={fases.length} />
      </div>
      <Tarjeta className="mb-4" titulo="Progreso por fase">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {fases.map((f) => {
            const ts = tareas.filter((t) => t.FASE === f && !noAplica(t));
            const h = ts.filter(hecha).length;
            return (
              <button key={f} onClick={() => setFase(fase === f ? "" : f)} className="text-left">
                <div className="flex justify-between text-sm"><span className={fase === f ? "font-semibold text-acento" : ""}>{f}</span><span className="tabular text-txt-3">{h}/{ts.length}</span></div>
                <div className="mt-1 h-2 rounded-full bg-card-2"><div className="h-2 rounded-full bg-bien" style={{ width: `${ts.length ? (h / ts.length) * 100 : 0}%` }} /></div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-borde pt-3">
          <label className="text-xs text-txt-2">¿Ya ha nacido? Pon la fecha y recalculo todos los plazos:
            <input type="date" className={inputCls + " mt-1"} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <Boton disabled={!fecha} onClick={() => { const [y, m, d] = fecha.split("-"); accion({ accion: "nacimiento", fecha: `${d}/${m}/${y}` }, "Plazos recalculados"); }}>Recalcular plazos</Boton>
        </div>
      </Tarjeta>
      {res && <Tarjeta className="mb-4" titulo="Respuesta" extra={<Boton pequeno tipo="fantasma" onClick={() => setRes("")}>✕</Boton>}><HtmlTelegram html={res} /></Tarjeta>}
      <Tarjeta titulo={`${lista.length} tareas`} extra={<><Chip activo={soloPend} onClick={() => setSoloPend(!soloPend)}>Solo pendientes</Chip>{fase && <Chip activo onClick={() => setFase("")}>{fase} ✕</Chip>}</>}>
        <ul className="divide-y divide-borde">
          {lista.sort((a, b) => (fechaHora(a["FECHA LÍMITE"])?.getTime() ?? 9e15) - (fechaHora(b["FECHA LÍMITE"])?.getTime() ?? 9e15)).map((t) => {
            const lim = fechaHora(t["FECHA LÍMITE"]);
            const venc = !hecha(t) && lim && lim.getTime() < ahora;
            return (
              <li key={t.fila} className="py-3">
                <div className="flex items-start gap-3">
                  <button onClick={() => !hecha(t) && accion({ accion: "hecho", fila: String(t.fila) }, "Marcada como hecha")} className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 ${hecha(t) ? "border-bien bg-bien" : "border-borde hover:border-bien"}`} aria-label="Marcar hecha" />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${hecha(t) ? "line-through text-txt-3" : ""}`}>{normaliza(t.PRIORIDAD) === "alta" && "❗"}{t.TAREA}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-txt-3">
                      <span>#{t.fila}</span><span>{t.FASE}</span>
                      {t["FECHA LÍMITE"] && <span className={venc ? "font-semibold text-alerta-txt" : ""}>límite {t["FECHA LÍMITE"]}</span>}
                      {t["DÓNDE"] && <span>📍 {t["DÓNDE"]}</span>}
                    </div>
                    {(t.DOCUMENTOS || t.NOTAS) && (
                      <details className="mt-1 text-xs text-txt-2">
                        <summary className="cursor-pointer text-txt-3">Detalles</summary>
                        {t.DOCUMENTOS && <p className="mt-1">📄 {t.DOCUMENTOS}</p>}
                        {t.DEPENDENCIAS && <p>🔗 Depende de: {t.DEPENDENCIAS}</p>}
                        {t.NOTAS && <p>📝 {t.NOTAS}</p>}
                      </details>
                    )}
                  </div>
                  <span className="text-[11px] text-txt-3 shrink-0">{t.ESTADO}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </div>
  );
}
