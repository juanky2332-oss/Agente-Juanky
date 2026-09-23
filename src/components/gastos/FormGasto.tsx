"use client";
import { useRef, useState } from "react";
import { Boton, Campo, inputCls, llamar, avisar } from "../ui";
import { CATEGORIAS, AMBITOS, clasificar, ambitoPorDefecto, type Movimiento, type Categoria } from "@/lib/finanzas";
import { hoyISO, eur, num } from "@/lib/parse";

export interface Ficha {
  tipo: string;
  fecha: string;
  proveedor: string;
  concepto: string;
  base: string | number;
  iva: string | number;
  total: string | number;
  doc: string;
  enlace: string;
  categoria: string;
  ambito: string;
  subcategoria: string;
  periodoDesde: string;
  periodoHasta: string;
  consumo: string | number;
  unidad: string;
  recurrencia: string;
  pago: string;
  notas: string;
  detalle: Record<string, unknown>;
}

const vacia = (): Ficha => ({
  tipo: "gasto", fecha: hoyISO(), proveedor: "", concepto: "", base: "", iva: "", total: "", doc: "", enlace: "",
  categoria: "", ambito: "", subcategoria: "", periodoDesde: "", periodoHasta: "", consumo: "", unidad: "",
  recurrencia: "", pago: "", notas: "", detalle: {},
});

export function desdeMovimiento(m: Movimiento): Ficha {
  return {
    tipo: m.tipo === "ingreso" ? "ingreso" : m.tipoHoja || "gasto",
    fecha: m.sinFecha ? "" : m.fecha,
    proveedor: m.proveedor, concepto: m.concepto,
    base: m.base || "", iva: m.iva || "", total: m.total || "",
    doc: m.doc, enlace: m.enlace,
    categoria: m.categoria, ambito: m.ambito, subcategoria: m.subcategoria,
    periodoDesde: m.periodoDesde || "", periodoHasta: m.periodoHasta || "",
    consumo: m.consumo ?? "", unidad: m.unidad, recurrencia: m.recurrencia, pago: m.pago, notas: m.notas,
    detalle: m.detalle || {},
  };
}

async function comprimir(f: File): Promise<{ base64: string; mime: string; nombre: string }> {
  const leer = (b: Blob) =>
    new Promise<string>((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = ko;
      r.readAsDataURL(b);
    });
  if (f.type === "application/pdf") {
    if (f.size > 3.3 * 1024 * 1024) throw new Error("El PDF pesa más de 3,3 MB. Súbelo por Telegram o comprímelo.");
    return { base64: await leer(f), mime: f.type, nombre: f.name };
  }
  if (!f.type.startsWith("image/")) throw new Error("Solo fotos o PDF");
  const img = await createImageBitmap(f);
  const escala = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * escala);
  c.height = Math.round(img.height * escala);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.85));
  return { base64: await leer(blob), mime: "image/jpeg", nombre: f.name.replace(/\.\w+$/, "") + ".jpg" };
}

const ETIQ_DETALLE: Record<string, string> = {
  tarifa: "Tarifa", potencia_kw: "Potencia (kW)", precio_kwh: "Precio energía (€/kWh)", precio_potencia_kw_dia: "Potencia (€/kW·día)",
  dias: "Días facturados", cups: "CUPS", datos_gb: "Datos (GB)", lineas: "Líneas", permanencia: "Permanencia",
  descuentos: "Descuentos", nif: "NIF", observaciones: "Observaciones",
};

export default function FormGasto({
  inicial, fila, esperado, alGuardar, conSubida = false,
}: {
  inicial?: Ficha;
  fila?: number;
  esperado?: { total: string; proveedor: string };
  alGuardar: () => void;
  conSubida?: boolean;
}) {
  const [f, setF] = useState<Ficha>(inicial || vacia());
  const [archivo, setArchivo] = useState<{ base64: string; mime: string; nombre: string } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [avisarTg, setAvisarTg] = useState(true);
  const [catTocada, setCatTocada] = useState(!!inicial?.categoria);
  const [arrastre, setArrastre] = useState(false);
  const [leida, setLeida] = useState(false); // se ha leído una factura: hay que revisar y confirmar
  const [confianza, setConfianza] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const set = (k: keyof Ficha, v: unknown) => setF((x) => ({ ...x, [k]: v }));

  // Mientras no la elijas tú, la categoría se deduce del proveedor/concepto al escribir.
  const setTexto = (k: "proveedor" | "concepto", v: string) =>
    setF((x) => {
      const n = { ...x, [k]: v };
      if (catTocada || fila) return n;
      const c = clasificar(n.proveedor, n.concepto);
      return { ...n, categoria: c, ambito: ambitoPorDefecto(c) };
    });

  const subir = async (fl: File | undefined) => {
    if (!fl) return;
    setLeyendo(true);
    setAvisos([]);
    try {
      const a = await comprimir(fl);
      setArchivo(a);
      const r = await llamar<{ ficha: Ficha; avisos: string[]; confianza: number | null }>("/api/finanzas/extraer", "POST", { base64: a.base64, mime: a.mime });
      setF((x) => ({ ...x, ...r.ficha, ambito: x.ambito || ambitoPorDefecto(r.ficha.categoria as Categoria), notas: x.notas }));
      setCatTocada(true);
      setLeida(true);
      setConfianza(r.confianza);
      setAvisos([...(r.confianza !== null && r.confianza < 0.7 ? ["La lectura tiene poca confianza: revisa bien los campos."] : []), ...r.avisos]);
      avisar("Factura leída: revisa los datos y confirma. No se guarda nada hasta que pulses «Confirmar y guardar».");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setLeyendo(false);
    }
  };

  const guardar = async (e: React.FormEvent | null, forzar = false) => {
    e?.preventDefault();
    setGuardando(true);
    try {
      const cuerpo = {
        ...f,
        consumo: f.consumo === "" ? null : f.consumo,
      };
      if (fila) {
        await llamar("/api/finanzas", "PATCH", { fila, esperado, cambios: cuerpo });
        avisar("Cambios guardados en GestorIA");
      } else {
        const r = await llamar<{ fila: number; telegram: boolean; aviso?: string }>("/api/finanzas", "POST", { ...cuerpo, archivo, avisar: avisarTg, forzar });
        avisar(`Guardado como #G${r.fila}${r.telegram ? " · avisado en Telegram" : ""}`);
        if (r.aviso) avisar(r.aviso, "error");
      }
      alGuardar();
    } catch (e) {
      const msg = (e as Error).message;
      if (/^DUPLICADO/.test(msg) && !forzar) {
        setGuardando(false);
        if (confirm(msg.replace(/^DUPLICADO: /, "⚠️ ") + "\n\n¿Es otra factura distinta y quieres guardarla igualmente?")) return guardar(null, true);
        return;
      }
      avisar(msg, "error");
    } finally {
      setGuardando(false);
    }
  };

  const cuadra = (() => {
    const t = num(f.total), b = num(f.base), i = num(f.iva);
    if (!t || !b) return null;
    return Math.abs(b + i - t) <= Math.max(0.05, t * 0.02);
  })();
  const esSuministro = ["Luz", "Gas", "Agua", "Telefonía e internet"].includes(f.categoria);
  const det = Object.entries(f.detalle || {}).filter(([k]) => k !== "cargos_extra");
  const cargos = (f.detalle?.cargos_extra as { concepto: string; importe: number }[] | undefined) || [];

  return (
    <form onSubmit={guardar} className="grid gap-4">
      {conSubida && !fila && (
        <div
          onDragOver={(e) => (e.preventDefault(), setArrastre(true))}
          onDragLeave={() => setArrastre(false)}
          onDrop={(e) => (e.preventDefault(), setArrastre(false), subir(e.dataTransfer.files[0]))}
          className={`rounded-xl border-2 border-dashed p-5 text-center transition ${arrastre ? "border-acento bg-acento-suave" : "border-borde"}`}
        >
          <input ref={input} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
          {leyendo ? (
            <p className="text-sm text-txt-2 animate-pulse">Leyendo la factura con IA… (10-30 s)</p>
          ) : archivo ? (
            <p className="text-sm text-txt-2">📎 {archivo.nombre} — leída. <button type="button" className="text-acento underline" onClick={() => input.current?.click()}>Cambiar</button></p>
          ) : (
            <>
              <p className="text-sm font-medium">Arrastra aquí la factura (foto o PDF)</p>
              <p className="mt-1 text-xs text-txt-3">Leo proveedor, importes, periodo, kWh, potencia, tarifa y cargos extra. Se guarda también en Drive.</p>
              <Boton className="mt-3" onClick={() => input.current?.click()}>Elegir archivo o hacer foto</Boton>
            </>
          )}
        </div>
      )}
      {leida && !fila && (
        <div className="rounded-xl border border-acento/50 bg-acento-suave p-3 text-sm">
          <b>👀 Revisa lo que he leído antes de guardar.</b> Cambia lo que no esté bien (importe, fecha, proveedor, categoría…) o añade lo que falte.
          {confianza !== null && <span className="ml-1 text-xs text-txt-2">Seguridad de la lectura: {Math.round(confianza * 100)} %.</span>}
        </div>
      )}
      {avisos.length > 0 && (
        <ul className="rounded-lg border border-aviso/50 bg-card-2 p-3 text-xs text-aviso-txt grid gap-1">
          {avisos.map((a) => <li key={a}>⚠️ {a}</li>)}
        </ul>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Campo etiqueta="Tipo">
          <select className={inputCls} value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
            <option value="FACTURA">Factura (gasto)</option>
            <option value="presupuesto">Presupuesto</option>
            <option value="albaran">Albarán</option>
          </select>
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" required className={inputCls} value={f.fecha} onChange={(e) => set("fecha", e.target.value)} />
        </Campo>
        <Campo etiqueta="Proveedor" className="col-span-2">
          <input className={inputCls} value={f.proveedor} onChange={(e) => setTexto("proveedor", e.target.value)} placeholder="Iberdrola, Lowi, Mercadona…" />
        </Campo>
        <Campo etiqueta="Concepto" className="col-span-2 sm:col-span-4">
          <input className={inputCls} value={f.concepto} onChange={(e) => setTexto("concepto", e.target.value)} placeholder="Factura de luz agosto" />
        </Campo>
        <Campo etiqueta="Total (con IVA)">
          <input inputMode="decimal" required className={inputCls + " tabular"} value={f.total} onChange={(e) => set("total", e.target.value)} placeholder="0,00" />
        </Campo>
        <Campo etiqueta="Base imponible" ayuda="Vacío = se calcula al 21 %">
          <input inputMode="decimal" className={inputCls + " tabular"} value={f.base} onChange={(e) => set("base", e.target.value)} />
        </Campo>
        <Campo etiqueta="IVA / impuestos">
          <input inputMode="decimal" className={inputCls + " tabular"} value={f.iva} onChange={(e) => set("iva", e.target.value)} />
        </Campo>
        <Campo etiqueta="Nº documento">
          <input className={inputCls} value={f.doc} onChange={(e) => set("doc", e.target.value)} />
        </Campo>
        {cuadra === false && <p className="col-span-2 sm:col-span-4 -mt-1 text-xs text-alerta-txt">⛔ Base + IVA = {eur(num(f.base) + num(f.iva))}, no cuadra con el total {eur(num(f.total))}.</p>}
        <Campo etiqueta="Categoría" className="col-span-2">
          <select className={inputCls} value={f.categoria} onChange={(e) => (setCatTocada(true), set("categoria", e.target.value))}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Ámbito">
          <select className={inputCls} value={f.ambito} onChange={(e) => set("ambito", e.target.value)}>
            <option value="">—</option>
            {AMBITOS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Se repite">
          <select className={inputCls} value={f.recurrencia} onChange={(e) => set("recurrencia", e.target.value)}>
            <option value="">No / auto</option>
            {["mensual", "bimestral", "trimestral", "semestral", "anual"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Campo>
      </div>

      <details open={esSuministro || det.length > 0} className="rounded-xl border border-borde p-3">
        <summary className="cursor-pointer text-sm font-medium">Detalle para el análisis {esSuministro && <span className="text-txt-3 font-normal">— clave en luz, gas, agua y teléfono</span>}</summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Campo etiqueta="Periodo desde"><input type="date" className={inputCls} value={f.periodoDesde} onChange={(e) => set("periodoDesde", e.target.value)} /></Campo>
          <Campo etiqueta="Periodo hasta"><input type="date" className={inputCls} value={f.periodoHasta} onChange={(e) => set("periodoHasta", e.target.value)} /></Campo>
          <Campo etiqueta="Consumo"><input inputMode="decimal" className={inputCls + " tabular"} value={f.consumo} onChange={(e) => set("consumo", e.target.value)} /></Campo>
          <Campo etiqueta="Unidad">
            <select className={inputCls} value={f.unidad} onChange={(e) => set("unidad", e.target.value)}>
              <option value="">—</option>
              {["kWh", "m3", "GB", "litros", "horas"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Forma de pago">
            <select className={inputCls} value={f.pago} onChange={(e) => set("pago", e.target.value)}>
              <option value="">—</option>
              {["domiciliación", "tarjeta", "transferencia", "efectivo", "bizum"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Subcategoría" className="col-span-1 sm:col-span-3"><input className={inputCls} value={f.subcategoria} onChange={(e) => set("subcategoria", e.target.value)} placeholder="p.ej. fibra, móvil, tarifa nocturna…" /></Campo>
          {f.categoria === "Luz" && (
            <>
              <Campo etiqueta="Precio energía €/kWh"><input inputMode="decimal" className={inputCls + " tabular"} value={String(f.detalle.precio_kwh ?? "")} onChange={(e) => set("detalle", { ...f.detalle, precio_kwh: e.target.value === "" ? undefined : num(e.target.value) })} /></Campo>
              <Campo etiqueta="Potencia kW"><input inputMode="decimal" className={inputCls + " tabular"} value={String(f.detalle.potencia_kw ?? "")} onChange={(e) => set("detalle", { ...f.detalle, potencia_kw: e.target.value === "" ? undefined : num(e.target.value) })} /></Campo>
            </>
          )}
          <Campo etiqueta="Notas" className="col-span-2 sm:col-span-4"><textarea rows={2} className={inputCls} value={f.notas} onChange={(e) => set("notas", e.target.value)} /></Campo>
        </div>
        {(det.length > 0 || cargos.length > 0) && (
          <div className="mt-3 rounded-lg bg-card-2 p-3 text-xs grid gap-1">
            <div className="font-semibold text-txt-2 mb-1">Leído de la factura</div>
            {det.map(([k, v]) => (
              <div key={k} className="flex gap-2"><span className="text-txt-3 w-40 shrink-0">{ETIQ_DETALLE[k] || k}</span><span className="text-txt">{String(v)}</span></div>
            ))}
            {cargos.length > 0 && (
              <div className="flex gap-2"><span className="text-txt-3 w-40 shrink-0">Cargos extra</span><span className="text-txt">{cargos.map((c) => `${c.concepto} (${eur(num(c.importe))})`).join(" · ")}</span></div>
            )}
          </div>
        )}
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!fila ? (
          <label className="flex items-center gap-2 text-sm text-txt-2">
            <input type="checkbox" checked={avisarTg} onChange={(e) => setAvisarTg(e.target.checked)} /> Avisarme en Telegram
          </label>
        ) : (
          <span className="text-xs text-txt-3">Fila #G{fila} de GestorIA · lo verás igual desde Telegram</span>
        )}
        <Boton type="submit" tipo="primario" disabled={guardando || leyendo}>{guardando ? "Guardando…" : fila ? "Guardar cambios" : leida ? "✓ Confirmar y guardar" : "Guardar gasto"}</Boton>
      </div>
    </form>
  );
}
