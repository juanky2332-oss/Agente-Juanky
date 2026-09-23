"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ReferenceLine, PieChart, Pie, Cell,
} from "recharts";
import { eur, eur0, mesCorto } from "@/lib/parse";

// Colores resueltos del tema activo (las gráficas SVG necesitan el hex, no la var()).
const VARS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "otros", "grid", "txt", "txt-2", "txt-3", "card", "borde", "acento", "bien", "alerta"] as const;
type Col = Record<(typeof VARS)[number], string>;

export function useColores(): Col {
  const leer = () => {
    const o = {} as Col;
    if (typeof window === "undefined") return o;
    const cs = getComputedStyle(document.documentElement);
    for (const v of VARS) o[v] = cs.getPropertyValue("--" + v).trim();
    return o;
  };
  const [c, setC] = useState<Col>(leer);
  useEffect(() => {
    const act = () => setC(leer());
    act();
    const mo = new MutationObserver(act);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", act);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", act);
    };
  }, []);
  return c;
}

export function colorSerie(c: Col, i: number | null) {
  if (i === null || i < 0 || i > 7) return c.otros;
  return c[("s" + (i + 1)) as "s1"];
}

function CajaTooltip({ titulo, filas, pie }: { titulo: string; filas: { color: string; nombre: string; valor: string }[]; pie?: string }) {
  return (
    <div className="rounded-lg border border-borde bg-card px-3 py-2 text-xs shadow-lg min-w-44">
      <div className="mb-1 font-semibold text-txt">{titulo}</div>
      {filas.map((f) => (
        <div key={f.nombre} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-txt-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: f.color }} />
            {f.nombre}
          </span>
          <span className="tabular text-txt">{f.valor}</span>
        </div>
      ))}
      {pie && <div className="mt-1 border-t border-borde pt-1 font-semibold tabular text-txt flex justify-between"><span>Total</span><span>{pie}</span></div>}
    </div>
  );
}

export function Leyenda({ items }: { items: { nombre: string; color: string; valor?: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.nombre} className="flex items-center gap-1.5 text-xs text-txt-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.nombre}
          {i.valor && <span className="tabular text-txt-3">{i.valor}</span>}
        </span>
      ))}
    </div>
  );
}

const ejeY = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " k€" : v.toLocaleString("es-ES") + " €");

/** Barras apiladas por mes. `series` en orden fijo con su índice de color. */
export function BarrasMes({
  datos, series, alto = 280, media,
}: {
  datos: Record<string, number | string>[];
  series: { clave: string; color: number | null }[];
  alto?: number;
  media?: number;
}) {
  const c = useColores();
  const visibles = series.filter((s) => datos.some((d) => Number(d[s.clave]) > 0));
  return (
    <div>
      {visibles.length > 1 && (
        <Leyenda items={visibles.map((s) => ({ nombre: s.clave, color: colorSerie(c, s.color) }))} />
      )}
      <div style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fill: c["txt-3"], fontSize: 11 }} axisLine={{ stroke: c.borde }} tickLine={false} />
            <YAxis tickFormatter={ejeY} tick={{ fill: c["txt-3"], fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              cursor={{ fill: c.grid, opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const filas = [...payload]
                  .filter((p) => Number(p.value) > 0)
                  .sort((a, b) => Number(b.value) - Number(a.value))
                  .map((p) => ({ color: String(p.color), nombre: String(p.name), valor: eur(Number(p.value)) }));
                const tot = payload.reduce((s, p) => s + Number(p.value || 0), 0);
                return <CajaTooltip titulo={mesCorto(String(label))} filas={filas} pie={filas.length > 1 ? eur(tot) : undefined} />;
              }}
            />
            {media !== undefined && media > 0 && <ReferenceLine y={media} stroke={c["txt-3"]} strokeDasharray="4 4" label={{ value: "media " + eur0(media), fill: c["txt-3"], fontSize: 11, position: "insideTopRight" }} />}
            {visibles.map((s, i) => (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                stackId="a"
                fill={colorSerie(c, s.color)}
                stroke={c.card}
                strokeWidth={1.5}
                radius={i === visibles.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={44}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Barras horizontales en HTML: ranking legible también en el móvil. Una sola tinta (magnitud). */
export function Ranking({
  items, onClick, max, formato = eur, vacio = "Sin datos",
}: {
  items: { nombre: string; valor: number; sub?: ReactNode; color?: string; clave?: string }[];
  onClick?: (clave: string) => void;
  max?: number;
  formato?: (n: number) => string;
  vacio?: string;
}) {
  if (!items.length) return <p className="text-sm text-txt-3">{vacio}</p>;
  const tope = max ?? Math.max(...items.map((i) => i.valor), 1);
  return (
    <ul className="grid gap-2.5">
      {items.map((i) => (
        <li key={i.clave || i.nombre}>
          <button
            type="button"
            onClick={onClick ? () => onClick(i.clave || i.nombre) : undefined}
            className={`group w-full text-left ${onClick ? "cursor-pointer" : "cursor-default"}`}
            title={`${i.nombre}: ${formato(i.valor)}`}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-txt group-hover:underline">{i.nombre}</span>
              <span className="tabular shrink-0 font-medium text-txt">{formato(i.valor)}</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-card-2">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, (i.valor / tope) * 100)}%`, background: i.color || "var(--acento)" }} />
            </div>
            {i.sub && <div className="mt-0.5 text-[11px] text-txt-3">{i.sub}</div>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Línea de evolución (una o dos series de la misma unidad: nunca doble eje). */
export function LineaMes({
  datos, series, alto = 220, formato = eur,
}: {
  datos: Record<string, number | string | null>[];
  series: { clave: string; nombre: string; color: number }[];
  alto?: number;
  formato?: (n: number) => string;
}) {
  const c = useColores();
  return (
    <div>
      {series.length > 1 && <Leyenda items={series.map((s) => ({ nombre: s.nombre, color: colorSerie(c, s.color) }))} />}
      <div style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="mes" tickFormatter={(v) => (/^\d{4}-\d{2}$/.test(String(v)) ? mesCorto(String(v)) : String(v))} tick={{ fill: c["txt-3"], fontSize: 11 }} axisLine={{ stroke: c.borde }} tickLine={false} />
            <YAxis tickFormatter={ejeY} tick={{ fill: c["txt-3"], fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              cursor={{ stroke: c["txt-3"], strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <CajaTooltip
                    titulo={/^\d{4}-\d{2}$/.test(String(label)) ? mesCorto(String(label)) : String(label)}
                    filas={payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => ({ color: String(p.color), nombre: String(p.name), valor: formato(Number(p.value)) }))}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Line key={s.clave} type="linear" dataKey={s.clave} name={s.nombre} stroke={colorSerie(c, s.color)} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.card, fill: colorSerie(c, s.color) }} activeDot={{ r: 6, stroke: c.card, strokeWidth: 2 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Barra de progreso partida (p.ej. cobrado vs pendiente). */
export function BarraPartes({ partes }: { partes: { nombre: string; valor: number; color: string }[] }) {
  const tot = partes.reduce((s, p) => s + p.valor, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-card-2 gap-[2px]">
        {partes.filter((p) => p.valor > 0).map((p) => (
          <div key={p.nombre} style={{ width: `${(p.valor / tot) * 100}%`, background: p.color }} title={`${p.nombre}: ${eur(p.valor)}`} />
        ))}
      </div>
      <Leyenda items={partes.map((p) => ({ nombre: p.nombre, color: p.color, valor: `${eur(p.valor)} · ${Math.round((p.valor / tot) * 100)} %` }))} />
    </div>
  );
}

/**
 * Sectores (donut) para "de qué se compone el total". Máximo 6 porciones: el resto se junta
 * en "Otros" (gris). El color lo decide quien llama (sigue a la entidad, nunca al tamaño).
 * Leyenda con importe y % siempre visible: la identidad nunca va solo por color.
 */
export function Donut({
  items, alto = 220, formato = eur, centro, onClick,
}: {
  items: { nombre: string; valor: number; color: string; clave?: string }[];
  alto?: number;
  formato?: (n: number) => string;
  centro?: { valor: string; etiqueta: string };
  onClick?: (clave: string) => void;
}) {
  const c = useColores();
  const pos = items.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  const top = pos.slice(0, 5);
  const resto = pos.slice(5).reduce((s, i) => s + i.valor, 0);
  const datos = resto > 0 ? [...top, { nombre: "Otros", valor: resto, color: c.otros, clave: "" }] : top;
  const tot = datos.reduce((s, i) => s + i.valor, 0) || 1;
  if (!datos.length) return <p className="text-sm text-txt-3">Sin datos</p>;
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative" style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="62%" outerRadius="92%" paddingAngle={datos.length > 1 ? 1.5 : 0} stroke={c.card} strokeWidth={2} isAnimationActive={false}
              onClick={onClick ? (d: { payload?: { clave?: string; nombre?: string } }) => d?.payload?.clave && onClick(d.payload.clave) : undefined}>
              {datos.map((d) => <Cell key={d.nombre} fill={d.color} cursor={onClick && d.clave ? "pointer" : "default"} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => active && payload?.length ? (
              <CajaTooltip titulo={String(payload[0].name)} filas={[{ color: String((payload[0].payload as { color: string }).color), nombre: `${Math.round((Number(payload[0].value) / tot) * 100)} % del total`, valor: formato(Number(payload[0].value)) }]} />
            ) : null} />
          </PieChart>
        </ResponsiveContainer>
        {centro && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div><div className="text-lg font-semibold tabular text-txt">{centro.valor}</div><div className="text-[11px] text-txt-3">{centro.etiqueta}</div></div>
          </div>
        )}
      </div>
      <ul className="grid gap-1.5 text-xs">
        {datos.map((d) => (
          <li key={d.nombre}>
            <button type="button" disabled={!onClick || !d.clave} onClick={() => onClick && d.clave && onClick(d.clave)} className="flex w-full items-center justify-between gap-2 text-left enabled:hover:underline">
              <span className="flex min-w-0 items-center gap-1.5 text-txt-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} /><span className="truncate">{d.nombre}</span></span>
              <span className="shrink-0 tabular text-txt">{formato(d.valor)} <span className="text-txt-3">· {Math.round((d.valor / tot) * 100)} %</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras simples de una serie (un color): p.ej. gasto mensual de una sola categoría. */
export function BarrasSimples({ datos, clave, color, alto = 240, media, formato = eur, etiquetaX }: {
  datos: Record<string, number | string | null>[]; clave: string; color: string; alto?: number; media?: number; formato?: (n: number) => string; etiquetaX?: (v: string) => string;
}) {
  const c = useColores();
  const fx = etiquetaX || ((v: string) => (/^d{4}-d{2}$/.test(v) ? mesCorto(v) : v));
  return (
    <div style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="mes" tickFormatter={(v) => fx(String(v))} tick={{ fill: c["txt-3"], fontSize: 11 }} axisLine={{ stroke: c.borde }} tickLine={false} />
          <YAxis tickFormatter={ejeY} tick={{ fill: c["txt-3"], fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip cursor={{ fill: c.grid, opacity: 0.6 }} content={({ active, payload, label }) => active && payload?.length ? (
            <CajaTooltip titulo={fx(String(label))} filas={[{ color, nombre: String(payload[0].name), valor: formato(Number(payload[0].value)) }]} />
          ) : null} />
          {media !== undefined && media > 0 && <ReferenceLine y={media} stroke={c["txt-3"]} strokeDasharray="4 4" label={{ value: "media " + formato(media), fill: c["txt-3"], fontSize: 11, position: "insideTopRight" }} />}
          <Bar dataKey={clave} name={clave} fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
