"use client";
// Ventanas de operaciones en bloque de Ingresos:
//  - PagarVarios: "me han pagado el mantenimiento de agosto a septiembre" (o los que marques).
//  - CambiarReparto: cambiar tu % en varios ingresos a la vez y recalcularlo todo.
// Las dos piden primero una simulación al servidor (no escribe) y la enseñan antes de confirmar:
// lo que ves es exactamente lo que se va a apuntar (misma lógica que el bot de Telegram).
import { useEffect, useMemo, useState } from "react";
import { Modal, Campo, Boton, inputCls, llamar, avisar, HtmlTelegram } from "@/components/ui";
import { METODOS, type Ingreso, type Destino } from "@/lib/ingresos";
import { hoyISO } from "@/lib/parse";

/** Proyectos/pagadores que existen en la hoja, para elegir sin escribir. */
export function grupos(ings: Ingreso[]) {
  const m = new Map<string, { negocio: string; cliente: string; etiqueta: string }>();
  for (const i of ings) {
    const k = `${i.negocio}|${i.cliente}`;
    if (!m.has(k)) m.set(k, { negocio: i.negocio, cliente: i.cliente, etiqueta: i.negocio === "Flownexion" ? `💻 Flownexion · ${i.cliente || "sin proyecto"}` : i.negocio === "Taller" ? `🔧 Taller (directo)${i.cliente ? " · " + i.cliente : ""}` : `📦 ${i.cliente || "Otros"}` });
  }
  return [...m.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
}

function usePrevia(cuerpo: Record<string, unknown> | null) {
  // Cada respuesta va marcada con la petición que la pidió: una previa vieja nunca se enseña
  // (ni deja confirmar) mientras se calcula la de lo que hay ahora en pantalla.
  const [previa, setPrevia] = useState<{ clave: string; texto: string; n: number; error?: string } | null>(null);
  const clave = JSON.stringify(cuerpo);
  useEffect(() => {
    if (!cuerpo) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await llamar<{ texto: string; apuntados?: unknown[]; cambios?: unknown[]; programados?: unknown[] }>("/api/ingresos/bloque", "POST", { ...cuerpo, simular: true });
        if (vivo) setPrevia({ clave, texto: r.texto, n: (r.apuntados?.length || 0) + (r.cambios?.length || 0) + (r.programados?.length || 0) });
      } catch (e) {
        if (vivo) setPrevia({ clave, texto: "", n: 0, error: (e as Error).message });
      }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const vigente = cuerpo && previa?.clave === clave ? previa : null;
  return { previa: vigente, cargando: !!cuerpo && !vigente };
}

function Previa({ previa, cargando }: ReturnType<typeof usePrevia>) {
  return (
    <div className="rounded-xl border border-borde bg-card-2 p-3 text-sm min-h-16" aria-live="polite">
      {cargando ? <span className="text-txt-3">Calculando…</span> : previa?.error ? <span className="text-alerta-txt">{previa.error}</span> : previa ? <HtmlTelegram html={previa.texto} /> : <span className="text-txt-3">Elige qué pagar.</span>}
    </div>
  );
}

const mesDe = (iso: string) => iso.slice(0, 7);

export function PagarVarios({ abierto, cerrar, ings, idsIniciales, alTerminar }: { abierto: boolean; cerrar: () => void; ings: Ingreso[]; idsIniciales: string[]; alTerminar: () => void }) {
  const gs = useMemo(() => grupos(ings), [ings]);
  const hoy = hoyISO();
  const porDefecto = gs.find((g) => /taller/i.test(g.cliente) && g.negocio === "Flownexion")?.k || gs[0]?.k || "";
  const [f, setF] = useState({ modo: (idsIniciales.length ? "marcados" : "meses") as "meses" | "marcados", grupo: porDefecto, tipo: "mantenimiento", desde: mesDe(hoy), hasta: mesDe(hoy), destino: "yo" as Destino, fecha: hoy, metodo: "transferencia", notas: "" });
  const [enviando, setEnviando] = useState(false);
  const g = gs.find((x) => x.k === f.grupo);
  const esFlow = f.modo === "marcados" ? ings.some((i) => idsIniciales.includes(i.id) && i.negocio === "Flownexion") : g?.negocio === "Flownexion";
  const cuerpo = !abierto
    ? null
    : f.modo === "marcados"
      ? { op: "pagar", ids: idsIniciales, destino: f.destino, fecha: f.fecha, metodo: f.metodo, notas: f.notas }
      : { op: "pagar", negocio: g?.negocio, cliente: g?.cliente, tipo: f.tipo, desde: f.desde, hasta: f.hasta, destino: f.destino, fecha: f.fecha, metodo: f.metodo, notas: f.notas };
  const { previa, cargando } = usePrevia(cuerpo);
  const confirmar = async () => {
    if (!cuerpo) return;
    setEnviando(true);
    try {
      const r = await llamar<{ total: number; apuntados: unknown[] }>("/api/ingresos/bloque", "POST", cuerpo);
      avisar(`${r.apuntados.length} pagos apuntados · avisado en Telegram`);
      alTerminar();
      cerrar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal abierto={abierto} cerrar={cerrar} titulo="Pagar varios de golpe" ancho="max-w-xl">
      <div className="grid gap-3">
        {idsIniciales.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Qué pagar">
            {([["marcados", `✔ Los ${idsIniciales.length} marcados`], ["meses", "📅 Por meses"]] as const).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={f.modo === k} onClick={() => setF({ ...f, modo: k })}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${f.modo === k ? "border-acento bg-acento-suave text-acento" : "border-borde bg-card text-txt-2"}`}>{t}</button>
            ))}
          </div>
        )}
        {f.modo === "meses" && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="¿De qué?" className="col-span-2">
              <select className={inputCls} value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })}>{gs.map((x) => <option key={x.k} value={x.k}>{x.etiqueta}</option>)}</select>
            </Campo>
            <Campo etiqueta="Tipo">
              <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                <option value="mantenimiento">Mantenimiento</option><option value="proyecto">Proyecto</option><option value="trabajo">Trabajos</option><option value="">Todo</option>
              </select>
            </Campo>
            <div />
            <Campo etiqueta="Desde el mes"><input type="month" className={inputCls} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value, hasta: e.target.value > f.hasta ? e.target.value : f.hasta })} /></Campo>
            <Campo etiqueta="Hasta el mes" ayuda="Incluido"><input type="month" className={inputCls} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
          </div>
        )}
        {esFlow && (
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="¿Quién ha pagado a quién?">
            {([["yo", "💶 Me ha llegado a mí"], ["flownexion", "🏦 El cliente pagó a Flownexion"]] as const).map(([d, t]) => (
              <button key={d} type="button" role="radio" aria-checked={f.destino === d} onClick={() => setF({ ...f, destino: d })}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${f.destino === d ? "border-acento bg-acento-suave text-acento" : "border-borde bg-card text-txt-2"}`}>{t}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Fecha del pago"><input type="date" className={inputCls} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Cómo"><select className={inputCls} value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></Campo>
          <Campo etiqueta="Nota (opcional)" className="col-span-2"><input className={inputCls} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></Campo>
        </div>
        <p className="text-xs text-txt-3">Cada uno se paga entero (lo que le falta). Si un mes aún no tenía línea y hay un mantenimiento programado, se crea sola.</p>
        <Previa previa={previa} cargando={cargando} />
        <div className="flex justify-end gap-2">
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton tipo="primario" disabled={enviando || cargando || !previa || !!previa.error || !previa.n} onClick={confirmar}>{enviando ? "Apuntando…" : "Confirmar pagos"}</Boton>
        </div>
      </div>
    </Modal>
  );
}

export function CambiarReparto({ abierto, cerrar, ings, alTerminar }: { abierto: boolean; cerrar: () => void; ings: Ingreso[]; alTerminar: () => void }) {
  const gs = useMemo(() => grupos(ings).filter((g) => g.negocio === "Flownexion"), [ings]);
  const [f, setF] = useState({ grupo: "*", tipo: "mantenimiento", porcentaje: "60", programados: true });
  const [enviando, setEnviando] = useState(false);
  const g = gs.find((x) => x.k === f.grupo);
  const cuerpo = abierto && Number(f.porcentaje.replace(",", ".")) > 0
    ? { op: "reparto", negocio: "Flownexion", cliente: g?.cliente, tipo: f.tipo, porcentaje: f.porcentaje, programados: f.programados }
    : null;
  const { previa, cargando } = usePrevia(cuerpo);
  const confirmar = async () => {
    if (!cuerpo) return;
    setEnviando(true);
    try {
      const r = await llamar<{ cambios: unknown[]; programados: unknown[] }>("/api/ingresos/bloque", "POST", cuerpo);
      avisar(`Recalculado: ${r.cambios.length} ingresos${r.programados.length ? ` y ${r.programados.length} programados` : ""} · avisado en Telegram`);
      alTerminar();
      cerrar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal abierto={abierto} cerrar={cerrar} titulo="Cambiar tu reparto (%) con Flownexion" ancho="max-w-xl">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Proyecto" className="col-span-2">
            <select className={inputCls} value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })}>
              <option value="*">Todos los proyectos de Flownexion</option>
              {gs.map((x) => <option key={x.k} value={x.k}>{x.etiqueta}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Qué">
            <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="mantenimiento">Mantenimientos</option><option value="proyecto">Proyecto (desarrollo)</option><option value="">Todo</option>
            </select>
          </Campo>
          <Campo etiqueta="Tu parte (%)" ayuda="Consultor 30 + desarrollador 30 = 60"><input inputMode="decimal" className={inputCls + " tabular"} value={f.porcentaje} onChange={(e) => setF({ ...f, porcentaje: e.target.value })} /></Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.programados} onChange={(e) => setF({ ...f, programados: e.target.checked })} />
          Cambiar también los meses que vienen (ingresos programados)
        </label>
        <p className="text-xs text-txt-3">Se recalcula lo tuyo (total × %), el texto del concepto y lo que el cliente ya pagó a Flownexion (está en tu parte). Lo que ya te llegó a ti no se toca.</p>
        <Previa previa={previa} cargando={cargando} />
        <div className="flex justify-end gap-2">
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton tipo="primario" disabled={enviando || cargando || !previa || !!previa.error || !previa.n} onClick={confirmar}>{enviando ? "Recalculando…" : "Aplicar y recalcular"}</Boton>
        </div>
      </div>
    </Modal>
  );
}
