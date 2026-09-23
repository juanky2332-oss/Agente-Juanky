"use client";
import { useState } from "react";
import { Boton, Campo, inputCls, llamar, avisar, Modal, Vacio } from "../ui";
import { CATEGORIAS, AMBITOS } from "@/lib/finanzas";
import { PERIODICIDADES } from "@/lib/programados";
import { NEGOCIOS } from "@/lib/ingresos";
import { eur, isoAEs, hoyISO } from "@/lib/parse";

export interface ProgramadoApi {
  id: string; activo: boolean; tipo: "gasto" | "ingreso"; nombre: string; proveedor: string; concepto: string; categoria: string; ambito: string; negocio: string;
  importe: number; moneda: string; periodicidad: string; dia: number; desde: string | null; hasta: string | null; modo: "auto" | "correo"; estimado: boolean; notas: string;
  proxima?: string | null; mensual?: number;
}

type Form = Omit<ProgramadoApi, "id" | "importe" | "dia" | "desde" | "hasta" | "proxima" | "mensual"> & { importe: string; dia: string; desde: string; hasta: string };
const vacio = (tipo: "gasto" | "ingreso"): Form => ({
  activo: true, tipo, nombre: "", proveedor: "", concepto: "", categoria: tipo === "gasto" ? "Vivienda" : "", ambito: tipo === "gasto" ? "Casa" : "", negocio: tipo === "ingreso" ? "Flownexion" : "",
  importe: "", moneda: "EUR", periodicidad: "mensual", dia: "1", desde: hoyISO(), hasta: "", modo: "auto", estimado: false, notas: "",
});

export default function Programados({ lista, tipo = "gasto", alCambiar }: { lista: ProgramadoApi[]; tipo?: "gasto" | "ingreso"; alCambiar: () => void }) {
  const [edit, setEdit] = useState<{ id?: string; f: Form } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const xs = lista.filter((p) => p.tipo === tipo);
  const set = (k: keyof Form, v: unknown) => setEdit((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));

  const guardar = async () => {
    if (!edit) return;
    setGuardando(true);
    try {
      const cuerpo = { ...edit.f, importe: edit.f.importe, dia: edit.f.dia };
      const r = edit.id
        ? await llamar<{ generados: { gastos: number; ingresos: number } }>("/api/programados", "PATCH", { id: edit.id, cambios: cuerpo })
        : await llamar<{ generados: { gastos: number; ingresos: number } }>("/api/programados", "POST", cuerpo);
      const n = (r.generados?.gastos || 0) + (r.generados?.ingresos || 0);
      avisar(`Guardado${n ? ` · ${n} apuntes automáticos creados` : ""}`);
      setEdit(null);
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setGuardando(false);
    }
  };
  const alternar = async (p: ProgramadoApi) => {
    try {
      await llamar("/api/programados", "PATCH", { id: p.id, cambios: { activo: !p.activo } });
      avisar(p.activo ? "Pausado" : "Activado");
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const borrar = async (p: ProgramadoApi) => {
    if (!confirm(`¿Borrar «${p.nombre}»? Los apuntes que ya hizo se quedan.`)) return;
    try {
      await llamar(`/api/programados?id=${p.id}`, "DELETE");
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  return (
    <div>
      {xs.length ? (
        <ul className="divide-y divide-borde">
          {xs.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${p.activo ? "" : "opacity-55"}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {p.nombre} <span className="text-[11px] text-txt-3">{p.id}</span>
                  {!p.activo && <span className="ml-2 rounded bg-card-2 px-1.5 text-[10px] text-txt-2">pausado</span>}
                  {p.estimado && <span className="ml-2 rounded bg-card-2 px-1.5 text-[10px] text-aviso-txt">importe aprox.</span>}
                </div>
                <div className="text-xs text-txt-3">
                  {eur(p.importe).replace(" €", "")} {p.moneda === "EUR" ? "€" : p.moneda} · {p.periodicidad} (día {p.dia}) · {p.modo === "correo" ? "📧 llega por correo" : "🔁 se apunta solo"}
                  {p.proxima ? ` · próximo ${isoAEs(p.proxima)}` : ""}
                  {p.categoria ? ` · ${p.categoria}` : p.negocio ? ` · ${p.negocio}` : ""}
                </div>
                {p.notas && <div className="text-[11px] text-txt-3">{p.notas}</div>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Boton pequeno tipo="fantasma" onClick={() => alternar(p)}>{p.activo ? "Pausar" : "Activar"}</Boton>
                <Boton pequeno onClick={() => setEdit({ id: p.id, f: { ...p, importe: String(p.importe), dia: String(p.dia), desde: p.desde || "", hasta: p.hasta || "" } })}>Editar</Boton>
                <Boton pequeno tipo="peligro" onClick={() => borrar(p)}>🗑</Boton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Vacio>No hay nada programado todavía.</Vacio>
      )}
      <Boton className="mt-3" onClick={() => setEdit({ f: vacio(tipo) })}>+ {tipo === "gasto" ? "Gasto automático" : "Ingreso que se repite"}</Boton>

      <Modal abierto={!!edit} cerrar={() => setEdit(null)} titulo={edit?.id ? `Editar ${edit.f.nombre}` : tipo === "gasto" ? "Nuevo gasto automático" : "Nuevo ingreso que se repite"} ancho="max-w-xl">
        {edit && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Nombre" className="col-span-2"><input className={inputCls} value={edit.f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder={tipo === "gasto" ? "Comunidad del edificio" : "Mantenimiento app cliente"} /></Campo>
              <Campo etiqueta={tipo === "gasto" ? "Proveedor" : "Cliente"}><input className={inputCls} value={edit.f.proveedor} onChange={(e) => set("proveedor", e.target.value)} /></Campo>
              <Campo etiqueta="Concepto"><input className={inputCls} value={edit.f.concepto} onChange={(e) => set("concepto", e.target.value)} /></Campo>
              <Campo etiqueta="Importe"><input inputMode="decimal" className={inputCls + " tabular"} value={edit.f.importe} onChange={(e) => set("importe", e.target.value)} /></Campo>
              <Campo etiqueta="Moneda">
                <select className={inputCls} value={edit.f.moneda} onChange={(e) => set("moneda", e.target.value)}><option>EUR</option><option>USD</option></select>
              </Campo>
              <Campo etiqueta="Cada cuánto">
                <select className={inputCls} value={edit.f.periodicidad} onChange={(e) => set("periodicidad", e.target.value)}>{PERIODICIDADES.map((p) => <option key={p}>{p}</option>)}</select>
              </Campo>
              <Campo etiqueta="Día del mes"><input inputMode="numeric" className={inputCls} value={edit.f.dia} onChange={(e) => set("dia", e.target.value)} /></Campo>
              <Campo etiqueta="Desde"><input type="date" className={inputCls} value={edit.f.desde} onChange={(e) => set("desde", e.target.value)} /></Campo>
              <Campo etiqueta="Hasta (opcional)"><input type="date" className={inputCls} value={edit.f.hasta} onChange={(e) => set("hasta", e.target.value)} /></Campo>
              {tipo === "gasto" ? (
                <>
                  <Campo etiqueta="Categoría"><select className={inputCls} value={edit.f.categoria} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS.filter((c) => c !== "Ingresos").map((c) => <option key={c}>{c}</option>)}</select></Campo>
                  <Campo etiqueta="Ámbito"><select className={inputCls} value={edit.f.ambito} onChange={(e) => set("ambito", e.target.value)}>{AMBITOS.map((c) => <option key={c}>{c}</option>)}</select></Campo>
                </>
              ) : (
                <Campo etiqueta="Negocio"><select className={inputCls} value={edit.f.negocio} onChange={(e) => set("negocio", e.target.value)}>{NEGOCIOS.map((c) => <option key={c}>{c}</option>)}</select></Campo>
              )}
              <Campo etiqueta="¿Cómo llega?" className="col-span-2">
                <select className={inputCls} value={edit.f.modo} onChange={(e) => set("modo", e.target.value)}>
                  <option value="auto">Se apunta solo en su fecha (no hay factura por correo)</option>
                  <option value="correo">Llega por correo (solo aviso si falta)</option>
                </select>
              </Campo>
              <label className="col-span-2 flex items-center gap-2 text-sm text-txt-2"><input type="checkbox" checked={edit.f.estimado} onChange={(e) => set("estimado", e.target.checked)} /> El importe es aproximado (se marca para corregirlo con el recibo real)</label>
              <Campo etiqueta="Notas" className="col-span-2"><input className={inputCls} value={edit.f.notas} onChange={(e) => set("notas", e.target.value)} placeholder={tipo === "ingreso" ? "Cliente: Nombre del cliente" : ""} /></Campo>
            </div>
            <p className="text-xs text-txt-3">Si la fecha de inicio es pasada, al guardar se crean los apuntes de los meses que faltan (sin duplicar nunca).</p>
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setEdit(null)}>Cancelar</Boton>
              <Boton tipo="primario" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
