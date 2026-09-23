"use client";
// Análisis de UNA categoría (luz, gas, agua, suscripciones...): barras por mes, sectores
// (peso en tu gasto y reparto por proveedor), consumo y coste real por unidad, recibo a recibo
// y conclusiones calculadas aquí mismo. Nada de cifras de la IA.
import { Tarjeta, Kpi, TarjetaHallazgo, Vacio } from "../ui";
import { BarrasSimples, Donut, LineaMes, useColores, colorSerie } from "../graficas";
import { CATEGORIAS_COLOR, agrupar, sumar, porMes, type Movimiento, type Referencia } from "@/lib/finanzas";
import { eur, eur0, pct, isoAEs, mesLargo } from "@/lib/parse";

interface ProgramadoLite { nombre: string; categoria: string; importe: number; periodicidad: string; proxima: string | null; modo: string; activo: boolean }

const CON_CONSUMO: Record<string, string> = { Luz: "kWh", Gas: "kWh", Agua: "m3" };

export default function PanelCategoria({
  categoria, todos, desde, hasta, meses, referencias, programados, abrir,
}: {
  categoria: string;
  todos: Movimiento[]; // todos los gastos (con fecha), sin filtrar por periodo
  desde: string;
  hasta: string;
  meses: string[];
  referencias: Referencia[];
  programados: ProgramadoLite[];
  abrir: (m: Movimiento) => void;
}) {
  const c = useColores();
  const i = (CATEGORIAS_COLOR as readonly string[]).indexOf(categoria);
  const color = colorSerie(c, i >= 0 ? i : null);
  const enCat = todos.filter((m) => m.categoria === categoria).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const periodo = enCat.filter((m) => m.fecha >= desde && m.fecha <= hasta);
  const totalPeriodo = sumar(todos.filter((m) => m.fecha >= desde && m.fecha <= hasta));
  const total = sumar(periodo);
  const serie = porMes(periodo, meses).map((r) => ({ mes: String(r.mes), [categoria]: Number(r.total) }));
  const mesesCon = serie.filter((s) => Number(s[categoria]) > 0).length;
  const mediaMes = total / Math.max(1, meses.length);
  const mediaRecibo = periodo.length ? total / periodo.length : 0;
  const ult = enCat[enCat.length - 1];
  const ant = enCat[enCat.length - 2];
  const varUlt = ult && ant && ant.total > 0 ? ((ult.total - ant.total) / ant.total) * 100 : null;
  const unidad = CON_CONSUMO[categoria];
  const conConsumo = enCat.filter((m) => m.consumo && m.consumo > 0);
  const consumoPeriodo = periodo.reduce((s, m) => s + (m.consumo || 0), 0);
  const costeUnidad = conConsumo.length ? sumar(conConsumo) / conConsumo.reduce((s, m) => s + (m.consumo || 0), 0) : null;
  const serieRecibos = enCat.map((m) => ({
    mes: isoAEs(m.fecha).slice(0, 5) + "/" + m.fecha.slice(2, 4),
    total: m.total,
    consumo: m.consumo,
    eurUnidad: m.consumo ? +(m.total / m.consumo).toFixed(4) : null,
  }));
  const porProv = agrupar(periodo, (m) => m.provKey);
  const nombre = (k: string) => periodo.find((m) => m.provKey === k)?.proveedor || k;
  const prog = programados.filter((p) => p.activo && p.categoria === categoria);

  // Conclusiones (todas calculadas)
  const H: { nivel: "alerta" | "aviso" | "bien" | "info"; titulo: string; detalle: string }[] = [];
  if (ult && varUlt !== null && Math.abs(varUlt) >= 15)
    H.push({
      nivel: varUlt > 0 ? "aviso" : "bien",
      titulo: `Último recibo ${pct(varUlt)} frente al anterior`,
      detalle: `${ult.proveedor}: ${eur(ult.total)} (${isoAEs(ult.fecha)}) frente a ${eur(ant!.total)} (${isoAEs(ant!.fecha)}).${unidad && ult.consumo && ant!.consumo ? ` El consumo pasó de ${ant!.consumo} a ${ult.consumo} ${unidad}: ${ult.consumo > ant!.consumo * 1.1 ? "es consumo, no precio" : "no es solo consumo, mira el precio"}.` : ""}`,
    });
  if (unidad && conConsumo.length >= 2) {
    const caro = [...conConsumo].sort((a, b) => b.total / b.consumo! - a.total / a.consumo!)[0];
    const barato = [...conConsumo].sort((a, b) => a.total / a.consumo! - b.total / b.consumo!)[0];
    H.push({
      nivel: "info",
      titulo: `Coste real medio: ${costeUnidad!.toLocaleString("es-ES", { maximumFractionDigits: 3 })} €/${unidad}`,
      detalle: `Todo incluido (energía, potencia, impuestos y extras) ÷ consumo. El recibo más caro por ${unidad} fue ${isoAEs(caro.fecha)} (${(caro.total / caro.consumo!).toFixed(3)} €) y el más barato ${isoAEs(barato.fecha)} (${(barato.total / barato.consumo!).toFixed(3)} €). En recibos con poco consumo el fijo (potencia, alquiler de contador) pesa mucho más.`,
    });
  }
  const extras = new Map<string, number>();
  for (const m of enCat) {
    const cx = (m.detalle?.cargos_extra as { concepto: string; importe: number }[] | undefined) || [];
    for (const x of cx) extras.set(x.concepto, (extras.get(x.concepto) || 0) + (Number(x.importe) || 0));
    if (/servicio expr[eé]s|mantenimiento|asistencia|seguro/i.test(m.concepto) && !cx.length) extras.set("Servicio añadido (según el concepto)", extras.get("Servicio añadido (según el concepto)") || 0);
  }
  if (extras.size)
    H.push({
      nivel: "aviso",
      titulo: "Tus facturas llevan servicios añadidos",
      detalle: [...extras.entries()].map(([k, v]) => `${k}${v ? ` (${eur(v)} en total)` : ""}`).join(" · ") + ". Son cargos que no son consumo: si no los usas, se pueden quitar llamando a la compañía.",
    });
  for (const r of referencias.filter((r) => r.categoria === categoria)) {
    if (r.metrica === "cuota_mensual" && mesesCon) {
      const v = mediaMes;
      H.push({ nivel: v <= r.buenoHasta ? "bien" : v >= r.caroDesde ? "alerta" : "aviso", titulo: `Media ${eur(v)}/mes frente al mercado`, detalle: `Referencia: bueno hasta ${r.buenoHasta} ${r.unidad}, caro desde ${r.caroDesde} ${r.unidad}. Fuente: ${r.fuente} (${r.fecha}).` });
    }
  }
  if (prog.length)
    H.push({
      nivel: "info",
      titulo: "Lo que viene",
      detalle: prog.map((p) => `${p.nombre}: ~${eur(p.importe)} ${p.periodicidad}${p.proxima ? `, próximo hacia el ${isoAEs(p.proxima)}` : ""}${p.modo === "correo" ? " (llega por correo)" : " (se apunta solo)"}`).join(" · "),
    });
  if (!H.length && enCat.length) H.push({ nivel: "info", titulo: "Sin sorpresas", detalle: "No veo subidas raras ni cargos extra en esta categoría." });

  if (!enCat.length) return <Vacio>No hay gastos de {categoria.toLowerCase()} todavía.</Vacio>;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi etiqueta={`${categoria} en el periodo`} valor={eur0(total)} sub={`${periodo.length} recibos · ${totalPeriodo ? Math.round((total / totalPeriodo) * 100) : 0} % de tu gasto`} />
        <Kpi etiqueta="Media al mes" valor={eur0(mediaMes)} sub={`≈ ${eur0(mediaMes * 12)} al año`} />
        <Kpi etiqueta="Media por recibo" valor={eur(mediaRecibo)} sub={periodo.length ? `de ${eur(Math.min(...periodo.map((m) => m.total)))} a ${eur(Math.max(...periodo.map((m) => m.total)))}` : ""} />
        <Kpi etiqueta="Último recibo" valor={ult ? eur(ult.total) : "—"} sub={ult ? `${isoAEs(ult.fecha)}${varUlt !== null ? " · " + pct(varUlt) : ""}` : ""} tono={varUlt === null ? undefined : varUlt > 15 ? "alerta" : varUlt < -15 ? "bien" : undefined} />
        {unidad ? (
          <Kpi etiqueta={`Consumo en el periodo`} valor={consumoPeriodo ? `${Math.round(consumoPeriodo).toLocaleString("es-ES")} ${unidad}` : "—"} sub={costeUnidad ? `${costeUnidad.toLocaleString("es-ES", { maximumFractionDigits: 3 })} €/${unidad} real` : "sube facturas con consumo"} />
        ) : (
          <Kpi etiqueta="Proveedores" valor={porProv.length} sub={porProv.slice(0, 2).map((g) => nombre(g.clave)).join(" · ")} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta className="lg:col-span-3" titulo={`${categoria} mes a mes`} sub="La línea discontinua es tu media mensual del periodo">
          <BarrasSimples datos={serie} clave={categoria} color={color} media={mediaMes} />
        </Tarjeta>
        <Tarjeta className="lg:col-span-2" titulo="¿Cuánto pesa?" sub={`${categoria} frente al resto de tus gastos del periodo`}>
          <Donut
            alto={190}
            centro={{ valor: `${totalPeriodo ? Math.round((total / totalPeriodo) * 100) : 0} %`, etiqueta: "de tu gasto" }}
            items={[{ nombre: categoria, valor: total, color }, { nombre: "Resto de gastos", valor: Math.max(0, totalPeriodo - total), color: c.otros }]}
          />
          {porProv.length > 1 && (
            <div className="mt-4 border-t border-borde pt-3">
              <div className="mb-2 text-xs font-medium text-txt-2">Por proveedor</div>
              <Donut alto={150} items={porProv.map((g, k) => ({ nombre: nombre(g.clave), valor: g.total, color: colorSerie(c, (i + k + 1) % 8) }))} />
            </div>
          )}
        </Tarjeta>
      </div>

      {unidad && conConsumo.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta titulo={`Consumo por recibo (${unidad})`} sub="Lo que gastas de verdad, sin el efecto del precio">
            <BarrasSimples datos={serieRecibos.filter((s) => s.consumo)} clave="consumo" color={color} alto={200} formato={(n) => `${n.toLocaleString("es-ES")} ${unidad}`} etiquetaX={(v) => v} />
          </Tarjeta>
          <Tarjeta titulo={`Coste real por ${unidad}`} sub="Total del recibo ÷ consumo. Si sube sin que suba el consumo, te han subido el precio">
            <LineaMes datos={serieRecibos.filter((s) => s.eurUnidad)} series={[{ clave: "eurUnidad", nombre: `€/${unidad}`, color: i >= 0 ? i : 0 }]} alto={200} formato={(n) => n.toLocaleString("es-ES", { maximumFractionDigits: 3 }) + " €"} />
          </Tarjeta>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta className="lg:col-span-2" titulo="Conclusiones">
          <div className="grid gap-3">{H.map((h, k) => <TarjetaHallazgo key={k} {...h} />)}</div>
        </Tarjeta>
        <Tarjeta className="lg:col-span-3" titulo={`Recibo a recibo (${enCat.length})`} sub="Toca uno para verlo o corregirlo">
          <div className="overflow-x-auto scroll-fino -mx-1">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-xs text-txt-3">
                  <th className="px-1 py-1.5 font-medium">Fecha</th><th className="px-1 font-medium">Proveedor</th>
                  {unidad && <th className="px-1 text-right font-medium">Consumo</th>}
                  <th className="px-1 text-right font-medium">Importe</th><th className="px-1 text-right font-medium">vs anterior</th><th />
                </tr>
              </thead>
              <tbody>
                {[...enCat].reverse().map((m, k, arr) => {
                  const prev = arr[k + 1];
                  const v = prev && prev.total > 0 ? ((m.total - prev.total) / prev.total) * 100 : null;
                  return (
                    <tr key={m.fila} className="border-t border-borde hover:bg-card-2 cursor-pointer" onClick={() => abrir(m)}>
                      <td className="px-1 py-2 tabular text-txt-2 whitespace-nowrap">{isoAEs(m.fecha)}</td>
                      <td className="px-1 py-2"><div className="truncate max-w-52">{m.proveedor}</div>{/estimad/i.test(m.notas) && <div className="text-[11px] text-aviso-txt">importe estimado</div>}</td>
                      {unidad && <td className="px-1 py-2 text-right tabular text-txt-2">{m.consumo ? `${m.consumo} ${unidad}` : "—"}</td>}
                      <td className="px-1 py-2 text-right tabular font-medium">{eur(m.total)}</td>
                      <td className={`px-1 py-2 text-right tabular text-xs ${v === null ? "text-txt-3" : v > 10 ? "text-alerta-txt" : v < -10 ? "text-bien-txt" : "text-txt-3"}`}>{v === null ? "—" : pct(v)}</td>
                      <td className="px-1 py-2 text-right" onClick={(e) => e.stopPropagation()}>{m.enlace && <a className="text-xs text-acento underline" href={m.enlace} target="_blank" rel="noreferrer">{/drive/.test(m.enlace) ? "PDF" : "correo"}</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-txt-3">Periodo seleccionado: {mesLargo(desde.slice(0, 7))} → {mesLargo(hasta.slice(0, 7))}</p>
        </Tarjeta>
      </div>
    </div>
  );
}
