"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Kpi, TarjetaHallazgo, Titulo, Vacio, FalloCarga } from "@/components/ui";
import { BarrasMes, BarraPartes, useColores } from "@/components/graficas";
import { sumar, mesesEntre, porMes, type Movimiento, type Hallazgo } from "@/lib/finanzas";
import { eur, eur0, pct, hoyISO, mesClave, isoAEs } from "@/lib/parse";
import type { Nota } from "@/lib/datos";

interface Fin { movimientos: Movimiento[]; hallazgos: Hallazgo[]; recurrentes: { mensualEquivalente: number }[] }
interface Res { facturado: number; cobrado: number; pendiente: number; debeFlownexion: number; esperaCliente: number; nPendientes: number; nSinPrecio: number }
interface Ing { resumen: { Todo: Res; Taller: Res; Flownexion: Res } }
interface Ev { id: string; titulo: string; inicio: string; fin: string; todoElDia: boolean }

function cuando(e: Ev) {
  const d = new Date(e.inicio);
  const hoy = hoyISO();
  const dia = e.inicio.slice(0, 10);
  const etiqueta = dia === hoy ? "Hoy" : dia === new Date(Date.now() + 86400000).toISOString().slice(0, 10) ? "Mañana" : d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  return etiqueta + (e.todoElDia ? " · todo el día" : " · " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
}

export default function Inicio() {
  const fin = useApi<Fin>("/api/finanzas");
  const ing = useApi<Ing>("/api/ingresos");
  const tar = useApi<{ notas: Nota[] }>("/api/tareas");
  const age = useApi<{ eventos: Ev[] }>("/api/agenda?atras=0&adelante=10");
  const c = useColores();

  const g = useMemo(() => (fin.datos?.movimientos || []).filter((m) => m.tipo === "gasto" && !m.sinFecha), [fin.datos]);
  const hoy = hoyISO();
  const mesAct = mesClave(hoy);
  const d = new Date();
  const mesAnt = `${new Date(d.getFullYear(), d.getMonth() - 1, 1).getFullYear()}-${String(new Date(d.getFullYear(), d.getMonth() - 1, 1).getMonth() + 1).padStart(2, "0")}`;
  const gMes = sumar(g.filter((m) => mesClave(m.fecha) === mesAct));
  // A mismo día del mes anterior, para comparar peras con peras
  const gAntHastaHoy = sumar(g.filter((m) => mesClave(m.fecha) === mesAnt && +m.fecha.slice(8) <= d.getDate()));
  const meses = mesesEntre(mesClave(new Date(d.getFullYear(), d.getMonth() - 5, 1).toISOString().slice(0, 10)), mesAct);
  const serie = porMes(g, meses).map((r) => ({ mes: r.mes, Gasto: r.total }));
  const fijo = (fin.datos?.recurrentes || []).reduce((s, r) => s + r.mensualEquivalente, 0);

  const pendTaller = ing.datos?.resumen.Taller.pendiente || 0;
  const pendFlow = ing.datos?.resumen.Flownexion.pendiente || 0;

  const abiertas = (tar.datos?.notas || []).filter((n) => n.abierta && ["tarea", "recordatorio", "recurrente", "pendiente"].includes(n.tipo.toLowerCase()));
  const [ahora] = useState(() => Date.now());
  const finHoy = new Date(); finHoy.setHours(23, 59, 59);
  const vencidas = abiertas.filter((n) => n.vence !== null && n.vence < ahora);
  const paraHoy = abiertas.filter((n) => n.vence !== null && n.vence >= ahora && n.vence <= finHoy.getTime());

  const saludo = d.getHours() < 14 ? "Buenos días" : d.getHours() < 21 ? "Buenas tardes" : "Buenas noches";

  return (
    <div>
      <Titulo titulo={`${saludo}, Juanky`} sub={d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi
          etiqueta="Gastado este mes"
          valor={fin.datos ? eur0(gMes) : "…"}
          sub={fin.datos && gAntHastaHoy > 0 ? `${pct(((gMes - gAntHastaHoy) / gAntHastaHoy) * 100)} vs mismo día del mes pasado` : "sin comparación aún"}
          tono={gAntHastaHoy > 0 ? (gMes > gAntHastaHoy * 1.05 ? "alerta" : gMes < gAntHastaHoy * 0.95 ? "bien" : undefined) : undefined}
        />
        <Kpi etiqueta="Gastos fijos al mes" valor={fin.datos ? eur0(fijo) : "…"} sub="suministros y suscripciones" />
        <Kpi etiqueta="Te deben (taller + Flownexion)" valor={ing.datos ? eur0(pendTaller + pendFlow) : "…"} sub={ing.datos ? `${ing.datos.resumen.Todo.nPendientes} líneas por cobrar` : ""} tono={pendTaller + pendFlow > 0 ? "aviso" : undefined} />
        <Kpi etiqueta="Tareas" valor={tar.datos ? abiertas.length : "…"} sub={tar.datos ? `${vencidas.length} vencidas · ${paraHoy.length} para hoy` : ""} tono={vencidas.length ? "alerta" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Tarjeta className="lg:col-span-2" titulo="Gasto de los últimos 6 meses" extra={<Link href="/gastos" className="text-xs text-acento">Ver gastos →</Link>}>
          {fin.error ? <FalloCarga error={fin.error} reintentar={fin.recargar} /> : <BarrasMes datos={serie} series={[{ clave: "Gasto", color: 0 }]} alto={230} media={serie.reduce((s, r) => s + Number(r.Gasto), 0) / serie.length} />}
        </Tarjeta>
        <Tarjeta titulo="Próximo en la agenda" extra={<Link href="/agenda" className="text-xs text-acento">Agenda →</Link>}>
          {age.datos?.eventos.length ? (
            <ul className="grid gap-2.5">
              {age.datos.eventos.slice(0, 6).map((e) => (
                <li key={e.id} className="border-l-2 border-acento pl-3">
                  <div className="text-[11px] text-txt-3 capitalize">{cuando(e)}</div>
                  <div className="text-sm font-medium">{e.titulo}</div>
                </li>
              ))}
            </ul>
          ) : age.cargando ? <p className="text-sm text-txt-3">Cargando…</p> : <Vacio>Nada en los próximos 10 días.</Vacio>}
        </Tarjeta>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Tarjeta titulo="Lo más importante de tus gastos" className="lg:col-span-2" extra={<Link href="/gastos" className="text-xs text-acento">Análisis completo →</Link>}>
          {fin.datos?.hallazgos.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {fin.datos.hallazgos.slice(0, 4).map((h, i) => <TarjetaHallazgo key={i} nivel={h.nivel} titulo={h.titulo} detalle={h.detalle} />)}
            </div>
          ) : <p className="text-sm text-txt-3">{fin.cargando ? "Analizando…" : "Sin hallazgos todavía."}</p>}
        </Tarjeta>
        <Tarjeta titulo="Tareas urgentes" extra={<Link href="/tareas" className="text-xs text-acento">Tareas →</Link>}>
          {[...vencidas, ...paraHoy].length ? (
            <ul className="grid gap-2">
              {[...vencidas, ...paraHoy].slice(0, 7).map((n) => (
                <li key={n.fila} className="text-sm break-words [overflow-wrap:anywhere]">
                  <span className={n.vence! < ahora ? "text-alerta-txt" : "text-aviso-txt"}>{n.vence! < ahora ? "🔴" : "🟡"}</span> {n.contenido}
                  <div className="text-[11px] text-txt-3 pl-5">{n.vencimiento}</div>
                </li>
              ))}
            </ul>
          ) : tar.cargando ? <p className="text-sm text-txt-3">Cargando…</p> : <Vacio>Nada vencido ni para hoy 👌</Vacio>}
        </Tarjeta>
      </div>

      {ing.datos && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["Taller", "Flownexion"] as const).map((n) => (
            <Tarjeta key={n} titulo={n === "Taller" ? "🔧 Taller (te paga directo)" : `💻 Flownexion te debe ${eur0(ing.datos!.resumen.Flownexion.pendiente)}`} extra={<Link href="/ingresos" className="text-xs text-acento">Ingresos →</Link>} sub={`Tuyo: ${eur(ing.datos!.resumen[n].facturado)}${ing.datos!.resumen[n].nSinPrecio ? ` · ${ing.datos!.resumen[n].nSinPrecio} sin precio` : ""}`}>
              {n === "Taller" ? (
                <BarraPartes partes={[{ nombre: "Cobrado", valor: ing.datos!.resumen[n].cobrado, color: c.bien }, { nombre: "Pendiente", valor: ing.datos!.resumen[n].pendiente, color: c.s5 }]} />
              ) : (
                <BarraPartes partes={[{ nombre: "Te ha pagado", valor: ing.datos!.resumen[n].cobrado, color: c.bien }, { nombre: "🏦 Lo tiene Flownexion", valor: ing.datos!.resumen[n].debeFlownexion, color: c.s5 }, { nombre: "⏳ Falta que pague el cliente", valor: ing.datos!.resumen[n].esperaCliente, color: c.s3 }]} />
              )}
            </Tarjeta>
          ))}
        </div>
      )}
      <p className="mt-6 text-center text-[11px] text-txt-3">Todo sale de tus hojas de Google en tiempo real · última carga {new Date().toLocaleTimeString("es-ES")} · {isoAEs(hoy)}</p>
    </div>
  );
}
