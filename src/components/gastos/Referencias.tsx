"use client";
import { useState } from "react";
import { Boton, inputCls, llamar, avisar } from "../ui";
import { CATEGORIAS, type Referencia } from "@/lib/finanzas";

type Ref = Referencia & { fila?: number };
const METRICAS = [
  { k: "cuota_mensual", t: "Gasto al mes (€/mes)", u: "€/mes" },
  { k: "precio_energia", t: "Precio de la energía (€/kWh)", u: "€/kWh" },
];

export default function Referencias({ refs, alCambiar }: { refs: Ref[]; alCambiar: () => void }) {
  const [nueva, setNueva] = useState<Ref>({ categoria: "Luz", metrica: "cuota_mensual", unidad: "€/mes", buenoHasta: 0, caroDesde: 0, fuente: "", fecha: "" });
  const [ocupado, setOcupado] = useState(false);
  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await fn();
      avisar(ok);
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="grid gap-4">
      <p className="text-sm text-txt-2">
        El análisis compara tus gastos con estos rangos. Son tuyos: viven en la pestaña <b>Referencias precios</b> de la hoja y puedes cambiarlos cuando quieras. Nunca invento un precio de mercado que no esté aquí.
      </p>
      <div className="overflow-x-auto scroll-fino">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-txt-3">
              <th className="py-1.5">Categoría</th><th>Qué mide</th><th className="text-right">Bueno hasta</th><th className="text-right">Caro desde</th><th>Fuente</th><th />
            </tr>
          </thead>
          <tbody>
            {refs.map((r) => (
              <tr key={r.fila} className="border-t border-borde align-top">
                <td className="py-2 font-medium">{r.categoria}</td>
                <td className="py-2 text-txt-2">{METRICAS.find((m) => m.k === r.metrica)?.t || r.metrica}</td>
                <td className="py-2 text-right tabular text-bien-txt">{r.buenoHasta} {r.unidad}</td>
                <td className="py-2 text-right tabular text-alerta-txt">{r.caroDesde} {r.unidad}</td>
                <td className="py-2 text-xs text-txt-3 max-w-60">{r.fuente} <span className="whitespace-nowrap">({r.fecha})</span></td>
                <td className="py-2 text-right">
                  <button disabled={ocupado} className="text-xs text-txt-3 hover:text-alerta-txt" onClick={() => confirm("¿Quitar esta referencia?") && accion(() => llamar(`/api/finanzas/referencias?fila=${r.fila}`, "DELETE"), "Quitada")}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border border-borde p-3">
        <div className="mb-2 text-sm font-medium">Añadir referencia</div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <select className={inputCls + " sm:col-span-2"} value={nueva.categoria} onChange={(e) => setNueva({ ...nueva, categoria: e.target.value })}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={inputCls + " sm:col-span-2"} value={nueva.metrica} onChange={(e) => setNueva({ ...nueva, metrica: e.target.value, unidad: METRICAS.find((m) => m.k === e.target.value)!.u })}>
            {METRICAS.map((m) => <option key={m.k} value={m.k}>{m.t}</option>)}
          </select>
          <input className={inputCls} inputMode="decimal" placeholder="Bueno hasta" onChange={(e) => setNueva({ ...nueva, buenoHasta: Number(e.target.value.replace(",", ".")) })} />
          <input className={inputCls} inputMode="decimal" placeholder="Caro desde" onChange={(e) => setNueva({ ...nueva, caroDesde: Number(e.target.value.replace(",", ".")) })} />
          <input className={inputCls + " col-span-2 sm:col-span-5"} placeholder="Fuente (web, comparador, oferta que te han hecho…)" value={nueva.fuente} onChange={(e) => setNueva({ ...nueva, fuente: e.target.value })} />
          <Boton tipo="primario" disabled={ocupado} onClick={() => accion(() => llamar("/api/finanzas/referencias", "POST", nueva), "Referencia añadida")}>Añadir</Boton>
        </div>
      </div>
    </div>
  );
}
