"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Chip, Vacio, llamar, avisar, inputCls, Kpi, Modal, Campo } from "@/components/ui";
import type { Nota } from "@/lib/datos";
import { normaliza } from "@/lib/parse";

const TIPOS_TAREA = ["tarea", "recordatorio", "recurrente", "pendiente"];

function aLocal(ms: number | null) {
  if (!ms) return "";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function cuanto(ms: number) {
  const dif = ms - Date.now();
  const abs = Math.abs(dif);
  const t = abs < 3600000 ? `${Math.round(abs / 60000)} min` : abs < 86400000 ? `${Math.round(abs / 3600000)} h` : `${Math.round(abs / 86400000)} d`;
  return dif < 0 ? `hace ${t}` : `en ${t}`;
}

export default function Tareas() {
  const { datos, error, cargando, recargar } = useApi<{ notas: Nota[] }>("/api/tareas");
  const [vista, setVista] = useState<"abiertas" | "notas" | "cerradas" | "todas">("abiertas");
  const [texto, setTexto] = useState("");
  const [nueva, setNueva] = useState("");
  const [cuando, setCuando] = useState("");
  const [repite, setRepite] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<Nota | null>(null);
  const [edTexto, setEdTexto] = useState("");
  const [edCuando, setEdCuando] = useState("");

  const notas = useMemo(() => datos?.notas || [], [datos]);
  const [ahora] = useState(() => Date.now());
  const lista = useMemo(() => {
    const q = normaliza(texto);
    return notas
      .filter((n) => {
        const esTarea = TIPOS_TAREA.includes(n.tipo.toLowerCase());
        if (vista === "abiertas" && !(esTarea && n.abierta)) return false;
        if (vista === "notas" && esTarea) return false;
        if (vista === "cerradas" && n.abierta) return false;
        return !q || normaliza(n.contenido).includes(q);
      })
      .sort((a, b) => (a.vence ?? 9e15) - (b.vence ?? 9e15) || b.fila - a.fila);
  }, [notas, vista, texto]);

  const abiertas = notas.filter((n) => n.abierta && TIPOS_TAREA.includes(n.tipo.toLowerCase()));
  const vencidas = abiertas.filter((n) => n.vence !== null && n.vence < ahora);
  const semana = abiertas.filter((n) => n.vence !== null && n.vence >= ahora && n.vence < ahora + 7 * 86400000);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nueva.trim()) return;
    setEnviando(true);
    try {
      const contenido = nueva.trim() + (repite ? ` [${repite}]` : "");
      const r = await llamar<{ programado?: string }>("/api/tareas", "POST", { contenido, tipo: cuando ? "recordatorio" : "tarea", vencimiento: cuando || undefined });
      avisar(r.programado ? `Guardada. Te aviso por Telegram el ${r.programado}` : "Tarea guardada");
      setNueva(""); setCuando(""); setRepite("");
      setTimeout(recargar, cuando ? 2500 : 0); // el despertador escribe la fila por detrás
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  const cambiar = async (n: Nota, cambios: Record<string, unknown>, ok: string) => {
    try {
      const r = await llamar<{ aviso?: string }>("/api/tareas", "PATCH", { fila: n.fila, esperado: n.contenido, ...cambios });
      avisar(r.aviso || ok);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const posponer = (n: Nota, ms: number) => {
    const base = ms === 0 ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); })() : Date.now() + ms;
    cambiar(n, { vencimiento: aLocal(base) }, "Pospuesta");
  };
  const borrar = async (n: Nota) => {
    if (!confirm(`¿Borrar «${n.contenido.slice(0, 60)}»? (Si solo quieres quitarla de la lista, mejor «Anular».)`)) return;
    try {
      await llamar(`/api/tareas?fila=${n.fila}&esperado=${encodeURIComponent(n.contenido)}`, "DELETE");
      avisar("Borrada");
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;

  return (
    <div>
      <Titulo titulo="Tareas y notas" sub="La hoja «Notas Juanky» del bot. Con hora, el aviso te llega a Telegram a su hora exacta (el mismo despertador del bot)." />
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Kpi etiqueta="Abiertas" valor={abiertas.length} />
        <Kpi etiqueta="Vencidas" valor={vencidas.length} tono={vencidas.length ? "alerta" : "bien"} sub={vencidas.length ? "revísalas" : "al día"} />
        <Kpi etiqueta="Próximos 7 días" valor={semana.length} />
      </div>

      <Tarjeta className="mb-4" titulo="Nueva tarea o recordatorio">
        <form onSubmit={crear} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end">
          <Campo etiqueta="¿Qué hay que hacer?">
            <input className={inputCls} value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Pasar la ITV, llamar al gestor…" />
          </Campo>
          <Campo etiqueta="Avísame (opcional)">
            <input type="datetime-local" className={inputCls} value={cuando} onChange={(e) => setCuando(e.target.value)} />
          </Campo>
          <Campo etiqueta="Se repite">
            <select className={inputCls} value={repite} onChange={(e) => setRepite(e.target.value)}>
              <option value="">No</option>
              {["semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </Campo>
          <Boton type="submit" tipo="primario" disabled={enviando || !nueva.trim()}>{enviando ? "Guardando…" : "Añadir"}</Boton>
        </form>
      </Tarjeta>

      <Tarjeta
        titulo={`${lista.length} ${vista === "notas" ? "notas" : "elementos"}`}
        extra={
          <div className="flex flex-wrap gap-1.5">
            {([["abiertas", "Tareas abiertas"], ["notas", "Notas"], ["cerradas", "Cerradas"], ["todas", "Todo"]] as const).map(([k, t]) => (
              <Chip key={k} activo={vista === k} onClick={() => setVista(k)}>{t}</Chip>
            ))}
            <input className={inputCls + " !w-36 !py-1 text-xs"} placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        }
      >
        {lista.length ? (
          <ul className="divide-y divide-borde">
            {lista.map((n) => {
              const vencida = n.abierta && n.vence !== null && n.vence < ahora;
              return (
                <li key={n.fila} className="flex flex-wrap items-start gap-3 py-3">
                  {n.abierta && TIPOS_TAREA.includes(n.tipo.toLowerCase()) ? (
                    <button onClick={() => cambiar(n, { estado: "hecha" }, n.recurrente ? "Hecha: reprogramada la siguiente" : "¡Hecha!")} className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-borde hover:border-bien" aria-label="Marcar hecha" title="Marcar hecha" />
                  ) : (
                    <span className="mt-0.5 h-5 w-5 shrink-0 text-center text-xs">{n.estado === "hecha" ? "✅" : n.estado === "cancelada" ? "🚫" : "📝"}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm [overflow-wrap:anywhere] ${!n.abierta ? "text-txt-3 line-through" : ""}`}>{n.contenido}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-txt-3">
                      <span>#{n.fila}</span>
                      <span>{n.tipo}</span>
                      {n.vencimiento && <span className={vencida ? "text-alerta-txt font-semibold" : ""}>⏰ {n.vencimiento}{n.vence ? ` (${cuanto(n.vence)})` : ""}</span>}
                      {n.recurrente && <span>🔁 {n.recurrente}</span>}
                      {n.estado && n.estado !== "pendiente" && <span>{n.estado}</span>}
                      <span>creada {n.fecha}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {n.abierta && TIPOS_TAREA.includes(n.tipo.toLowerCase()) && (
                      <>
                        <Boton pequeno tipo="fantasma" onClick={() => posponer(n, 3600000)} title="Posponer 1 hora">🕐 +1h</Boton>
                        <Boton pequeno tipo="fantasma" onClick={() => posponer(n, 0)} title="Mañana a las 9:00">📅 Mañana</Boton>
                        <Boton pequeno tipo="fantasma" onClick={() => cambiar(n, { estado: "cancelada" }, "Anulada")}>🚫</Boton>
                      </>
                    )}
                    {!n.abierta && <Boton pequeno tipo="fantasma" onClick={() => cambiar(n, { estado: "pendiente" }, "Reabierta")}>Reabrir</Boton>}
                    <Boton pequeno tipo="fantasma" onClick={() => (setEditando(n), setEdTexto(n.contenido), setEdCuando(aLocal(n.vence)))}>✎</Boton>
                    <Boton pequeno tipo="fantasma" onClick={() => borrar(n)}>🗑</Boton>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vacio>Nada por aquí.</Vacio>
        )}
      </Tarjeta>

      <Modal abierto={!!editando} cerrar={() => setEditando(null)} titulo="Editar" ancho="max-w-lg">
        {editando && (
          <div className="grid gap-3">
            <Campo etiqueta="Texto" ayuda="Para que se repita, termina con [mensual], [anual], [15d]…">
              <textarea className={inputCls} rows={3} value={edTexto} onChange={(e) => setEdTexto(e.target.value)} />
            </Campo>
            <Campo etiqueta="Aviso">
              <input type="datetime-local" className={inputCls} value={edCuando} onChange={(e) => setEdCuando(e.target.value)} />
            </Campo>
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setEditando(null)}>Cancelar</Boton>
              <Boton
                tipo="primario"
                onClick={async () => {
                  const n = editando;
                  setEditando(null);
                  await cambiar(n, { contenido: edTexto, vencimiento: edCuando !== aLocal(n.vence) ? edCuando || null : undefined }, "Guardado");
                }}
              >
                Guardar
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
