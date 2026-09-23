"use client";
import { useState } from "react";
import { useApi, Tarjeta, Kpi, Boton, Cargando, FalloCarga, Titulo, Chip, Vacio, llamar, avisar, Modal, Campo, inputCls } from "@/components/ui";
import { Ranking, BarraPartes, useColores } from "@/components/graficas";
import type { TrabajoTaller, ProyectoFlownexion } from "@/lib/trabajos";
import type { Movimiento } from "@/lib/finanzas";
import { eur, eur0, isoAEs, num } from "@/lib/parse";

interface Datos {
  taller: { trabajos: TrabajoTaller[]; resumen: { facturado: number; miParte: number; cobrado: number; pendiente: number; nPendientes: number; nSinPrecio: number } };
  flownexion: { proyectos: ProyectoFlownexion[]; reparto: string; notasSueltas: string[]; resumen: { ganoApps: number; mantenimientoCobrado: number; cobradoPagos: number; pendiente: number; nPendientes: number } };
  otros: Movimiento[];
}

type Cobro = { hoja: "taller" | "flownexion"; fila: number; esperado: string; falta: number; nombre: string };

export default function Ingresos() {
  const { datos, error, cargando, recargar } = useApi<Datos>("/api/ingresos");
  const [vista, setVista] = useState<"todo" | "pendiente" | "sinprecio" | "cobrado">("todo");
  const [cobro, setCobro] = useState<Cobro | null>(null);
  const [importe, setImporte] = useState("");
  const [enviando, setEnviando] = useState(false);
  const c = useColores();

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  if (!datos) return null;
  const { taller: t, flownexion: f } = datos;
  const pendienteTotal = t.resumen.pendiente + f.resumen.pendiente;
  const otrosTotal = datos.otros.reduce((s, m) => s + m.total, 0);

  const trabajos = t.trabajos.filter((x) =>
    vista === "pendiente" ? x.falta > 0.005 : vista === "sinprecio" ? x.sinPrecio : vista === "cobrado" ? !x.sinPrecio && x.falta <= 0.005 : true,
  );

  const confirmarCobro = async () => {
    if (!cobro) return;
    setEnviando(true);
    try {
      const r = await llamar<{ escrito: string; faltaDespues: number }>("/api/ingresos/cobrado", "POST", {
        hoja: cobro.hoja, fila: cobro.fila, esperado: cobro.esperado, importe: importe ? num(importe) : undefined,
      });
      avisar(`Apuntado: ${r.escrito}. Pendiente ahora ${eur(r.faltaDespues)}. Avisado en Telegram.`);
      setCobro(null);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <Titulo titulo="Ingresos" sub="Taller y Flownexion salen de sus hojas (con sus fórmulas). Los cobros que marques aquí los ve también /cobros del bot." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi etiqueta="Te deben en total" valor={eur0(pendienteTotal)} sub={`${t.resumen.nPendientes + f.resumen.nPendientes} líneas`} tono={pendienteTotal > 0 ? "aviso" : "bien"} />
        <Kpi etiqueta="Taller · tu parte (10 %)" valor={eur0(t.resumen.miParte)} sub={`cobrado ${eur0(t.resumen.cobrado)}`} />
        <Kpi etiqueta="Flownexion · lo que ganas" valor={eur0(f.resumen.ganoApps + f.resumen.mantenimientoCobrado)} sub={`apps ${eur0(f.resumen.ganoApps)} + mto ${eur0(f.resumen.mantenimientoCobrado)}`} />
        <Kpi etiqueta="Otros ingresos (GestorIA)" valor={eur0(otrosTotal)} sub={`${datos.otros.length} apuntes tipo «ingreso»`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Tarjeta titulo="Taller: cobrado frente a pendiente" sub={`Facturado total ${eur(t.resumen.facturado)} · tu parte ${eur(t.resumen.miParte)}`} className="lg:col-span-2">
          <BarraPartes partes={[{ nombre: "Cobrado", valor: t.resumen.cobrado, color: c.s3 }, { nombre: "Pendiente", valor: t.resumen.pendiente, color: c.s4 }]} />
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-txt-2">Lo que más te deben (taller)</div>
            <Ranking
              items={t.trabajos.filter((x) => x.falta > 0.005).sort((a, b) => b.falta - a.falta).slice(0, 8).map((x) => ({ nombre: `${x.trabajo}`, valor: x.falta, clave: String(x.fila), sub: `OCC ${x.occ || "—"} · pedido ${x.pedido || "—"} · #T${x.fila}` }))}
              vacio="No te deben nada del taller 🎉"
            />
          </div>
        </Tarjeta>
        <Tarjeta titulo="Flownexion" sub={f.reparto}>
          <ul className="grid gap-3">
            {f.proyectos.map((p) => (
              <li key={p.fila} className="rounded-xl border border-borde p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.cliente || p.proyecto}</div>
                    <div className="text-[11px] text-txt-3">{p.proyecto} · {p.totalProyecto}</div>
                  </div>
                  <span className={`tabular text-sm font-semibold ${p.falta > 0 ? "text-aviso-txt" : "text-bien-txt"}`}>{p.falta > 0 ? `debe ${eur0(p.falta)}` : "al día"}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-txt-3">Ganas por la app</dt><dd className="tabular text-right">{eur(p.ganoApp)}</dd>
                  <dt className="text-txt-3">Mantenimiento</dt><dd className="text-right">{p.ganoMto || "—"}</dd>
                  <dt className="text-txt-3">Pago inicial</dt><dd className="tabular text-right">{p.pagoInicial ? eur(p.pagoInicial) : "—"}</dd>
                  <dt className="text-txt-3">Segundo pago</dt><dd className="tabular text-right">{p.segundoPago ? eur(p.segundoPago) : "pendiente"}</dd>
                  <dt className="text-txt-3">Meses de mto.</dt><dd className="text-right">{p.mantenimientos || "—"}</dd>
                  <dt className="text-txt-3">Total mto.</dt><dd className="tabular text-right">{p.totalMto ? eur(p.totalMto) : "—"}</dd>
                </dl>
                {p.notas.length > 0 && <p className="mt-2 text-[11px] text-txt-3">📝 {p.notas.join(" · ")}</p>}
                {p.falta > 0 && (
                  <Boton pequeno className="mt-2" onClick={() => (setImporte(""), setCobro({ hoja: "flownexion", fila: p.fila, esperado: p.celda, falta: p.falta, nombre: p.cliente || p.proyecto }))}>
                    Marcar cobro
                  </Boton>
                )}
              </li>
            ))}
          </ul>
          {f.notasSueltas.length > 0 && <p className="mt-3 text-[11px] text-txt-3">Notas de la hoja: {f.notasSueltas.join(" · ")}</p>}
        </Tarjeta>
      </div>

      <Tarjeta
        titulo={`Trabajos del taller (${trabajos.length})`}
        sub={`${t.resumen.nSinPrecio} trabajos sin precio todavía: no cuentan en los totales hasta que los valores.`}
        extra={
          <div className="flex gap-1.5 overflow-x-auto">
            {([["todo", "Todos"], ["pendiente", "Por cobrar"], ["sinprecio", "Sin precio"], ["cobrado", "Cobrados"]] as const).map(([k, tx]) => (
              <Chip key={k} activo={vista === k} onClick={() => setVista(k)}>{tx}</Chip>
            ))}
          </div>
        }
      >
        {trabajos.length ? (
          <div className="overflow-x-auto scroll-fino -mx-1">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-xs text-txt-3">
                  <th className="px-1 py-1.5">#</th><th className="px-1">OCC / pedido</th><th className="px-1">Trabajo</th>
                  <th className="px-1 text-right">Uds.</th><th className="px-1 text-right">Total</th><th className="px-1 text-right">Tu parte</th>
                  <th className="px-1 text-right">Pagado</th><th className="px-1 text-right">Falta</th><th className="px-1" />
                </tr>
              </thead>
              <tbody>
                {trabajos.map((x) => (
                  <tr key={x.fila} className="border-t border-borde">
                    <td className="px-1 py-2 text-xs text-txt-3">T{x.fila}</td>
                    <td className="px-1 py-2 text-xs text-txt-2 whitespace-nowrap">{x.occ || "—"}<br />{x.pedido}</td>
                    <td className="px-1 py-2">
                      <div className="font-medium">{x.trabajo}</div>
                      <div className="text-[11px] text-txt-3">{x.recibido ? "material recibido" : ""}{x.marca ? ` · marca «${x.marca}»` : ""}</div>
                    </td>
                    <td className="px-1 py-2 text-right tabular">{x.unidades || "—"}</td>
                    <td className="px-1 py-2 text-right tabular">{x.sinPrecio ? <span className="text-txt-3">sin precio</span> : eur(x.total)}</td>
                    <td className="px-1 py-2 text-right tabular">{x.sinPrecio ? "—" : eur(x.miParte)}</td>
                    <td className="px-1 py-2 text-right tabular text-bien-txt">{x.pagado ? eur(x.pagado) : "—"}</td>
                    <td className={`px-1 py-2 text-right tabular font-semibold ${x.falta > 0.005 ? "text-aviso-txt" : "text-txt-3"}`}>{x.sinPrecio ? "—" : eur(x.falta)}</td>
                    <td className="px-1 py-2 text-right">
                      {x.falta > 0.005 && <Boton pequeno onClick={() => (setImporte(""), setCobro({ hoja: "taller", fila: x.fila, esperado: x.trabajo, falta: x.falta, nombre: x.trabajo }))}>Cobrado</Boton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vacio>Nada en esta vista.</Vacio>}
      </Tarjeta>

      {datos.otros.length > 0 && (
        <Tarjeta className="mt-4" titulo="Otros ingresos apuntados en GestorIA">
          <ul className="divide-y divide-borde">
            {datos.otros.map((m) => (
              <li key={m.fila} className="flex justify-between py-2 text-sm">
                <span>{isoAEs(m.fecha)} · {m.proveedor} <span className="text-txt-3">{m.concepto}</span></span>
                <span className="tabular font-medium text-bien-txt">{eur(m.total)}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <Modal abierto={!!cobro} cerrar={() => setCobro(null)} titulo="Marcar como cobrado" ancho="max-w-md">
        {cobro && (
          <div className="grid gap-3">
            <p className="text-sm">
              <b>{cobro.nombre}</b> — pendiente <b className="tabular">{eur(cobro.falta)}</b>
            </p>
            <Campo etiqueta="Importe cobrado" ayuda="Vacío = lo cobras entero. Si es un pago a cuenta, pon la cantidad.">
              <input className={inputCls + " tabular"} inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder={eur(cobro.falta)} />
            </Campo>
            <p className="text-xs text-txt-3">Escribo en la columna «pagado» solo si la fórmula del pendiente depende de ella; si no, te explico qué celda tocar. Después releo la hoja para confirmar que ha bajado.</p>
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setCobro(null)}>Cancelar</Boton>
              <Boton tipo="primario" disabled={enviando} onClick={confirmarCobro}>{enviando ? "Apuntando…" : "Confirmar cobro"}</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
