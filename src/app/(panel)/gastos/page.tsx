"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Kpi, Boton, Modal, Cargando, FalloCarga, Chip, TarjetaHallazgo, Titulo, inputCls, llamar, avisar, Vacio } from "@/components/ui";
import { BarrasMes, Ranking, LineaMes, useColores, colorSerie } from "@/components/graficas";
import FormGasto, { desdeMovimiento } from "@/components/gastos/FormGasto";
import Referencias from "@/components/gastos/Referencias";
import AnalisisIA from "@/components/gastos/AnalisisIA";
import {
  CATEGORIAS, CATEGORIAS_COLOR, AMBITOS, porMes, agrupar, mesesEntre, sumar,
  type Movimiento, type Hallazgo, type Referencia,
} from "@/lib/finanzas";
import { eur, eur0, pct, isoAEs, hoyISO, mesClave, normaliza, mesLargo } from "@/lib/parse";

interface RecurrenteApi {
  provKey: string; proveedor: string; categoria: string; ambito: string; periodicidad: string; cadaDias: number;
  importeTipico: number; mensualEquivalente: number; anualEquivalente: number; n: number; proximaEstimada: string | null; variacion: number | null;
  ultimo: Movimiento; movs: number[];
}
interface Datos {
  movimientos: Movimiento[];
  referencias: (Referencia & { fila: number })[];
  hallazgos: Hallazgo[];
  recurrentes: RecurrenteApi[];
  facturasCorreo: Record<string, string>[];
}

const PERIODOS = [
  { k: "mes", t: "Este mes" },
  { k: "3m", t: "3 meses" },
  { k: "6m", t: "6 meses" },
  { k: "anio", t: "Este año" },
  { k: "12m", t: "12 meses" },
  { k: "todo", t: "Todo" },
] as const;

function rango(k: string, primera: string): [string, string] {
  const hoy = hoyISO();
  const d = new Date(hoy);
  const menos = (m: number) => {
    const x = new Date(d.getFullYear(), d.getMonth() - m + 1, 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-01`;
  };
  if (k === "mes") return [hoy.slice(0, 8) + "01", hoy];
  if (k === "3m") return [menos(3), hoy];
  if (k === "6m") return [menos(6), hoy];
  if (k === "12m") return [menos(12), hoy];
  if (k === "anio") return [hoy.slice(0, 4) + "-01-01", hoy];
  return [primera, hoy];
}

const idxColor = (c: string) => {
  const i = (CATEGORIAS_COLOR as readonly string[]).indexOf(c);
  return i >= 0 ? i : null;
};

export default function Gastos() {
  const { datos, error, cargando, recargar } = useApi<Datos>("/api/finanzas");
  const [periodo, setPeriodo] = useState<string>("12m");
  const [ambito, setAmbito] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("");
  const [proveedor, setProveedor] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [nuevo, setNuevo] = useState<"" | "manual" | "subir">("");
  const [editando, setEditando] = useState<Movimiento | null>(null);
  const [verRefs, setVerRefs] = useState(false);
  const [provSerie, setProvSerie] = useState<string>("");
  const [orden, setOrden] = useState<{ k: "fecha" | "total" | "proveedor"; asc: boolean }>({ k: "fecha", asc: false });
  const [pagina, setPagina] = useState(1);
  const [sinDudosos, setSinDudosos] = useState(false);
  const c = useColores();

  // Filas marcadas por el análisis como importe raro o que no cuadra
  const dudosos = useMemo(
    () => new Set((datos?.hallazgos || []).filter((h) => h.nivel === "alerta" && /^(No cuadra|Importe raro)/.test(h.titulo)).flatMap((h) => h.filas || [])),
    [datos],
  );
  const gastos = useMemo(
    () => (datos?.movimientos || []).filter((m) => m.tipo === "gasto" && !m.sinFecha && !(sinDudosos && dudosos.has(m.fila))),
    [datos, sinDudosos, dudosos],
  );
  const primera = useMemo(() => gastos.reduce((min, m) => (m.fecha < min ? m.fecha : min), hoyISO()), [gastos]);
  const [desde, hasta] = rango(periodo, primera);

  const filtrados = useMemo(() => {
    const q = normaliza(texto);
    return gastos.filter(
      (m) =>
        m.fecha >= desde && m.fecha <= hasta &&
        (!ambito || m.ambito === ambito) &&
        (!categoria || m.categoria === categoria) &&
        (!proveedor || m.provKey === proveedor) &&
        (!q || normaliza(`${m.proveedor} ${m.concepto} ${m.doc} ${m.notas}`).includes(q)),
    );
  }, [gastos, desde, hasta, ambito, categoria, proveedor, texto]);

  // Periodo anterior de la misma duración, con los mismos filtros (menos el de fechas)
  const anterior = (() => {
    const dur = Date.parse(hasta) - Date.parse(desde);
    const a0 = new Date(Date.parse(desde) - dur - 86400000).toISOString().slice(0, 10);
    const a1 = new Date(Date.parse(desde) - 86400000).toISOString().slice(0, 10);
    return gastos.filter(
      (m) => m.fecha >= a0 && m.fecha <= a1 && (!ambito || m.ambito === ambito) && (!categoria || m.categoria === categoria) && (!proveedor || m.provKey === proveedor),
    );
  })();

  const meses = mesesEntre(mesClave(desde), mesClave(hasta));
  const serieMes = useMemo(() => porMes(filtrados, meses), [filtrados, meses]);
  // Para la gráfica: 8 categorías con color fijo + el resto sumado en "Otros" (gris)
  const serieGrafica = useMemo(
    () =>
      serieMes.map((r) => {
        const o: Record<string, number | string> = { mes: r.mes };
        let resto = 0;
        for (const cat of CATEGORIAS) {
          if ((CATEGORIAS_COLOR as readonly string[]).includes(cat)) o[cat] = r[cat];
          else resto += Number(r[cat] || 0);
        }
        o["Otros"] = resto;
        return o;
      }),
    [serieMes],
  );
  const total = sumar(filtrados);
  const totalAnt = sumar(anterior);
  const mesesConDatos = Math.max(1, meses.length);
  const mediaMes = total / mesesConDatos;
  const porCat = agrupar(filtrados, (m) => m.categoria);
  const porProv = agrupar(filtrados, (m) => m.provKey);
  const recs = (datos?.recurrentes || []).filter((r) => (!ambito || r.ambito === ambito) && (!categoria || r.categoria === categoria));
  const fijoMes = recs.reduce((s, r) => s + r.mensualEquivalente, 0);
  const hallazgos = (datos?.hallazgos || []).filter((h) => !categoria || !h.categoria || h.categoria === categoria);
  const nombreProv = (k: string) => gastos.find((m) => m.provKey === k)?.proveedor || k;
  const pendientesCorreo = (datos?.facturasCorreo || []).filter((f) => f.ESTADO === "revisar");

  // Evolución factura a factura de un proveedor (precio y consumo)
  const provParaSerie = provSerie || recs[0]?.provKey || "";
  const serieProv = (() => {
    const ms = gastos.filter((m) => m.provKey === provParaSerie).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return ms.map((m) => ({
      mes: isoAEs(m.fecha),
      total: m.total,
      eurUnidad: m.consumo ? +(m.total / m.consumo).toFixed(4) : null,
    }));
  })();

  const tabla = (() => {
    const s = [...filtrados].sort((a, b) => {
      const v = orden.k === "total" ? a.total - b.total : orden.k === "proveedor" ? a.proveedor.localeCompare(b.proveedor) : a.fecha.localeCompare(b.fecha);
      return orden.asc ? v : -v;
    });
    return s;
  })();
  const POR_PAG = 40;

  const borrar = async (m: Movimiento) => {
    if (!confirm(`¿Borrar ${m.proveedor} · ${eur(m.total)} (${m.fechaTexto})? Se borra de GestorIA, también para Telegram.`)) return;
    try {
      await llamar(`/api/finanzas?fila=${m.fila}&total=${encodeURIComponent(m.totalCrudo)}&proveedor=${encodeURIComponent(m.proveedor)}`, "DELETE");
      avisar("Borrado");
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const resumenIA = () => ({
    periodo: { desde, hasta, meses: meses.length },
    filtros: { ambito: ambito || "todos", categoria: categoria || "todas", proveedor: proveedor ? nombreProv(proveedor) : "todos" },
    total, media_mensual: mediaMes, total_periodo_anterior: totalAnt,
    gasto_fijo_mensual: fijoMes,
    por_mes: serieMes.map((m) => ({ mes: m.mes, total: m.total })),
    por_categoria: porCat.map((g) => ({ categoria: g.clave, total: g.total, n: g.n })),
    top_proveedores: porProv.slice(0, 15).map((g) => ({ proveedor: nombreProv(g.clave), total: g.total, n: g.n })),
    recurrentes: recs.map((r) => ({ proveedor: r.proveedor, categoria: r.categoria, periodicidad: r.periodicidad, importe_tipico: r.importeTipico, al_mes: r.mensualEquivalente, al_anio: r.anualEquivalente, variacion_ultima_pct: r.variacion })),
    hallazgos: hallazgos.map((h) => ({ nivel: h.nivel, titulo: h.titulo, detalle: h.detalle, impacto_anual: h.impactoAnual })),
    referencias_mercado: datos?.referencias || [],
    movimientos: filtrados.slice(0, 250).map((m) => ({ fecha: m.fecha, proveedor: m.proveedor, concepto: m.concepto, categoria: m.categoria, ambito: m.ambito, total: m.total, consumo: m.consumo, unidad: m.unidad, detalle: m.detalle })),
  });

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  if (!datos) return null;

  const variacion = totalAnt > 0 ? ((total - totalAnt) / totalAnt) * 100 : null;
  const filtroActivo = ambito || categoria || proveedor || texto;

  return (
    <div>
      <Titulo
        titulo="Gastos"
        sub={<>Datos en vivo de la hoja GestorIA · {gastos.length} gastos · lo que apuntes aquí lo ve el bot y al revés</>}
        extra={
          <>
            <Boton onClick={() => setVerRefs(true)} tipo="fantasma">Precios de referencia</Boton>
            <Boton onClick={() => setNuevo("manual")}>+ Añadir a mano</Boton>
            <Boton tipo="primario" onClick={() => setNuevo("subir")}>⤒ Subir factura</Boton>
          </>
        }
      />

      {/* Filtros: todos en una fila, encima de todo */}
      <div className="lg:sticky lg:top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 mb-5 border-b border-borde bg-bg/95 backdrop-blur px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto scroll-fino">
            {PERIODOS.map((p) => (
              <Chip key={p.k} activo={periodo === p.k} onClick={() => (setPeriodo(p.k), setPagina(1))}>{p.t}</Chip>
            ))}
          </div>
          <span className="hidden sm:block h-5 w-px bg-borde" />
          <div className="flex gap-1.5 overflow-x-auto scroll-fino">
            <Chip activo={!ambito} onClick={() => setAmbito("")}>Todo</Chip>
            {AMBITOS.map((a) => (
              <Chip key={a} activo={ambito === a} onClick={() => setAmbito(ambito === a ? "" : a)}>{a}</Chip>
            ))}
          </div>
          <select aria-label="Categoría" className={inputCls + " !w-auto !py-1 text-xs"} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS.filter((c) => c !== "Ingresos").map((c) => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="Proveedor" className={inputCls + " !w-auto !py-1 text-xs max-w-48"} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Todos los proveedores</option>
            {agrupar(gastos, (m) => m.provKey).map((g) => <option key={g.clave} value={g.clave}>{nombreProv(g.clave)}</option>)}
          </select>
          <input aria-label="Buscar" className={inputCls + " !w-40 !py-1 text-xs"} placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          {dudosos.size > 0 && (
            <Chip activo={sinDudosos} onClick={() => setSinDudosos(!sinDudosos)}>
              {sinDudosos ? "✓ " : ""}Excluir dudosos ({dudosos.size})
            </Chip>
          )}
          {filtroActivo && <Boton pequeno tipo="fantasma" onClick={() => (setAmbito(""), setCategoria(""), setProveedor(""), setTexto(""))}>Quitar filtros</Boton>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Kpi etiqueta={`Gastado · ${PERIODOS.find((p) => p.k === periodo)?.t.toLowerCase()}`} valor={eur0(total)} sub={`${filtrados.length} movimientos`} />
        <Kpi
          etiqueta="Frente al periodo anterior"
          valor={variacion === null ? "—" : pct(variacion)}
          sub={totalAnt ? `antes ${eur0(totalAnt)}` : "sin datos previos"}
          tono={variacion === null ? undefined : variacion > 5 ? "alerta" : variacion < -5 ? "bien" : undefined}
        />
        <Kpi etiqueta="Media al mes" valor={eur0(mediaMes)} sub={`sobre ${mesesConDatos} ${mesesConDatos === 1 ? "mes" : "meses"}`} />
        <Kpi etiqueta="Gastos fijos al mes" valor={eur0(fijoMes)} sub={`${recs.length} pagos que se repiten`} />
        <Kpi etiqueta="Proyección anual" valor={eur0(mediaMes * 12)} sub="a este ritmo" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Tarjeta className="lg:col-span-2" titulo="Evolución mensual por categoría" sub="Pasa el ratón por una barra para ver el desglose. La línea discontinua es tu media.">
          {total > 0 ? (
            <BarrasMes datos={serieGrafica} series={[...CATEGORIAS_COLOR.map((c, i) => ({ clave: c as string, color: i as number | null })), { clave: "Otros", color: null }]} media={mediaMes} />
          ) : (
            <Vacio>No hay gastos con estos filtros.</Vacio>
          )}
        </Tarjeta>
        <Tarjeta titulo="Por categoría" sub="Toca una para filtrar">
          <Ranking
            items={porCat.map((g) => ({
              nombre: g.clave, valor: g.total, clave: g.clave, color: colorSerie(c, idxColor(g.clave)),
              sub: `${g.n} mov. · ${total ? Math.round((g.total / total) * 100) : 0} % del total`,
            }))}
            onClick={(k) => setCategoria(categoria === k ? "" : k)}
          />
        </Tarjeta>
      </div>

      <Tarjeta
        className="mb-4"
        titulo="Análisis: puntos débiles, lo que va bien y dónde pagas de más"
        sub="Calculado sobre todos tus gastos (no solo el periodo). Las comparaciones de precio usan tu pestaña «Referencias precios»."
        extra={<AnalisisIA obtenerResumen={resumenIA} />}
      >
        {pendientesCorreo.length > 0 && (
          <div className="mb-3 rounded-lg bg-card-2 px-3 py-2 text-xs text-txt-2">
            📥 {pendientesCorreo.length} facturas del correo marcadas «revisar» (sin importe claro): {pendientesCorreo.map((f) => `${f.PROVEEDOR} ${f.TOTAL ? f.TOTAL + " €" : ""}`).join(" · ")}
          </div>
        )}
        {hallazgos.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {hallazgos.map((h, i) => (
              <TarjetaHallazgo
                key={i}
                nivel={h.nivel}
                titulo={h.titulo}
                detalle={h.detalle}
                pie={
                  <div className="flex flex-wrap items-center gap-2">
                    {h.impactoAnual ? <span className="text-xs tabular text-txt-3">≈ {eur0(h.impactoAnual)}/año</span> : null}
                    {h.filas?.slice(0, 2).map((f) => {
                      const m = datos.movimientos.find((x) => x.fila === f);
                      return m ? <Boton key={f} pequeno tipo="fantasma" onClick={() => setEditando(m)}>Abrir #G{f}</Boton> : null;
                    })}
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <Vacio>Nada que señalar todavía. Cuantas más facturas metas, más fino el análisis.</Vacio>
        )}
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Tarjeta titulo="Pagos que se repiten" sub="Detectados por fechas e importes, o marcados como recurrentes">
          {recs.length ? (
            <div className="overflow-x-auto scroll-fino -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-txt-3">
                    <th className="px-1 py-1.5 font-medium">Proveedor</th>
                    <th className="px-1 py-1.5 font-medium">Cada</th>
                    <th className="px-1 py-1.5 font-medium text-right">Importe</th>
                    <th className="px-1 py-1.5 font-medium text-right">Al año</th>
                    <th className="px-1 py-1.5 font-medium text-right">Última</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => (
                    <tr key={r.provKey + r.categoria} className="border-t border-borde cursor-pointer hover:bg-card-2" onClick={() => setProvSerie(r.provKey)}>
                      <td className="px-1 py-2">
                        <div className="font-medium truncate max-w-44">{r.proveedor}</div>
                        <div className="text-[11px] text-txt-3">{r.categoria} · próxima ~{r.proximaEstimada ? isoAEs(r.proximaEstimada) : "?"}</div>
                      </td>
                      <td className="px-1 py-2 text-txt-2">{r.periodicidad}</td>
                      <td className="px-1 py-2 text-right tabular">{eur(r.importeTipico)}</td>
                      <td className="px-1 py-2 text-right tabular font-medium">{eur0(r.anualEquivalente)}</td>
                      <td className={`px-1 py-2 text-right tabular text-xs ${r.variacion !== null && r.variacion > 10 ? "text-alerta-txt" : r.variacion !== null && r.variacion < -10 ? "text-bien-txt" : "text-txt-3"}`}>
                        {r.variacion === null ? "—" : pct(r.variacion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-borde font-semibold">
                    <td className="px-1 py-2" colSpan={3}>Total fijos</td>
                    <td className="px-1 py-2 text-right tabular">{eur0(fijoMes * 12)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <Vacio>Cuando un proveedor aparezca dos meses seguidos, saldrá aquí.</Vacio>
          )}
        </Tarjeta>
        <Tarjeta
          titulo="Factura a factura"
          sub="Sube o baja cada recibo. Si apuntas el consumo, sale también el coste por unidad."
          extra={
            <select aria-label="Proveedor de la serie" className={inputCls + " !w-auto !py-1 text-xs max-w-44"} value={provParaSerie} onChange={(e) => setProvSerie(e.target.value)}>
              {agrupar(gastos, (m) => m.provKey).filter((g) => g.n >= 1).map((g) => <option key={g.clave} value={g.clave}>{nombreProv(g.clave)} ({g.n})</option>)}
            </select>
          }
        >
          {serieProv.length ? (
            <>
              <LineaMes datos={serieProv} series={[{ clave: "total", nombre: "Importe de la factura", color: 0 }]} />
              {serieProv.some((s) => s.eurUnidad !== null) && (
                <div className="mt-4">
                  <div className="mb-1 text-xs font-medium text-txt-2">Coste real por unidad consumida (total ÷ consumo)</div>
                  <LineaMes datos={serieProv} series={[{ clave: "eurUnidad", nombre: "€ por unidad", color: 1 }]} alto={160} formato={(n) => n.toLocaleString("es-ES", { maximumFractionDigits: 4 }) + " €"} />
                </div>
              )}
            </>
          ) : (
            <Vacio>Elige un proveedor.</Vacio>
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Tarjeta titulo="Dónde se va el dinero" sub="Proveedores del periodo. Toca para filtrar." className="lg:col-span-1">
          <Ranking
            items={porProv.slice(0, 10).map((g) => ({ nombre: nombreProv(g.clave), valor: g.total, clave: g.clave, sub: `${g.n} ${g.n === 1 ? "cargo" : "cargos"} · media ${eur(g.total / g.n)}` }))}
            onClick={(k) => setProveedor(proveedor === k ? "" : k)}
          />
        </Tarjeta>
        <Tarjeta titulo="Por ámbito" sub="Casa, personal, taller y Flownexion">
          <Ranking items={agrupar(filtrados, (m) => m.ambito).map((g) => ({ nombre: g.clave, valor: g.total, clave: g.clave, sub: `${g.n} mov.` }))} onClick={(k) => setAmbito(ambito === k ? "" : k)} />
        </Tarjeta>
        <Tarjeta titulo="Resumen del periodo" sub={`${isoAEs(desde)} → ${isoAEs(hasta)}`}>
          <dl className="grid gap-2 text-sm">
            {serieMes.slice(-6).reverse().map((m) => (
              <div key={String(m.mes)} className="flex justify-between border-b border-borde pb-1.5 last:border-0">
                <dt className="text-txt-2 capitalize">{mesLargo(String(m.mes))}</dt>
                <dd className="tabular font-medium">{eur(Number(m.total))}</dd>
              </div>
            ))}
          </dl>
        </Tarjeta>
      </div>

      <Tarjeta titulo={`Movimientos (${tabla.length})`} sub="Toca una fila para editarla. «deducida» = categoría puesta por mí; confírmala al editar.">
        {tabla.length ? (
          <>
            <div className="overflow-x-auto scroll-fino -mx-1">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-xs text-txt-3">
                    {(
                      [
                        ["fecha", "Fecha"],
                        ["proveedor", "Proveedor / concepto"],
                      ] as const
                    ).map(([k, t]) => (
                      <th key={k} className="px-1 py-1.5 font-medium">
                        <button onClick={() => setOrden({ k, asc: orden.k === k ? !orden.asc : false })}>{t} {orden.k === k ? (orden.asc ? "↑" : "↓") : ""}</button>
                      </th>
                    ))}
                    <th className="px-1 py-1.5 font-medium">Categoría</th>
                    <th className="px-1 py-1.5 font-medium">Ámbito</th>
                    <th className="px-1 py-1.5 font-medium text-right">
                      <button onClick={() => setOrden({ k: "total", asc: orden.k === "total" ? !orden.asc : false })}>Total {orden.k === "total" ? (orden.asc ? "↑" : "↓") : ""}</button>
                    </th>
                    <th className="px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {tabla.slice(0, pagina * POR_PAG).map((m) => (
                    <tr key={m.fila} className="border-t border-borde hover:bg-card-2 cursor-pointer" onClick={() => setEditando(m)}>
                      <td className="px-1 py-2 tabular text-txt-2 whitespace-nowrap">{isoAEs(m.fecha)}</td>
                      <td className="px-1 py-2">
                        <div className="font-medium truncate max-w-72">{m.proveedor || "—"}</div>
                        <div className="text-[11px] text-txt-3 truncate max-w-72">{m.concepto}</div>
                      </td>
                      <td className="px-1 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorSerie(c, idxColor(m.categoria)) }} />
                          {m.categoria}
                          {m.inferido && <span className="text-[10px] text-txt-3">(deducida)</span>}
                        </span>
                      </td>
                      <td className="px-1 py-2 text-xs text-txt-2">{m.ambito}</td>
                      <td className="px-1 py-2 text-right tabular font-medium">{eur(m.total)}</td>
                      <td className="px-1 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {m.enlace && <a className="text-xs text-acento underline mr-2" href={m.enlace} target="_blank" rel="noreferrer">doc</a>}
                        <button className="text-xs text-txt-3 hover:text-alerta-txt" onClick={() => borrar(m)} aria-label="Borrar">🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tabla.length > pagina * POR_PAG && (
              <div className="mt-3 text-center"><Boton onClick={() => setPagina(pagina + 1)}>Ver más ({tabla.length - pagina * POR_PAG})</Boton></div>
            )}
          </>
        ) : (
          <Vacio>No hay movimientos con estos filtros.</Vacio>
        )}
      </Tarjeta>

      <Modal abierto={!!nuevo} cerrar={() => setNuevo("")} titulo={nuevo === "subir" ? "Subir factura" : "Añadir gasto"}>
        {nuevo && <FormGasto conSubida={nuevo === "subir"} alGuardar={() => (setNuevo(""), recargar())} />}
      </Modal>
      <Modal abierto={!!editando} cerrar={() => setEditando(null)} titulo={editando ? `Editar #G${editando.fila}` : ""}>
        {editando && (
          <FormGasto
            key={editando.fila}
            inicial={desdeMovimiento(editando)}
            fila={editando.fila}
            esperado={{ total: editando.totalCrudo, proveedor: editando.proveedor }}
            alGuardar={() => (setEditando(null), recargar())}
          />
        )}
      </Modal>
      <Modal abierto={verRefs} cerrar={() => setVerRefs(false)} titulo="Precios de referencia del mercado" ancho="max-w-3xl">
        <Referencias refs={datos.referencias} alCambiar={recargar} />
      </Modal>
    </div>
  );
}
