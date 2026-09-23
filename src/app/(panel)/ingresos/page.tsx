"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Kpi, Boton, Cargando, FalloCarga, Titulo, Chip, Vacio, llamar, avisar, Modal, Campo, inputCls } from "@/components/ui";
import { BarraPartes, BarrasMes, Donut, useColores, colorSerie } from "@/components/graficas";
import Programados, { type ProgramadoApi } from "@/components/gastos/Programados";
import { NEGOCIOS, TIPOS_INGRESO, METODOS, cobrosPorMes, porFuente, type Ingreso, type ResumenNegocio, type Cobro, type Destino } from "@/lib/ingresos";
import { eur, eur0, isoAEs, hoyISO, num, normaliza, mesClave } from "@/lib/parse";
import { mesesEntre } from "@/lib/finanzas";

interface Datos { ingresos: Ingreso[]; resumen: Record<"Todo" | "Taller" | "Flownexion" | "Otro", ResumenNegocio>; programados: ProgramadoApi[] }
type Vista = "Todo" | "Taller" | "Flownexion" | "Otro";
type Filtro = "todos" | "porcobrar" | "retenido" | "parcial" | "cobrado" | "sinprecio" | "sinfecha";

const ESTADO: Record<Ingreso["estado"], { txt: string; cls: string; ico: string }> = {
  cobrado: { txt: "Cobrado", cls: "bg-bien/15 text-bien-txt", ico: "✓" },
  retenido: { txt: "Lo tiene Flownexion", cls: "bg-aviso/20 text-aviso-txt", ico: "🏦" },
  parcial: { txt: "A medias", cls: "bg-aviso/20 text-aviso-txt", ico: "◐" },
  pendiente: { txt: "Pendiente", cls: "bg-alerta/10 text-alerta-txt", ico: "○" },
  "sin precio": { txt: "Sin precio", cls: "bg-card-2 text-txt-3", ico: "?" },
  anulado: { txt: "Anulado", cls: "bg-card-2 text-txt-3 line-through", ico: "✕" },
};
const ICO: Record<string, string> = { Taller: "🔧", Flownexion: "💻", Otro: "📦", Todo: "💰" };

function Estado({ e }: { e: Ingreso["estado"] }) {
  const x = ESTADO[e];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${x.cls}`}><span aria-hidden>{x.ico}</span>{x.txt}</span>;
}

function Progreso({ i }: { i: Ingreso }) {
  if (i.importe === null || !i.importe) return null;
  const p = Math.min(100, (i.cobrado / i.importe) * 100);
  const pc = Math.min(100, (Math.max(i.clientePago, i.cobrado) / i.importe) * 100);
  return (
    <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-card-2" title={`Te han pagado ${eur(i.cobrado)} de ${eur(i.importe)}${i.negocio === "Flownexion" ? ` · el cliente ya pagó a Flownexion ${eur(i.clientePago)}` : ""}`}>
      {i.negocio === "Flownexion" && pc > p && <div className="absolute h-1.5 rounded-full bg-aviso/60" style={{ width: `${pc}%` }} />}
      <div className="absolute h-1.5 rounded-full bg-bien" style={{ width: `${Math.max(p, p > 0 ? 3 : 0)}%` }} />
    </div>
  );
}

/** Fecha editable en la propia línea: si falta, se pone con un toque. */
function FechaEditable({ valor, guardar, etiqueta }: { valor: string | null; guardar: (iso: string) => Promise<void>; etiqueta: string }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(valor || "");
  const [g, setG] = useState(false);
  if (!edit)
    return (
      <button type="button" onClick={(e) => (e.stopPropagation(), setEdit(true))} className={`tabular text-left hover:underline ${valor ? "text-txt-2" : "text-aviso-txt font-medium"}`} title={`Cambiar ${etiqueta}`}>
        {valor ? isoAEs(valor) : "＋ poner fecha"}
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input type="date" autoFocus className={inputCls + " !w-36 !py-0.5 text-xs"} value={v} onChange={(e) => setV(e.target.value)} />
      <Boton pequeno tipo="primario" disabled={!v || g} onClick={async () => { setG(true); try { await guardar(v); setEdit(false); } finally { setG(false); } }}>✓</Boton>
      <Boton pequeno tipo="fantasma" onClick={() => setEdit(false)}>✕</Boton>
    </span>
  );
}

interface FormI { negocio: string; cliente: string; concepto: string; referencia: string; fecha: string; tipo: string; unidades: string; precioUnit: string; totalTrabajo: string; porcentaje: string; importe: string; vencimiento: string; notas: string; estado: string; cobroInicial: string; fechaCobro: string }
const formVacio = (negocio: string): FormI => ({
  negocio: negocio === "Todo" ? "Taller" : negocio, cliente: "", concepto: "", referencia: "", fecha: hoyISO(), tipo: negocio === "Flownexion" ? "proyecto" : "trabajo",
  unidades: "", precioUnit: "", totalTrabajo: "", porcentaje: negocio === "Flownexion" ? "60" : "10", importe: "", vencimiento: "", notas: "", estado: "", cobroInicial: "", fechaCobro: hoyISO(),
});
const aForm = (i: Ingreso): FormI => ({
  negocio: i.negocio, cliente: i.cliente, concepto: i.concepto, referencia: i.referencia, fecha: i.fecha || "", tipo: i.tipo, unidades: i.unidades,
  precioUnit: i.precioUnit === null ? "" : String(i.precioUnit), totalTrabajo: i.totalTrabajo === null ? "" : String(i.totalTrabajo), porcentaje: i.porcentaje === null ? "" : String(i.porcentaje),
  importe: i.importe === null ? "" : String(i.importe), vencimiento: i.vencimiento || "", notas: i.notas, estado: i.estadoHoja, cobroInicial: "", fechaCobro: hoyISO(),
});

export default function Ingresos() {
  const { datos, error, cargando, recargar } = useApi<Datos>("/api/ingresos");
  const [vista, setVista] = useState<Vista>("Todo");
  const [filtro, setFiltro] = useState<Filtro>("porcobrar");
  const [q, setQ] = useState("");
  const [ficha, setFicha] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<FormI | null>(null);
  const [cobrar, setCobrar] = useState<{ i: Ingreso; importe: string; fecha: string; metodo: string; notas: string; destino: Destino } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const c = useColores();

  const ings = useMemo(() => (datos?.ingresos || []).filter((x) => vista === "Todo" || x.negocio === vista), [datos, vista]);
  const lista = useMemo(() => {
    const t = normaliza(q);
    return ings
      .filter((x) =>
        filtro === "porcobrar" ? x.pendiente > 0.005 : filtro === "retenido" ? x.debeFlownexion > 0.005 : filtro === "parcial" ? x.estado === "parcial" : filtro === "cobrado" ? x.estado === "cobrado" : filtro === "sinprecio" ? x.estado === "sin precio" : filtro === "sinfecha" ? !x.fecha : true,
      )
      .filter((x) => !t || normaliza(`${x.id} ${x.cliente} ${x.concepto} ${x.referencia} ${x.notas}`).includes(t))
      .sort((a, b) => Number(b.vencido) - Number(a.vencido) || (b.fecha || "").localeCompare(a.fecha || "") || b.pendiente - a.pendiente);
  }, [ings, filtro, q]);

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  if (!datos) return null;

  const r = datos.resumen[vista];
  const sel = ficha ? datos.ingresos.find((x) => x.id === ficha) || null : null;
  const sinFecha = ings.filter((x) => !x.fecha).length;
  const cobrosSinFecha = ings.reduce((s, x) => s + x.cobros.filter((k) => !k.fecha).length, 0);
  const hoy = hoyISO();
  const meses = mesesEntre(mesClave(new Date(Date.parse(hoy) - 330 * 86400000).toISOString().slice(0, 10)), mesClave(hoy));
  const serieCobros = cobrosPorMes(ings, meses);
  const hayCobrosFechados = serieCobros.some((m) => Number(m.Taller) + Number(m.Flownexion) + Number(m.Otro) > 0);
  const pendientePorCliente = new Map<string, number>();
  for (const x of ings) if (x.pendiente > 0.005) { const k = x.cliente || (x.negocio === "Taller" ? "Taller (sin cliente)" : x.negocio); pendientePorCliente.set(k, (pendientePorCliente.get(k) || 0) + x.pendiente); }
  const fuentes = porFuente(ings);
  const hueco = (i: Ingreso, d: Destino) => (d === "yo" ? i.pendiente : Math.max(0, Math.round(((i.importe || 0) - i.clientePago) * 100) / 100));

  const guardarCampo = async (id: string, cambios: Record<string, unknown>, ok = "Guardado") => {
    try {
      await llamar("/api/ingresos", "PATCH", { id, cambios });
      avisar(ok + " · avisado en Telegram");
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
      throw e;
    }
  };
  const guardarCobroCampo = async (id: string, cambios: Record<string, unknown>) => {
    try {
      await llamar("/api/ingresos/cobros", "PATCH", { id, ...cambios });
      avisar("Pago actualizado");
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
      throw e;
    }
  };
  const confirmarCobro = async () => {
    if (!cobrar) return;
    setEnviando(true);
    try {
      const x = await llamar<{ importe: number; pendiente: number; debeFlownexion: number }>("/api/ingresos/cobros", "POST", { ingreso: cobrar.i.id, importe: cobrar.importe || undefined, fecha: cobrar.fecha, metodo: cobrar.metodo, notas: cobrar.notas, destino: cobrar.destino });
      avisar(
        cobrar.destino === "flownexion"
          ? `Apuntado: el cliente pagó ${eur(x.importe)} (tu parte) a Flownexion. Flownexion te debe ${eur(x.debeFlownexion)} de esto.`
          : `Cobro de ${eur(x.importe)} apuntado. ${x.pendiente > 0.005 ? `Queda ${eur(x.pendiente)}.` : "¡Cobrado entero!"} Avisado en Telegram.`,
      );
      setCobrar(null);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };
  const guardarNuevo = async () => {
    if (!nuevo) return;
    setEnviando(true);
    try {
      const { cobroInicial, fechaCobro, ...rest } = nuevo;
      const x = await llamar<{ id: string }>("/api/ingresos", "POST", { ...rest, cobroInicial: cobroInicial || undefined, fechaCobro });
      avisar(`Creado #${x.id} · avisado en Telegram`);
      setNuevo(null);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };
  const abrirCobro = (i: Ingreso, destino: Destino = "yo") => setCobrar({ i, importe: "", fecha: hoyISO(), metodo: "transferencia", notas: "", destino });

  return (
    <div>
      <Titulo
        titulo="Ingresos"
        sub="Dos canales separados: lo que te paga el taller directamente y lo que te tiene que pagar Flownexion (cuando el cliente paga a Flownexion, ese dinero aún NO es tuyo: Flownexion te lo debe). Lo mismo lo ve el bot (/cobros, /cobrado)."
        extra={<Boton tipo="primario" onClick={() => setNuevo(formVacio(vista))}>+ Nuevo ingreso</Boton>}
      />

      <div className="mb-5 flex gap-1.5 overflow-x-auto scroll-fino" role="tablist">
        {(["Todo", "Taller", "Flownexion", ...(datos.resumen.Otro.n ? ["Otro"] : [])] as Vista[]).map((v) => (
          <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
            className={`flex min-w-36 flex-col rounded-2xl border px-4 py-2.5 text-left transition ${vista === v ? "border-acento bg-acento-suave" : "border-borde bg-card hover:bg-card-2"}`}>
            <span className={`text-sm font-semibold ${vista === v ? "text-acento" : "text-txt"}`}>{ICO[v]} {v === "Todo" ? "Todo" : v}</span>
            <span className="text-xs tabular text-txt-3">te deben {eur0(datos.resumen[v].pendiente)}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi etiqueta="Te deben" valor={eur0(r.pendiente)} sub={`${r.nPendientes} por cobrar${r.nVencidos ? ` · ${r.nVencidos} vencidos` : ""}`} tono={r.pendiente > 0 ? "aviso" : "bien"} />
        <Kpi etiqueta="Te ha llegado a ti" valor={eur0(r.cobrado)} sub={`${r.facturado ? Math.round((r.cobrado / r.facturado) * 100) : 0} % de lo tuyo`} tono="bien" />
        {vista === "Taller" ? (
          <>
            <Kpi etiqueta="Total tuyo" valor={eur0(r.facturado)} sub={`${r.n} líneas`} />
            <Kpi etiqueta="Sin precio" valor={r.nSinPrecio} sub="trabajos que aún no cuentan" />
          </>
        ) : (
          <>
            <Kpi etiqueta="🏦 Lo tiene Flownexion" valor={eur0(r.debeFlownexion)} sub="el cliente ya pagó y a ti no te ha llegado" tono={r.debeFlownexion > 0 ? "alerta" : undefined} />
            <Kpi etiqueta="⏳ Falta que pague el cliente" valor={eur0(r.esperaCliente)} sub="Flownexion aún no lo ha cobrado" />
          </>
        )}
      </div>

      {(sinFecha > 0 || r.nSinPrecio > 0 || cobrosSinFecha > 0) && (
        <div className="mb-4 rounded-xl border border-aviso/50 bg-card px-4 py-3 text-sm">
          <b>Para que las cuentas por mes salgan bien:</b>{" "}
          {sinFecha > 0 && <button className="underline" onClick={() => setFiltro("sinfecha")}>{sinFecha} sin fecha del trabajo</button>}
          {sinFecha > 0 && (r.nSinPrecio > 0 || cobrosSinFecha > 0) && " · "}
          {r.nSinPrecio > 0 && <button className="underline" onClick={() => setFiltro("sinprecio")}>{r.nSinPrecio} sin precio</button>}
          {r.nSinPrecio > 0 && cobrosSinFecha > 0 && " · "}
          {cobrosSinFecha > 0 && <span>{cobrosSinFecha} pagos sin fecha (vienen de la hoja antigua: ábrelos y pon cuándo cobraste)</span>}
          . Toca «＋ poner fecha» en la propia línea.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Tarjeta titulo="Cobrado frente a pendiente" sub={`${vista === "Todo" ? "Taller + Flownexion" : vista} · solo lo que tiene precio`}>
          <BarraPartes partes={[{ nombre: "Cobrado", valor: r.cobrado, color: c.bien }, { nombre: "Pendiente", valor: r.pendiente, color: c.s5 }]} />
          {vista === "Todo" && (
            <div className="mt-4 grid gap-3 border-t border-borde pt-3">
              {(["Taller", "Flownexion"] as const).map((n) => (
                <div key={n}>
                  <div className="flex justify-between text-xs"><span className="text-txt-2">{ICO[n]} {n}</span><span className="tabular text-txt">{eur0(datos.resumen[n].cobrado)} / {eur0(datos.resumen[n].facturado)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-card-2"><div className="h-2 rounded-full bg-bien" style={{ width: `${datos.resumen[n].facturado ? (datos.resumen[n].cobrado / datos.resumen[n].facturado) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
        <Tarjeta titulo="¿Quién te debe?" sub="Pendiente por cliente">
          {pendientePorCliente.size ? (
            <Donut alto={170} centro={{ valor: eur0(r.pendiente), etiqueta: "pendiente" }} items={[...pendientePorCliente.entries()].map(([k, v], n) => ({ nombre: k, valor: v, color: colorSerie(c, n % 8) }))} />
          ) : <Vacio>Nadie te debe nada 🎉</Vacio>}
        </Tarjeta>
        <Tarjeta titulo="Cobros por mes" sub="Según la fecha de cada pago (los que no tienen fecha no salen)">
          {hayCobrosFechados ? (
            <BarrasMes datos={serieCobros} series={[{ clave: "Taller", color: 0 }, { clave: "Flownexion", color: 3 }, { clave: "Otro", color: null }]} alto={210} />
          ) : <Vacio>Aún no hay pagos con fecha. Cuando apuntes un cobro (o le pongas fecha a los antiguos), aparecen aquí.</Vacio>}
        </Tarjeta>
      </div>

      <Tarjeta className="mb-4" titulo="De dónde viene tu dinero" sub="Cada fuente por separado: el taller te paga directo; Flownexion te paga tu parte de cada proyecto">
        <div className="overflow-x-auto scroll-fino -mx-1">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-txt-3">
                <th className="px-1 py-1.5 font-medium">Fuente</th>
                <th className="px-1 text-right font-medium">Tuyo</th>
                <th className="px-1 text-right font-medium">Te ha llegado</th>
                <th className="px-1 text-right font-medium">Te deben</th>
                <th className="px-1 text-right font-medium">🏦 Lo tiene Flownexion</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.map((f) => (
                <tr key={f.fuente} className="border-t border-borde">
                  <td className="px-1 py-2">{ICO[f.negocio]} {f.fuente}</td>
                  <td className="px-1 py-2 text-right tabular">{eur(f.facturado)}</td>
                  <td className="px-1 py-2 text-right tabular text-bien-txt">{f.cobrado ? eur(f.cobrado) : "—"}</td>
                  <td className={`px-1 py-2 text-right tabular font-semibold ${f.pendiente > 0.005 ? "text-aviso-txt" : "text-txt-3"}`}>{eur(f.pendiente)}</td>
                  <td className="px-1 py-2 text-right tabular">{f.negocio === "Flownexion" ? eur(f.debeFlownexion) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        className="mb-4"
        titulo={`${lista.length} ${filtro === "porcobrar" ? "por cobrar" : "líneas"}`}
        sub="Toca una línea para ver sus pagos, editarla o borrarla"
        extra={<input aria-label="Buscar" className={inputCls + " !w-36 !py-1 text-xs"} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {([["porcobrar", "Por cobrar"], ["retenido", "Lo tiene Flownexion"], ["parcial", "A medias"], ["cobrado", "Cobrados"], ["sinprecio", "Sin precio"], ["sinfecha", "Sin fecha"], ["todos", "Todos"]] as const).map(([k, t]) => (
            <Chip key={k} activo={filtro === k} onClick={() => setFiltro(k)}>{t}</Chip>
          ))}
        </div>
        {lista.length ? (
          <div className="overflow-x-auto scroll-fino -mx-1">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="text-left text-xs text-txt-3">
                  <th className="px-1 py-1.5 font-medium">#</th>
                  <th className="px-1 font-medium">Fecha trabajo</th>
                  <th className="px-1 font-medium">Trabajo / cliente</th>
                  <th className="px-1 text-right font-medium">Tuyo</th>
                  <th className="px-1 text-right font-medium">Te han pagado</th>
                  <th className="px-1 text-right font-medium">Falta</th>
                  <th className="px-1 font-medium">Último pago</th>
                  <th className="px-1 font-medium">Estado</th>
                  <th className="px-1" />
                </tr>
              </thead>
              <tbody>
                {lista.map((x) => (
                  <tr key={x.id} className="border-t border-borde hover:bg-card-2 cursor-pointer align-top" onClick={() => setFicha(x.id)}>
                    <td className="px-1 py-2 text-xs text-txt-3 whitespace-nowrap">{ICO[x.negocio]} {x.id}</td>
                    <td className="px-1 py-2 text-xs whitespace-nowrap"><FechaEditable valor={x.fecha} etiqueta="fecha del trabajo" guardar={(f) => guardarCampo(x.id, { fecha: f }, "Fecha del trabajo guardada")} /></td>
                    <td className="px-1 py-2">
                      <div className="font-medium">{x.concepto}</div>
                      <div className="text-[11px] text-txt-3">{[x.cliente, x.referencia, x.totalTrabajo && x.porcentaje ? `${x.porcentaje} % de ${eur(x.totalTrabajo)}` : ""].filter(Boolean).join(" · ")}</div>
                      {x.negocio === "Flownexion" && x.importe !== null && x.pendiente > 0.005 && (
                        <div className="text-[11px] text-txt-2">{x.debeFlownexion > 0.005 ? `🏦 el cliente ya pagó: Flownexion te debe ${eur(x.debeFlownexion)}` : ""}{x.debeFlownexion > 0.005 && x.esperaCliente > 0.005 ? " · " : ""}{x.esperaCliente > 0.005 ? `⏳ falta que pague el cliente ${eur(x.esperaCliente)}` : ""}</div>
                      )}
                      <Progreso i={x} />
                    </td>
                    <td className="px-1 py-2 text-right tabular">{x.importe === null ? <span className="text-txt-3">—</span> : eur(x.importe)}</td>
                    <td className="px-1 py-2 text-right tabular text-bien-txt">{x.cobrado ? eur(x.cobrado) : "—"}</td>
                    <td className={`px-1 py-2 text-right tabular font-semibold ${x.pendiente > 0.005 ? "text-aviso-txt" : "text-txt-3"}`}>{x.importe === null ? "—" : eur(x.pendiente)}</td>
                    <td className="px-1 py-2 text-xs text-txt-2 whitespace-nowrap">{x.cobros.length ? (x.ultimoCobro ? isoAEs(x.ultimoCobro) : <span className="text-aviso-txt">sin fecha</span>) : "—"}{x.cobros.length > 1 && <span className="text-txt-3"> · {x.cobros.length} pagos</span>}</td>
                    <td className="px-1 py-2"><Estado e={x.estado} />{x.vencido && <div className="mt-0.5 text-[10px] font-semibold text-alerta-txt">vencido</div>}</td>
                    <td className="px-1 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {x.pendiente > 0.005 && <Boton pequeno onClick={() => abrirCobro(x)}>{x.negocio === "Flownexion" ? "Me ha pagado" : "Cobrar"}</Boton>}
                      {x.estado === "sin precio" && <Boton pequeno tipo="fantasma" onClick={() => setFicha(x.id)}>Poner precio</Boton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vacio>Nada con este filtro.</Vacio>}
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="🔁 Ingresos que se repiten" sub="Mantenimientos mensuales: se crea la línea de cada mes sola, para que no se te olvide cobrarla">
          <Programados lista={datos.programados} tipo="ingreso" alCambiar={recargar} />
        </Tarjeta>
        <Tarjeta titulo="Cómo funciona">
          <ul className="grid gap-1.5 text-sm text-txt-2">
            <li>• <b>Tuyo</b> es lo que te corresponde: en el taller el 10 % de cada trabajo (y desde octubre de 2026 el mantenimiento de la app, 75 €/mes directo); en Flownexion tu parte del proyecto o del mantenimiento.</li>
            <li>• <b>Flownexion va en dos pasos</b>: el cliente paga a Flownexion (🏦, apúntalo con «El cliente ha pagado a Flownexion») y luego Flownexion te paga a ti («Me ha pagado»). Solo lo segundo cuenta como cobrado.</li>
            <li>• Cada pago es una línea con su <b>fecha</b>: puedes cobrar a medias tantas veces como haga falta. <b>Te deben</b> = tuyo − lo que te ha llegado.</li>
            <li>• La <b>fecha del trabajo</b> dice cuándo se generó; la de cada pago, cuándo cobraste. Las dos se cambian tocándolas.</li>
            <li>• Por Telegram: <code>/cobros</code>, <code>/cobros flownexion</code>, <code>/cobrado #I012 150</code> (te han pagado a ti), o dile al asistente «Rodamientos ha pagado a Flownexion el segundo 50 %».</li>
          </ul>
        </Tarjeta>
      </div>

      {/* Ficha del ingreso: datos editables + historial de pagos */}
      <Modal abierto={!!sel} cerrar={() => setFicha(null)} titulo={sel ? `#${sel.id} · ${sel.concepto}` : ""} ancho="max-w-3xl">
        {sel && <Ficha key={sel.id + sel.cobros.length + sel.cobrado + sel.clientePago} i={sel} guardar={guardarCampo} guardarCobro={guardarCobroCampo} cobrar={(d) => abrirCobro(sel, d)} alBorrar={() => (setFicha(null), recargar())} recargar={recargar} />}
      </Modal>

      <Modal abierto={!!cobrar} cerrar={() => setCobrar(null)} titulo={cobrar?.destino === "flownexion" ? "El cliente ha pagado a Flownexion" : "Apuntar un cobro"} ancho="max-w-md">
        {cobrar && (
          <div className="grid gap-3">
            {cobrar.i.negocio === "Flownexion" && (
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="¿Quién ha pagado a quién?">
                {([["yo", "💶 Flownexion me ha pagado"], ["flownexion", "🏦 El cliente pagó a Flownexion"]] as const).map(([d, t]) => (
                  <button key={d} type="button" role="radio" aria-checked={cobrar.destino === d} onClick={() => setCobrar({ ...cobrar, destino: d, importe: "" })}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold ${cobrar.destino === d ? "border-acento bg-acento-suave text-acento" : "border-borde bg-card text-txt-2"}`}>{t}</button>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-card-2 p-3 text-sm">
              <div className="font-semibold">{cobrar.i.concepto}</div>
              <div className="text-xs text-txt-3">{cobrar.i.negocio}{cobrar.i.cliente ? " · " + cobrar.i.cliente : ""}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div><div className="text-txt-3">Tuyo</div><div className="tabular font-semibold">{eur(cobrar.i.importe || 0)}</div></div>
                {cobrar.destino === "yo" ? (
                  <>
                    <div><div className="text-txt-3">Ya te ha llegado</div><div className="tabular font-semibold text-bien-txt">{eur(cobrar.i.cobrado)}</div></div>
                    <div><div className="text-txt-3">Te deben</div><div className="tabular font-semibold text-aviso-txt">{eur(cobrar.i.pendiente)}</div></div>
                  </>
                ) : (
                  <>
                    <div><div className="text-txt-3">Cliente ya pagó</div><div className="tabular font-semibold">{eur(cobrar.i.clientePago)}</div></div>
                    <div><div className="text-txt-3">Cliente debe</div><div className="tabular font-semibold text-aviso-txt">{eur(hueco(cobrar.i, "flownexion"))}</div></div>
                  </>
                )}
              </div>
            </div>
            <Campo
              etiqueta={cobrar.destino === "yo" ? "¿Cuánto te han pagado a ti?" : "Tu parte de lo que ha pagado el cliente"}
              ayuda={cobrar.destino === "yo" ? "Vacío = lo que falta entero. Si es un pago a cuenta, pon la cantidad." : `En TU parte (${cobrar.i.porcentaje ?? "?"} %), no el total del cliente. No cuenta como cobrado: pasa a «Lo tiene Flownexion».`}
            >
              <input className={inputCls + " tabular"} inputMode="decimal" autoFocus value={cobrar.importe} onChange={(e) => setCobrar({ ...cobrar, importe: e.target.value })} placeholder={eur(hueco(cobrar.i, cobrar.destino))} />
            </Campo>
            <div className="flex flex-wrap gap-1.5">
              {[0.25, 0.5, 1].map((f) => <Chip key={f} onClick={() => setCobrar({ ...cobrar, importe: String(Math.round(hueco(cobrar.i, cobrar.destino) * f * 100) / 100) })}>{f === 1 ? "Todo" : `${f * 100} %`}</Chip>)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Fecha del pago"><input type="date" className={inputCls} value={cobrar.fecha} onChange={(e) => setCobrar({ ...cobrar, fecha: e.target.value })} /></Campo>
              <Campo etiqueta="Cómo"><select className={inputCls} value={cobrar.metodo} onChange={(e) => setCobrar({ ...cobrar, metodo: e.target.value })}>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></Campo>
            </div>
            <Campo etiqueta="Nota (opcional)"><input className={inputCls} value={cobrar.notas} onChange={(e) => setCobrar({ ...cobrar, notas: e.target.value })} /></Campo>
            {cobrar.destino === "yo" && cobrar.importe && num(cobrar.importe) < cobrar.i.pendiente - 0.005 && <p className="text-xs text-txt-2">Quedarán <b className="tabular">{eur(cobrar.i.pendiente - num(cobrar.importe))}</b> pendientes.</p>}
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setCobrar(null)}>Cancelar</Boton>
              <Boton tipo="primario" disabled={enviando} onClick={confirmarCobro}>{enviando ? "Apuntando…" : "Confirmar cobro"}</Boton>
            </div>
          </div>
        )}
      </Modal>

      <Modal abierto={!!nuevo} cerrar={() => setNuevo(null)} titulo="Nuevo ingreso" ancho="max-w-2xl">
        {nuevo && <FormIngreso f={nuevo} set={setNuevo} nuevo />}
        {nuevo && (
          <div className="mt-4 flex justify-end gap-2">
            <Boton onClick={() => setNuevo(null)}>Cancelar</Boton>
            <Boton tipo="primario" disabled={enviando || !nuevo.concepto.trim()} onClick={guardarNuevo}>{enviando ? "Guardando…" : "Crear"}</Boton>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FormIngreso({ f, set, nuevo = false }: { f: FormI; set: (f: FormI) => void; nuevo?: boolean }) {
  const u = (k: keyof FormI, v: string) => set({ ...f, [k]: v });
  const total = f.totalTrabajo ? num(f.totalTrabajo) : f.unidades && f.precioUnit ? num(f.unidades) * num(f.precioUnit) : 0;
  const calc = !f.importe && total ? (f.porcentaje ? (total * num(f.porcentaje)) / 100 : total) : null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Campo etiqueta="Negocio"><select className={inputCls} value={f.negocio} onChange={(e) => set({ ...f, negocio: e.target.value, porcentaje: e.target.value === "Taller" ? "10" : f.porcentaje })}>{NEGOCIOS.map((n) => <option key={n}>{n}</option>)}</select></Campo>
      <Campo etiqueta="Tipo"><select className={inputCls} value={f.tipo} onChange={(e) => u("tipo", e.target.value)}>{TIPOS_INGRESO.map((n) => <option key={n}>{n}</option>)}</select></Campo>
      <Campo etiqueta="Fecha del trabajo" ayuda="Cuándo se generó"><input type="date" className={inputCls} value={f.fecha} onChange={(e) => u("fecha", e.target.value)} /></Campo>
      <Campo etiqueta="Cobrar antes de" ayuda="Opcional"><input type="date" className={inputCls} value={f.vencimiento} onChange={(e) => u("vencimiento", e.target.value)} /></Campo>
      <Campo etiqueta="Concepto / trabajo" className="col-span-2"><input className={inputCls} value={f.concepto} onChange={(e) => u("concepto", e.target.value)} placeholder={f.negocio === "Taller" ? "Filtros tamiz regaliz" : "App de reservas"} /></Campo>
      <Campo etiqueta="Cliente"><input className={inputCls} value={f.cliente} onChange={(e) => u("cliente", e.target.value)} /></Campo>
      <Campo etiqueta="Referencia" ayuda="OCC, pedido, factura…"><input className={inputCls} value={f.referencia} onChange={(e) => u("referencia", e.target.value)} /></Campo>
      <Campo etiqueta="Unidades"><input inputMode="decimal" className={inputCls + " tabular"} value={f.unidades} onChange={(e) => u("unidades", e.target.value)} /></Campo>
      <Campo etiqueta="Precio unidad"><input inputMode="decimal" className={inputCls + " tabular"} value={f.precioUnit} onChange={(e) => u("precioUnit", e.target.value)} /></Campo>
      <Campo etiqueta="Total del trabajo" ayuda="Vacío = uds × precio"><input inputMode="decimal" className={inputCls + " tabular"} value={f.totalTrabajo} onChange={(e) => u("totalTrabajo", e.target.value)} placeholder={total ? String(total) : ""} /></Campo>
      <Campo etiqueta="Tu %"><input inputMode="decimal" className={inputCls + " tabular"} value={f.porcentaje} onChange={(e) => u("porcentaje", e.target.value)} /></Campo>
      <Campo etiqueta="Lo tuyo (€)" ayuda={calc !== null ? `Vacío = ${eur(calc)} calculado` : "Vacío = sin precio todavía"} className="col-span-2">
        <input inputMode="decimal" className={inputCls + " tabular"} value={f.importe} onChange={(e) => u("importe", e.target.value)} placeholder={calc !== null ? String(Math.round(calc * 100) / 100) : ""} />
      </Campo>
      {!nuevo && (
        <Campo etiqueta="Estado" className="col-span-2"><select className={inputCls} value={/anulad/i.test(f.estado) ? "anulado" : ""} onChange={(e) => u("estado", e.target.value)}><option value="">Normal (se calcula con los pagos)</option><option value="anulado">Anulado (no cuenta)</option></select></Campo>
      )}
      {nuevo && (
        <>
          <Campo etiqueta="¿Ya te han pagado algo?" ayuda="Opcional: primer pago" className="col-span-2"><input inputMode="decimal" className={inputCls + " tabular"} value={f.cobroInicial} onChange={(e) => u("cobroInicial", e.target.value)} /></Campo>
          <Campo etiqueta="Fecha de ese pago" className="col-span-2"><input type="date" className={inputCls} value={f.fechaCobro} onChange={(e) => u("fechaCobro", e.target.value)} /></Campo>
        </>
      )}
      <Campo etiqueta="Notas" className="col-span-2 sm:col-span-4"><textarea rows={2} className={inputCls} value={f.notas} onChange={(e) => u("notas", e.target.value)} /></Campo>
    </div>
  );
}

function Ficha({ i, guardar, guardarCobro, cobrar, alBorrar, recargar }: {
  i: Ingreso; guardar: (id: string, c: Record<string, unknown>, ok?: string) => Promise<void>; guardarCobro: (id: string, c: Record<string, unknown>) => Promise<void>;
  cobrar: (d?: Destino) => void; alBorrar: () => void; recargar: () => void;
}) {
  const [f, setF] = useState<FormI>(aForm(i));
  const [g, setG] = useState(false);
  const cambios = () => {
    const o = aForm(i);
    const d: Record<string, string> = {};
    (Object.keys(f) as (keyof FormI)[]).forEach((k) => { if (!["cobroInicial", "fechaCobro"].includes(k) && f[k] !== o[k]) d[k] = f[k]; });
    return d;
  };
  const borrar = async () => {
    if (!confirm(`¿Borrar #${i.id} «${i.concepto}»${i.cobros.length ? ` y sus ${i.cobros.length} pagos` : ""}? Se borra también para Telegram.`)) return;
    try {
      await llamar(`/api/ingresos?id=${i.id}`, "DELETE");
      avisar("Borrado");
      alBorrar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const borrarCobro = async (k: Cobro) => {
    if (!confirm(`¿Quitar el pago de ${eur(k.importe)}${k.fecha ? " del " + isoAEs(k.fecha) : ""}?`)) return;
    try {
      await llamar(`/api/ingresos/cobros?id=${k.id}`, "DELETE");
      avisar("Pago quitado");
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-card-2 p-3 text-center">
        <div><div className="text-xs text-txt-3">Tuyo</div><div className="text-lg font-semibold tabular">{i.importe === null ? "—" : eur(i.importe)}</div></div>
        <div><div className="text-xs text-txt-3">Te ha llegado</div><div className="text-lg font-semibold tabular text-bien-txt">{eur(i.cobrado)}</div></div>
        <div><div className="text-xs text-txt-3">Te deben</div><div className="text-lg font-semibold tabular text-aviso-txt">{eur(i.pendiente)}</div></div>
        <div className="col-span-3"><Progreso i={i} /></div>
        {i.negocio === "Flownexion" && i.importe !== null && (
          <div className="col-span-3 text-xs text-txt-2">
            🏦 El cliente ya ha pagado a Flownexion <b className="tabular">{eur(i.clientePago)}</b> de tu parte → Flownexion te debe <b className="tabular">{eur(i.debeFlownexion)}</b>
            {i.esperaCliente > 0.005 && <> · ⏳ falta que pague el cliente <b className="tabular">{eur(i.esperaCliente)}</b></>}
          </div>
        )}
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Pagos ({i.cobros.length})</h4>
          <span className="flex gap-1.5">
            {i.negocio === "Flownexion" && i.importe !== null && i.clientePago < i.importe - 0.005 && <Boton pequeno onClick={() => cobrar("flownexion")}>🏦 El cliente pagó a Flownexion</Boton>}
            {i.pendiente > 0.005 && <Boton pequeno tipo="primario" onClick={() => cobrar("yo")}>{i.negocio === "Flownexion" ? "💶 Flownexion me ha pagado" : "+ Apuntar pago"}</Boton>}
          </span>
        </div>
        {i.cobros.length ? (
          <ul className="divide-y divide-borde rounded-xl border border-borde">
            {i.cobros.map((k, n) => <PagoFila key={k.id} k={k} n={n} flownexion={i.negocio === "Flownexion"} guardar={(c) => guardarCobro(k.id, c)} borrar={() => borrarCobro(k)} />)}
          </ul>
        ) : <Vacio>Todavía no te han pagado nada de esto.</Vacio>}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold">Datos</h4>
        <FormIngreso f={f} set={setF} />
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Boton tipo="peligro" onClick={borrar}>Borrar</Boton>
          <Boton tipo="primario" disabled={g || !Object.keys(cambios()).length} onClick={async () => { setG(true); try { await guardar(i.id, cambios(), "Cambios guardados"); } catch { /* avisado */ } finally { setG(false); } }}>
            {g ? "Guardando…" : "Guardar cambios"}
          </Boton>
        </div>
        {i.origen && <p className="mt-2 text-[11px] text-txt-3">Origen: {i.origen}</p>}
      </section>
    </div>
  );
}

/** Un pago de la ficha. «Editar» abre importe, a quién fue, fecha, método y nota. */
function PagoFila({ k, n, flownexion, guardar, borrar }: { k: Cobro; n: number; flownexion: boolean; guardar: (c: Record<string, unknown>) => Promise<void>; borrar: () => void }) {
  const [ed, setEd] = useState<{ importe: string; destino: Destino; fecha: string; metodo: string; notas: string } | null>(null);
  const [g, setG] = useState(false);
  if (ed)
    return (
      <li className="grid gap-2 bg-card-2 px-3 py-3 text-sm">
        {flownexion && (
          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="¿A quién fue este pago?">
            {([["yo", "💶 Me llegó a mí"], ["flownexion", "🏦 Cliente → Flownexion"]] as const).map(([d, t]) => (
              <button key={d} type="button" role="radio" aria-checked={ed.destino === d} onClick={() => setEd({ ...ed, destino: d })}
                className={`rounded-xl border px-2 py-1.5 text-xs font-semibold ${ed.destino === d ? "border-acento bg-acento-suave text-acento" : "border-borde bg-card text-txt-2"}`}>{t}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Campo etiqueta="Importe (€)"><input inputMode="decimal" className={inputCls + " tabular"} value={ed.importe} onChange={(e) => setEd({ ...ed, importe: e.target.value })} /></Campo>
          <Campo etiqueta="Fecha"><input type="date" className={inputCls} value={ed.fecha} onChange={(e) => setEd({ ...ed, fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Cómo"><select className={inputCls} value={ed.metodo} onChange={(e) => setEd({ ...ed, metodo: e.target.value })}><option value="">—</option>{METODOS.map((m) => <option key={m}>{m}</option>)}</select></Campo>
          <Campo etiqueta="Nota"><input className={inputCls} value={ed.notas} onChange={(e) => setEd({ ...ed, notas: e.target.value })} /></Campo>
        </div>
        <div className="flex justify-end gap-2">
          <Boton pequeno onClick={() => setEd(null)}>Cancelar</Boton>
          <Boton pequeno tipo="primario" disabled={g || !(num(ed.importe) > 0)} onClick={async () => {
            setG(true);
            try {
              const c: Record<string, unknown> = {};
              if (num(ed.importe) !== k.importe) c.importe = ed.importe;
              if (ed.destino !== k.destino) c.destino = ed.destino;
              if (ed.fecha !== (k.fecha || "")) c.fecha = ed.fecha;
              if (ed.metodo !== k.metodo) c.metodo = ed.metodo;
              if (ed.notas !== k.notas) c.notas = ed.notas;
              if (Object.keys(c).length) await guardar(c);
              setEd(null);
            } catch { /* avisado */ } finally { setG(false); }
          }}>{g ? "Guardando…" : "Guardar pago"}</Boton>
        </div>
      </li>
    );
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-txt-3">{n + 1}.</span>
        <span className="tabular text-txt-2">{k.fecha ? isoAEs(k.fecha) : <span className="text-aviso-txt">sin fecha</span>}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${k.destino === "flownexion" ? "bg-aviso/20 text-aviso-txt" : "bg-bien/15 text-bien-txt"}`}>{k.destino === "flownexion" ? "🏦 cliente → Flownexion" : "💶 a ti"}</span>
        <span className="text-xs text-txt-3">{[k.metodo, k.notas].filter(Boolean).join(" · ")}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className={`tabular font-semibold ${k.destino === "flownexion" ? "text-txt-2" : "text-bien-txt"}`}>{eur(k.importe)}</span>
        <button className="text-xs text-acento hover:underline" onClick={() => setEd({ importe: String(k.importe), destino: k.destino, fecha: k.fecha || "", metodo: k.metodo, notas: k.notas })}>Editar</button>
        <button className="text-xs text-txt-3 hover:text-alerta-txt" onClick={borrar} aria-label="Quitar pago">🗑</button>
      </span>
    </li>
  );
}
