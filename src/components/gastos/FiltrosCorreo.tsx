"use client";
import { useState } from "react";
import { Boton, Campo, inputCls, llamar, avisar, Modal, Vacio } from "../ui";
import { CATEGORIAS, AMBITOS } from "@/lib/finanzas";

export type FiltroApi = Record<string, string> & { fila: number };
interface Form { nombre: string; remitente: string; texto: string; categoria: string; ambito: string; recurrencia: string; pdf: boolean; activo: boolean; notas: string }

/**
 * Lista blanca del correo: SOLO estos proveedores se leen de juanky2332@gmail.com cada mañana
 * (con su PDF a Drive). Lo que no esté aquí no entra en gastos: se apunta a mano.
 */
export default function FiltrosCorreo({ filtros, alCambiar }: { filtros: FiltroApi[]; alCambiar: () => void }) {
  const [edit, setEdit] = useState<{ id?: string; f: Form } | null>(null);
  const [imp, setImp] = useState<{ remitente: string; desde: string; hasta: string; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const set = (k: keyof Form, v: unknown) => setEdit((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));
  const si = (v: string) => !/^no$/i.test((v || "").trim());

  const guardar = async () => {
    if (!edit) return;
    setTrabajando(true);
    try {
      if (edit.id) await llamar("/api/correo/filtros", "PATCH", { id: edit.id, cambios: edit.f });
      else await llamar("/api/correo/filtros", "POST", edit.f);
      avisar("Filtro guardado: se usa desde la pasada de mañana a las 7:50");
      setEdit(null);
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setTrabajando(false);
    }
  };
  const importar = async () => {
    if (!imp) return;
    setTrabajando(true);
    try {
      const r = await llamar<{ consulta: string }>("/api/correo/importar", "POST", { ...imp, forzar: true });
      avisar(`Buscando en el correo (${r.consulta}). En 1-2 minutos aparecen en Gastos, con su PDF. Los que ya tengas no se duplican.`);
      setImp(null);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setTrabajando(false);
    }
  };
  const borrar = async (x: FiltroApi) => {
    if (!confirm(`¿Quitar ${x.NOMBRE} de la lista? Sus facturas dejarán de entrar solas.`)) return;
    try {
      await llamar(`/api/correo/filtros?id=${x.ID}`, "DELETE");
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  return (
    <div>
      {filtros.length ? (
        <ul className="divide-y divide-borde">
          {filtros.map((x) => (
            <li key={x.ID} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${si(x.ACTIVO) ? "" : "opacity-55"}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{x.NOMBRE} {!si(x.ACTIVO) && <span className="ml-1 rounded bg-card-2 px-1.5 text-[10px]">pausado</span>}</div>
                <div className="text-xs text-txt-3">
                  de <code>{x.REMITENTE}</code>{x.TEXTO ? <> · que diga <code>{x.TEXTO.split("|").join(" o ")}</code></> : null} · {x.CATEGORIA || "sin categoría"} · {si(x.PDF) ? "📎 guarda el PDF" : "sin PDF"}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Boton pequeno tipo="fantasma" onClick={() => setImp({ remitente: x.REMITENTE, desde: "2026-05-01", hasta: "", texto: "" })}>Traer del correo</Boton>
                <Boton pequeno onClick={() => setEdit({ id: x.ID, f: { nombre: x.NOMBRE, remitente: x.REMITENTE, texto: x.TEXTO, categoria: x.CATEGORIA, ambito: x.AMBITO, recurrencia: x.RECURRENCIA, pdf: si(x.PDF), activo: si(x.ACTIVO), notas: x.NOTAS } })}>Editar</Boton>
                <Boton pequeno tipo="peligro" onClick={() => borrar(x)}>🗑</Boton>
              </div>
            </li>
          ))}
        </ul>
      ) : <Vacio>Sin filtros: no entra nada del correo.</Vacio>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Boton onClick={() => setEdit({ f: { nombre: "", remitente: "", texto: "factura", categoria: "Suscripciones y software", ambito: "Casa", recurrencia: "mensual", pdf: true, activo: true, notas: "" } })}>+ Proveedor del correo</Boton>
        <Boton tipo="fantasma" onClick={() => setImp({ remitente: "", desde: "", hasta: "", texto: "" })}>Buscar una factura concreta en el correo</Boton>
      </div>

      <Modal abierto={!!edit} cerrar={() => setEdit(null)} titulo={edit?.id ? "Editar filtro" : "Nuevo proveedor del correo"} ancho="max-w-lg">
        {edit && (
          <div className="grid gap-3">
            <Campo etiqueta="Nombre"><input className={inputCls} value={edit.f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Supabase" /></Campo>
            <Campo etiqueta="Remitente" ayuda="Un trozo de la dirección que envía: «supabase», «eniplenitude.es», «paypal»…"><input className={inputCls} value={edit.f.remitente} onChange={(e) => set("remitente", e.target.value)} /></Campo>
            <Campo etiqueta="Tiene que decir" ayuda="Palabras separadas por | (en asunto, cuerpo o adjunto). Sirve para saltarse la publicidad del mismo remitente."><input className={inputCls} value={edit.f.texto} onChange={(e) => set("texto", e.target.value)} placeholder="factura|receipt|invoice" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Categoría"><select className={inputCls} value={edit.f.categoria} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS.filter((c) => c !== "Ingresos").map((c) => <option key={c}>{c}</option>)}</select></Campo>
              <Campo etiqueta="Ámbito"><select className={inputCls} value={edit.f.ambito} onChange={(e) => set("ambito", e.target.value)}>{AMBITOS.map((c) => <option key={c}>{c}</option>)}</select></Campo>
              <Campo etiqueta="Se repite"><select className={inputCls} value={edit.f.recurrencia} onChange={(e) => set("recurrencia", e.target.value)}>{["", "mensual", "bimestral", "trimestral", "semestral", "anual"].map((c) => <option key={c} value={c}>{c || "no"}</option>)}</select></Campo>
              <label className="flex items-end gap-2 pb-2 text-sm text-txt-2"><input type="checkbox" checked={edit.f.pdf} onChange={(e) => set("pdf", e.target.checked)} /> Guardar el PDF en Drive</label>
            </div>
            <label className="flex items-center gap-2 text-sm text-txt-2"><input type="checkbox" checked={edit.f.activo} onChange={(e) => set("activo", e.target.checked)} /> Activo</label>
            <div className="flex justify-end gap-2"><Boton onClick={() => setEdit(null)}>Cancelar</Boton><Boton tipo="primario" disabled={trabajando} onClick={guardar}>Guardar</Boton></div>
          </div>
        )}
      </Modal>
      <Modal abierto={!!imp} cerrar={() => setImp(null)} titulo="Traer facturas del correo" ancho="max-w-lg">
        {imp && (
          <div className="grid gap-3">
            <p className="text-sm text-txt-2">Busco en juanky2332@gmail.com, bajo el PDF a Drive, lo leo y lo apunto en gastos. Si ya lo tienes (mismo nº de factura o mismo importe y fecha), no lo repito.</p>
            <Campo etiqueta="Remitente"><input className={inputCls} value={imp.remitente} onChange={(e) => setImp({ ...imp, remitente: e.target.value })} placeholder="eniplenitude.es" /></Campo>
            <Campo etiqueta="Palabras (opcional)"><input className={inputCls} value={imp.texto} onChange={(e) => setImp({ ...imp, texto: e.target.value })} placeholder="factura julio" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Desde"><input type="date" className={inputCls} value={imp.desde} onChange={(e) => setImp({ ...imp, desde: e.target.value })} /></Campo>
              <Campo etiqueta="Hasta"><input type="date" className={inputCls} value={imp.hasta} onChange={(e) => setImp({ ...imp, hasta: e.target.value })} /></Campo>
            </div>
            <p className="text-xs text-txt-3">Solo se apunta lo que case con un filtro de la lista (proveedores tuyos). Así no se cuela publicidad.</p>
            <div className="flex justify-end gap-2"><Boton onClick={() => setImp(null)}>Cancelar</Boton><Boton tipo="primario" disabled={trabajando} onClick={importar}>{trabajando ? "Lanzando…" : "Traer"}</Boton></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
