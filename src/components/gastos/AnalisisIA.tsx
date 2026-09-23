"use client";
import { useState } from "react";
import { Boton, Modal, llamar, avisar } from "../ui";
import { eur0 } from "@/lib/parse";

interface Resultado {
  resumen?: string;
  puntos_fuertes?: string[];
  puntos_debiles?: string[];
  acciones?: { accion: string; por_que?: string; ahorro_anual?: number | null; prioridad?: string }[];
  preguntas?: string[];
}

export default function AnalisisIA({ obtenerResumen }: { obtenerResumen: () => unknown }) {
  const [abierto, setAbierto] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const lanzar = async () => {
    setAbierto(true);
    setCargando(true);
    setR(null);
    try {
      setR(await llamar<Resultado>("/api/finanzas/analisis", "POST", obtenerResumen()));
    } catch (e) {
      avisar((e as Error).message, "error");
      setAbierto(false);
    } finally {
      setCargando(false);
    }
  };
  const acciones = [...(r?.acciones || [])].sort((a, b) => ["alta", "media", "baja"].indexOf(a.prioridad || "baja") - ["alta", "media", "baja"].indexOf(b.prioridad || "baja"));
  const ahorro = acciones.reduce((s, a) => s + (typeof a.ahorro_anual === "number" ? a.ahorro_anual : 0), 0);
  return (
    <>
      <Boton tipo="primario" pequeno onClick={lanzar}>✦ Análisis a fondo con IA</Boton>
      <Modal abierto={abierto} cerrar={() => setAbierto(false)} titulo="Análisis a fondo de tus gastos" ancho="max-w-3xl">
        {cargando ? (
          <div className="py-10 text-center text-sm text-txt-2 animate-pulse">Revisando tus facturas, fijos y referencias de mercado… (20-40 s)</div>
        ) : r ? (
          <div className="grid gap-5 text-sm">
            {r.resumen && <p className="text-[15px] leading-relaxed">{r.resumen}</p>}
            {acciones.length > 0 && (
              <section>
                <h4 className="mb-2 font-semibold">Qué haría yo {ahorro > 0 && <span className="font-normal text-bien-txt">· ahorro posible ≈ {eur0(ahorro)}/año</span>}</h4>
                <ol className="grid gap-2">
                  {acciones.map((a, i) => (
                    <li key={i} className="rounded-lg border border-borde p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium">{i + 1}. {a.accion}</span>
                        <span className={`shrink-0 text-[11px] font-semibold uppercase ${a.prioridad === "alta" ? "text-alerta-txt" : a.prioridad === "media" ? "text-aviso-txt" : "text-txt-3"}`}>{a.prioridad}</span>
                      </div>
                      {a.por_que && <p className="mt-1 text-txt-2">{a.por_que}</p>}
                      {typeof a.ahorro_anual === "number" && a.ahorro_anual > 0 && <p className="mt-1 text-xs text-bien-txt tabular">≈ {eur0(a.ahorro_anual)} al año</p>}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {!!r.puntos_debiles?.length && (
                <section>
                  <h4 className="mb-2 font-semibold text-alerta-txt">⚠️ Puntos débiles</h4>
                  <ul className="grid gap-1.5 list-disc pl-5 text-txt-2">{r.puntos_debiles.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </section>
              )}
              {!!r.puntos_fuertes?.length && (
                <section>
                  <h4 className="mb-2 font-semibold text-bien-txt">✅ Lo que está bien</h4>
                  <ul className="grid gap-1.5 list-disc pl-5 text-txt-2">{r.puntos_fuertes.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </section>
              )}
            </div>
            {!!r.preguntas?.length && (
              <section className="rounded-lg bg-card-2 p-3">
                <h4 className="mb-1 font-semibold">Para afinar necesito</h4>
                <ul className="grid gap-1 list-disc pl-5 text-txt-2">{r.preguntas.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </section>
            )}
            <p className="text-[11px] text-txt-3">Las cifras salen de tus datos calculados por la app; la IA solo las interpreta. Si ves un importe raro, corrígelo en la tabla y vuelve a lanzar el análisis.</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
