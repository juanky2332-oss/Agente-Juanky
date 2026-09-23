"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Cargando, FalloCarga, Titulo, Chip, Vacio, inputCls, Kpi, Boton, llamar, avisar } from "@/components/ui";
import FiltrosCorreo, { type FiltroApi } from "@/components/gastos/FiltrosCorreo";
import { GRUPOS, type Grupo, type Mensaje } from "@/lib/correo";
import { normaliza, num, eur } from "@/lib/parse";

type R = Record<string, string> & { fila: number };
type Personal = Mensaje & { grupo: Grupo; ruido: boolean };
interface Datos { flownexion: R[]; personal: Personal[]; errorGmail: string; facturas: R[]; filtros: FiltroApi[]; dias: number }
interface Resumen { titular: string; acciones: { que: string; de: string; prioridad: string; cuando?: string }[]; info: string[] }

const PRIO: Record<string, string> = { alta: "🔴", media: "🟡", baja: "⚪" };

function CajaResumen({ r, cerrar }: { r: Resumen; cerrar: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-acento/40 bg-acento-suave p-4">
      <div className="flex items-start justify-between gap-3"><p className="font-semibold">✦ {r.titular}</p><Boton pequeno tipo="fantasma" onClick={cerrar}>✕</Boton></div>
      {r.acciones?.length > 0 && (
        <ul className="mt-2 grid gap-1.5 text-sm">
          {r.acciones.map((a, i) => <li key={i}>{PRIO[a.prioridad] || "•"} <b>{a.que}</b> <span className="text-txt-3">— {a.de}{a.cuando ? ` · ${a.cuando}` : ""}</span></li>)}
        </ul>
      )}
      {r.info?.length > 0 && <ul className="mt-2 grid gap-1 text-xs text-txt-2">{r.info.map((x, i) => <li key={i}>💡 {x}</li>)}</ul>}
    </div>
  );
}

export default function Correo() {
  const [dias, setDias] = useState(14);
  const { datos, error, cargando, recargar } = useApi<Datos>(`/api/correo?dias=${dias}`);
  const [vista, setVista] = useState<"personal" | "flownexion" | "facturas" | "filtros">("personal");
  const [grupo, setGrupo] = useState<Grupo | "">("");
  const [verRuido, setVerRuido] = useState(false);
  const [remitente, setRemitente] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [resumiendo, setResumiendo] = useState(false);

  const personal = useMemo(() => (datos?.personal || []).filter((m) => (verRuido || !m.ruido) && (!grupo || m.grupo === grupo) && (!q || normaliza(`${m.de} ${m.asunto} ${m.resumen}`).includes(normaliza(q)))), [datos, verRuido, grupo, q]);
  const flow = useMemo(() => (datos?.flownexion || []).filter((c) => (!remitente || c.DE === remitente) && (!q || normaliza(`${c.DE} ${c.CORREO} ${c.ASUNTO} ${c.RESUMEN}`).includes(normaliza(q)))), [datos, remitente, q]);
  const remitentes = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of datos?.flownexion || []) m.set(c.DE, (m.get(c.DE) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [datos]);

  if (cargando && !datos) return <Cargando texto="Leyendo tus dos buzones…" />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  if (!datos) return null;

  const utiles = datos.personal.filter((m) => !m.ruido);
  const ruido = datos.personal.length - utiles.length;
  const guardadas = datos.facturas.filter((f) => f.ESTADO === "guardado");
  const altas = datos.flownexion.filter((c) => /alta/i.test(c.PRIORIDAD || "")).length;

  const resumir = async (buzon: "personal" | "flownexion") => {
    setResumiendo(true);
    try {
      const correos = buzon === "personal"
        ? utiles.slice(0, 50).map((m) => ({ de: m.de, asunto: m.asunto, resumen: m.resumen, fecha: m.fecha }))
        : datos.flownexion.slice(0, 40).map((c) => ({ de: c.DE, asunto: c.ASUNTO, resumen: c.RESUMEN || c.CUERPO?.slice(0, 300), fecha: c.FECHA }));
      setResumen(await llamar<Resumen>("/api/correo", "POST", { buzon, correos }));
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setResumiendo(false);
    }
  };

  return (
    <div>
      <Titulo titulo="Correo" sub="Dos buzones separados: el personal (juanky2332@gmail.com, en vivo) y el de empresa (juancarlos@flownexion.com, archivo del bot)." />

      <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ["personal", "👤 Personal", `${utiles.length} útiles`, `${ruido} de publicidad ocultos`],
          ["flownexion", "🏢 Flownexion", `${datos.flownexion.length} correos`, `${altas} de prioridad alta`],
          ["facturas", "💶 Facturas cazadas", `${guardadas.length} apuntadas`, eur(guardadas.reduce((s, f) => s + num(f.TOTAL), 0))],
          ["filtros", "⚙️ Qué leo del correo", `${datos.filtros.length} proveedores`, "lista blanca de facturas"],
        ] as const).map(([k, t, v, s]) => (
          <button key={k} onClick={() => (setVista(k), setResumen(null), setQ(""))} className={`rounded-2xl border p-4 text-left transition ${vista === k ? "border-acento bg-acento-suave" : "border-borde bg-card hover:bg-card-2"}`}>
            <div className={`text-xs font-medium ${vista === k ? "text-acento" : "text-txt-3"}`}>{t}</div>
            <div className="mt-1 text-xl font-semibold tabular">{v}</div>
            <div className="mt-0.5 text-xs text-txt-3">{s}</div>
          </button>
        ))}
      </div>

      {resumen && <CajaResumen r={resumen} cerrar={() => setResumen(null)} />}

      {vista === "personal" && (
        <Tarjeta
          titulo={`Personal · últimos ${datos.dias} días`}
          sub="Clasificado por temas; la publicidad y los boletines se esconden solos"
          extra={<Boton pequeno tipo="primario" disabled={resumiendo || !utiles.length} onClick={() => resumir("personal")}>{resumiendo ? "Leyendo…" : "✦ ¿Qué hay importante?"}</Boton>}
        >
          {datos.errorGmail && <p className="mb-3 rounded-lg bg-card-2 p-2 text-xs text-alerta-txt">No he podido leer Gmail ahora: {datos.errorGmail}</p>}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Chip activo={!grupo} onClick={() => setGrupo("")}>Todo ({utiles.length})</Chip>
            {GRUPOS.map((g) => {
              const n = utiles.filter((m) => m.grupo === g.k).length;
              return n ? <Chip key={g.k} activo={grupo === g.k} onClick={() => setGrupo(grupo === g.k ? "" : g.k)}>{g.ico} {g.t} ({n})</Chip> : null;
            })}
            <Chip activo={verRuido} onClick={() => setVerRuido(!verRuido)}>{verRuido ? "✓ " : ""}Ver publicidad ({ruido})</Chip>
            <select aria-label="Días" className={inputCls + " !w-auto !py-1 text-xs"} value={dias} onChange={(e) => setDias(+e.target.value)}>
              {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} días</option>)}
            </select>
            <input className={inputCls + " !w-36 !py-1 text-xs"} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {personal.length ? (
            <ul className="divide-y divide-borde">
              {personal.map((m) => {
                const g = GRUPOS.find((x) => x.k === m.grupo)!;
                return (
                  <li key={m.id} className={`py-2.5 ${m.ruido ? "opacity-60" : ""}`}>
                    <div className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{g.ico} {m.de.replace(/<.*>/, "").trim() || m.de}</span>
                      <span className="shrink-0 text-[11px] text-txt-3">{new Date(m.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                    </div>
                    <div className="truncate text-sm text-txt-2">{m.etiquetas?.includes("UNREAD") && <span className="mr-1 text-acento">●</span>}{m.asunto}</div>
                    <div className="truncate text-xs text-txt-3">{m.resumen}</div>
                    <a className="text-[11px] text-acento underline" href={`https://mail.google.com/mail/u/0/#all/${m.id}`} target="_blank" rel="noreferrer">Abrir en Gmail</a>
                  </li>
                );
              })}
            </ul>
          ) : <Vacio>Nada con este filtro.</Vacio>}
        </Tarjeta>
      )}

      {vista === "flownexion" && (
        <Tarjeta
          titulo="Flownexion (empresa)"
          sub="Cada correo que entra lo resume la IA y te avisa por Telegram al momento"
          extra={<Boton pequeno tipo="primario" disabled={resumiendo || !datos.flownexion.length} onClick={() => resumir("flownexion")}>{resumiendo ? "Leyendo…" : "✦ ¿Qué tengo pendiente?"}</Boton>}
        >
          <div className="mb-3 grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Kpi etiqueta="Quién más escribe" valor={<span className="text-base">{remitentes[0]?.[0] || "—"}</span>} sub={remitentes[0] ? `${remitentes[0][1]} correos` : ""} />
            <Kpi etiqueta="Prioridad alta" valor={altas} tono={altas ? "aviso" : "bien"} />
            <Kpi etiqueta="Con acción pedida" valor={datos.flownexion.filter((c) => (c.ACCION || "").trim() && !/ninguna|no requiere/i.test(c.ACCION)).length} />
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip activo={!remitente} onClick={() => setRemitente("")}>Todos</Chip>
            {remitentes.slice(0, 8).map(([r, n]) => <Chip key={r} activo={remitente === r} onClick={() => setRemitente(remitente === r ? "" : r)}>{r} ({n})</Chip>)}
            <input className={inputCls + " !w-36 !py-1 text-xs"} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {flow.length ? (
            <ul className="divide-y divide-borde">
              {flow.slice(0, 150).map((c) => (
                <li key={c.fila} className="py-2.5">
                  <button className="w-full text-left" onClick={() => setAbierto(abierto === String(c.fila) ? null : String(c.fila))}>
                    <div className="flex justify-between gap-3">
                      <span className="truncate text-sm font-medium">{PRIO[(c.PRIORIDAD || "").toLowerCase()] || "⚪"} {c.DE}</span>
                      <span className="shrink-0 text-[11px] text-txt-3">{c.FECHA}</span>
                    </div>
                    <div className="truncate text-sm text-txt-2">{c.ASUNTO}</div>
                    {c.RESUMEN && <div className="truncate text-xs text-txt-3">{c.RESUMEN}</div>}
                  </button>
                  {abierto === String(c.fila) && (
                    <div className="mt-2 rounded-lg bg-card-2 p-3 text-xs">
                      {c.ACCION && <p className="mb-2 font-medium">👉 {c.ACCION}</p>}
                      <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-sans text-txt-2">{c.CUERPO}</pre>
                      <a href={`mailto:${c.CORREO}?subject=${encodeURIComponent("Re: " + c.ASUNTO)}`} className="mt-2 inline-block text-acento underline">Responder</a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : <Vacio>Sin correos.</Vacio>}
        </Tarjeta>
      )}

      {vista === "facturas" && (
        <Tarjeta titulo="Facturas que he mirado en el correo" sub="Guardado = apuntado en Gastos · duplicado = ya lo tenías · descartado = no era un cargo">
          {datos.facturas.length ? (
            <div className="overflow-x-auto scroll-fino">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-txt-3"><th className="py-1.5">Alta</th><th>Remitente / asunto</th><th>Proveedor</th><th className="text-right">Total</th><th>Estado</th></tr></thead>
                <tbody>
                  {datos.facturas.filter((f) => f.REMITENTE).map((f) => (
                    <tr key={f.fila} className="border-t border-borde">
                      <td className="whitespace-nowrap py-2 text-xs text-txt-3">{f.FECHA_ALTA}</td>
                      <td className="py-2"><div className="max-w-64 truncate">{f.REMITENTE}</div><div className="max-w-64 truncate text-[11px] text-txt-3">{f.ASUNTO}</div></td>
                      <td className="py-2 text-xs">{f.PROVEEDOR}</td>
                      <td className="py-2 text-right tabular">{f.TOTAL && num(f.TOTAL) ? eur(num(f.TOTAL)) : "—"}</td>
                      <td className="py-2 text-xs"><span className={f.ESTADO === "guardado" ? "text-bien-txt" : f.ESTADO === "revisar" ? "text-aviso-txt" : "text-txt-3"}>{f.ESTADO}</span>{f.ENLACE && <a href={f.ENLACE} target="_blank" rel="noreferrer" className="ml-2 text-acento underline">ver</a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Vacio>Sin facturas.</Vacio>}
        </Tarjeta>
      )}

      {vista === "filtros" && (
        <Tarjeta titulo="Proveedores que leo del correo" sub="Cada mañana a las 7:50 miro juanky2332@gmail.com y SOLO apunto las facturas de esta lista (con su PDF en Drive). Lo demás lo pones tú a mano.">
          <FiltrosCorreo filtros={datos.filtros} alCambiar={recargar} />
        </Tarjeta>
      )}
    </div>
  );
}
