"use client";
// Cada proyecto de Flownexion por separado: la app (tu %), el mantenimiento (tu % al mes) y
// dónde está el dinero (lo tiene Flownexion / falta que pague el cliente / te ha llegado).
// Mismos números que el bot (/proyectos): salen de proyectosFlownexion().
import { useState } from "react";
import { Tarjeta, Boton, inputCls, llamar, avisar } from "@/components/ui";
import { rangoMeses, nombreMes, type EstadoProyecto } from "@/lib/ingresos";
import { eur, hoyISO } from "@/lib/parse";

function Linea({ etiqueta, valor, tono, sub }: { etiqueta: string; valor: string; tono?: "bien" | "aviso" | "alerta"; sub?: string }) {
  const c = tono === "bien" ? "text-bien-txt" : tono === "aviso" ? "text-aviso-txt" : tono === "alerta" ? "text-alerta-txt" : "text-txt";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-txt-2">{etiqueta}{sub && <span className="block text-[11px] text-txt-3">{sub}</span>}</span>
      <span className={`tabular font-semibold whitespace-nowrap ${c}`}>{valor}</span>
    </div>
  );
}

function Arrancar({ p, alCambiar }: { p: EstadoProyecto; alCambiar: () => void }) {
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [abierto, setAbierto] = useState(false);
  const [g, setG] = useState(false);
  if (!p.plan) return null;
  if (!abierto) return <Boton pequeno onClick={() => setAbierto(true)}>▶ Empezar mantenimiento</Boton>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input type="month" aria-label="Primer mes de mantenimiento" className={inputCls + " !w-40 !py-1 text-xs"} value={mes} onChange={(e) => setMes(e.target.value)} />
      <Boton pequeno tipo="primario" disabled={g || !mes} onClick={async () => {
        if (!confirm(`¿Empieza el mantenimiento de «${p.proyecto}» en ${nombreMes(mes)}? Se creará cada mes una línea de ${eur(p.plan!.importe)} por cobrar.`)) return;
        setG(true);
        try {
          await llamar("/api/ingresos/bloque", "POST", { op: "mantenimiento", busqueda: p.plan!.id, desde: mes });
          avisar("Mantenimiento en marcha · avisado en Telegram");
          alCambiar();
        } catch (e) {
          avisar((e as Error).message, "error");
        } finally {
          setG(false);
        }
      }}>Confirmar</Boton>
      <Boton pequeno tipo="fantasma" onClick={() => setAbierto(false)}>✕</Boton>
    </span>
  );
}

export default function Proyectos({ ps, alCambiar }: { ps: EstadoProyecto[]; alCambiar: () => void }) {
  if (!ps.length) return null;
  return (
    <Tarjeta className="mb-4" titulo="💻 Proyectos de Flownexion, uno por uno" sub="Tu parte de la app y del mantenimiento, y dónde está el dinero. Los proyectos no se mezclan.">
      <div className="grid gap-4 md:grid-cols-2">
        {ps.map((p) => {
          const cli = p.app.pct ? Math.round((p.app.clientePago / p.app.pct) * 10000) / 100 : null;
          const mantPagados = p.mant.meses.filter((m) => m.clientePago >= m.tuyo - 0.005 || m.cobrado >= m.tuyo - 0.005);
          const mantSin = p.mant.meses.filter((m) => !mantPagados.includes(m));
          return (
            <section key={p.proyecto} className="rounded-xl border border-borde p-3">
              <h4 className="mb-2 font-semibold">{p.proyecto}</h4>

              {p.app.ids.length > 0 && (
                <div className="border-b border-borde pb-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-txt-3">App</div>
                  <Linea etiqueta={`Tu ${p.app.pct ?? "?"} %${p.app.total ? ` de ${eur(p.app.total)}` : ""}`} valor={eur(p.app.tuyo)} />
                  <Linea etiqueta="🏦 El cliente ya pagó a Flownexion" sub={cli !== null ? `${eur(cli)} en total` : undefined} valor={eur(p.app.clientePago)} />
                  <Linea etiqueta="⏳ Falta que pague el cliente" valor={p.app.esperaCliente > 0.005 ? eur(p.app.esperaCliente) : "nada ✓"} tono={p.app.esperaCliente > 0.005 ? "aviso" : "bien"} />
                </div>
              )}

              <div className="border-b border-borde py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-txt-3">Mantenimiento</div>
                {p.mant.meses.length ? (
                  <>
                    <Linea etiqueta={`Tu ${p.mant.pct ?? "?"} %${p.mant.totalMes ? ` de ${eur(p.mant.totalMes)}/mes` : ""} · ${p.mant.meses.length} meses`} sub={rangoMeses(p.mant.meses.map((m) => m.mes))} valor={eur(p.mant.tuyo)} />
                    <Linea etiqueta={`🏦 Pagados por el cliente (${mantPagados.length})`} sub={rangoMeses(mantPagados.map((m) => m.mes))} valor={eur(p.mant.clientePago)} />
                    {mantSin.length > 0 && <Linea etiqueta={`⏳ Sin pagar por el cliente (${mantSin.length})`} sub={rangoMeses(mantSin.map((m) => m.mes))} valor={eur(p.mant.esperaCliente)} tono="aviso" />}
                  </>
                ) : p.plan ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                    <span className="text-txt-2">
                      {p.plan.total ? `${eur(p.plan.total)}/mes → ` : ""}tu {p.plan.pct ?? "?"} % = <b className="tabular text-txt">{eur(p.plan.importe)}/mes</b>
                      <span className="block text-[11px] text-txt-3">{p.plan.activo && p.plan.desde ? `Empieza en ${nombreMes(p.plan.desde.slice(0, 7))}` : "⏸ Sin empezar: todavía no cuenta en nada"}</span>
                    </span>
                    {!(p.plan.activo && p.plan.desde) && <Arrancar p={p} alCambiar={alCambiar} />}
                  </div>
                ) : <p className="py-1 text-sm text-txt-3">Sin mantenimiento.</p>}
              </div>

              <div className="pt-2">
                <Linea etiqueta="💶 A ti te ha llegado" valor={`${eur(p.cobrado)} de ${eur(p.tuyo)}`} tono={p.cobrado > 0.005 ? "bien" : undefined} />
                <Linea etiqueta="👉 Flownexion te debe ya" valor={eur(p.debeFlownexion)} tono={p.debeFlownexion > 0.005 ? "alerta" : "bien"} />
                {p.esperaCliente > 0.005 && <Linea etiqueta="…y cuando pague el cliente, además" valor={eur(p.esperaCliente)} tono="aviso" />}
              </div>
            </section>
          );
        })}
      </div>
    </Tarjeta>
  );
}
