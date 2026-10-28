"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Vacio, llamar, avisar, inputCls, Campo, Chip } from "@/components/ui";

interface Ev { id: string; titulo: string; descripcion: string; lugar: string; enlace: string; todoElDia: boolean; inicio: string; fin: string }

const DIA = (s: string) => s.slice(0, 10);
const RE_LIBRE = /vacacion|festivo|puente|descanso|libre|fiesta/i;

function diasDe(e: Ev): string[] {
  // Eventos de varios días: se listan en cada día que abarcan (multi-día = >1 día natural y ≥20 h)
  const ini = new Date(e.inicio), fin = new Date(e.fin);
  const horas = (fin.getTime() - ini.getTime()) / 3600000;
  const d0 = DIA(e.inicio);
  const ultimo = e.todoElDia ? new Date(fin.getTime() - 86400000).toISOString().slice(0, 10) : DIA(e.fin);
  if (d0 === ultimo || (!e.todoElDia && horas < 20)) return [d0];
  const out: string[] = [];
  for (let d = new Date(d0 + "T12:00:00"); d.toISOString().slice(0, 10) <= ultimo && out.length < 60; d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const local = (iso: string) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Madrid" }).replace(" ", "T").slice(0, 16);
const menosUnDia = (d: string) => new Date(Date.parse(d + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);

/** Formulario para cambiar una cita: título, días, horas y lugar. */
function Editar({ e, cerrar, guardado }: { e: Ev; cerrar: () => void; guardado: () => void }) {
  const ini = e.todoElDia ? e.inicio.slice(0, 10) + "T00:00" : local(e.inicio);
  const fin = e.todoElDia ? menosUnDia(e.fin.slice(0, 10)) + "T00:00" : local(e.fin);
  const [f, setF] = useState({ titulo: e.titulo, fecha: ini.slice(0, 10), fechaFin: fin.slice(0, 10), hora: e.todoElDia ? "" : ini.slice(11), horaFin: e.todoElDia ? "" : fin.slice(11), todoElDia: e.todoElDia, lugar: e.lugar });
  const [enviando, setEnviando] = useState(false);
  const guardar = async (x: React.FormEvent) => {
    x.preventDefault();
    setEnviando(true);
    try {
      const todo = f.todoElDia || !f.hora;
      await llamar("/api/agenda", "PATCH", {
        id: e.id,
        titulo: f.titulo,
        todoElDia: todo,
        inicio: todo ? f.fecha : `${f.fecha}T${f.hora}`,
        fin: todo ? f.fechaFin || f.fecha : f.horaFin ? `${f.fechaFin || f.fecha}T${f.horaFin}` : undefined,
        lugar: f.lugar,
      });
      avisar("Cita cambiada en Google Calendar");
      guardado();
    } catch (err) {
      avisar((err as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <form onSubmit={guardar} className="mt-2 grid gap-2 rounded-xl border border-acento/40 bg-card-2 p-3">
      <Campo etiqueta="Título"><input required className={inputCls} value={f.titulo} onChange={(x) => setF({ ...f, titulo: x.target.value })} /></Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Día"><input required type="date" className={inputCls} value={f.fecha} onChange={(x) => setF({ ...f, fecha: x.target.value, fechaFin: f.fechaFin < x.target.value ? x.target.value : f.fechaFin })} /></Campo>
        <Campo etiqueta="Hasta el día"><input type="date" className={inputCls} value={f.fechaFin} min={f.fecha} onChange={(x) => setF({ ...f, fechaFin: x.target.value })} /></Campo>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.todoElDia} onChange={(x) => setF({ ...f, todoElDia: x.target.checked })} /> Todo el día</label>
      {!f.todoElDia && (
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Desde"><input type="time" className={inputCls} value={f.hora} onChange={(x) => setF({ ...f, hora: x.target.value })} /></Campo>
          <Campo etiqueta="Hasta" ayuda="Vacío = 1 hora"><input type="time" className={inputCls} value={f.horaFin} onChange={(x) => setF({ ...f, horaFin: x.target.value })} /></Campo>
        </div>
      )}
      <Campo etiqueta="Lugar"><input className={inputCls} value={f.lugar} onChange={(x) => setF({ ...f, lugar: x.target.value })} /></Campo>
      <div className="flex gap-2">
        <Boton type="submit" tipo="primario" disabled={enviando}>{enviando ? "Guardando…" : "Guardar cambios"}</Boton>
        <Boton tipo="fantasma" onClick={cerrar}>Cancelar</Boton>
      </div>
    </form>
  );
}

export default function Agenda() {
  const [rango, setRango] = useState(30);
  const { datos, error, cargando, recargar } = useApi<{ eventos: Ev[] }>(`/api/agenda?atras=1&adelante=${rango}`);
  const [f, setF] = useState({ titulo: "", fecha: "", hora: "", horaFin: "", todoElDia: false, lugar: "" });
  const [enviando, setEnviando] = useState(false);

  const porDia = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of datos?.eventos || []) for (const d of diasDe(e)) m.set(d, [...(m.get(d) || []), e]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [datos]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await llamar("/api/agenda", "POST", {
        titulo: f.titulo,
        todoElDia: f.todoElDia || !f.hora,
        inicio: f.todoElDia || !f.hora ? f.fecha : `${f.fecha}T${f.hora}`,
        fin: f.horaFin && !f.todoElDia ? `${f.fecha}T${f.horaFin}` : undefined,
        lugar: f.lugar,
      });
      avisar("Evento creado en Google Calendar");
      setF({ titulo: "", fecha: "", hora: "", horaFin: "", todoElDia: false, lugar: "" });
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };
  const [editando, setEditando] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  /** «Pasar adelante»: misma hora, N días después (o al día elegido). */
  const moverDias = async (e: Ev, dias: number) => {
    if (!dias) return;
    try {
      await llamar("/api/agenda", "PATCH", { id: e.id, moverDias: dias });
      avisar(`«${e.titulo}» movida ${dias > 0 ? "adelante" : "atrás"} ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`);
      setMoviendo(null);
      recargar();
    } catch (x) {
      avisar((x as Error).message, "error");
    }
  };
  const moverA = (e: Ev, dia: string) => {
    if (!dia) return;
    const desde = e.todoElDia ? e.inicio.slice(0, 10) : local(e.inicio).slice(0, 10);
    moverDias(e, Math.round((Date.parse(dia + "T12:00:00Z") - Date.parse(desde + "T12:00:00Z")) / 86400000));
  };
  const borrar = async (e: Ev) => {
    if (!confirm(`¿Borrar «${e.titulo}» de Google Calendar?`)) return;
    try {
      await llamar(`/api/agenda?id=${encodeURIComponent(e.id)}`, "DELETE");
      avisar("Borrado");
      recargar();
    } catch (x) {
      avisar((x as Error).message, "error");
    }
  };

  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <div>
      <Titulo titulo="Agenda" sub="Tu Google Calendar (juanky2332@gmail.com), el mismo que usa el bot."
        extra={[7, 30, 90].map((d) => <Chip key={d} activo={rango === d} onClick={() => setRango(d)}>{d} días</Chip>)} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2" titulo="Próximos eventos">
          {cargando && !datos ? <Cargando texto="Leyendo el calendario…" /> : error && !datos ? <FalloCarga error={error} reintentar={recargar} /> : porDia.length ? (
            <div className="grid gap-4">
              {porDia.map(([dia, evs]) => {
                const d = new Date(dia + "T12:00:00");
                return (
                  <div key={dia} className="grid grid-cols-[64px_1fr] gap-3">
                    <div className={`text-center rounded-xl py-2 ${dia === hoy ? "bg-acento text-white" : "bg-card-2"}`}>
                      <div className="text-[11px] uppercase">{d.toLocaleDateString("es-ES", { weekday: "short" })}</div>
                      <div className="text-xl font-semibold leading-none">{d.getDate()}</div>
                      <div className="text-[11px]">{d.toLocaleDateString("es-ES", { month: "short" })}</div>
                    </div>
                    <ul className="grid gap-2">
                      {evs.map((e) => {
                        const dias = diasDe(e);
                        const n = dias.indexOf(dia) + 1;
                        return (
                          <li key={e.id + dia} className="group rounded-xl border border-borde p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs text-txt-3">
                                  {e.todoElDia || dias.length > 1 ? `Todo el día${dias.length > 1 ? ` · día ${n} de ${dias.length}` : ""}` : `${new Date(e.inicio).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} – ${new Date(e.fin).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`}
                                </div>
                                <div className="font-medium">{RE_LIBRE.test(e.titulo) ? "🏖 " : ""}{e.titulo}</div>
                                {e.lugar && <div className="text-xs text-txt-3">📍 {e.lugar}</div>}
                              </div>
                              <div className="flex shrink-0 gap-1 opacity-80 group-hover:opacity-100">
                                <button onClick={() => { setMoviendo(moviendo === e.id + dia ? null : e.id + dia); setEditando(null); }} className="rounded-lg px-2 py-1 text-xs text-acento hover:bg-card-2" aria-label="Pasar adelante">⏩</button>
                                <button onClick={() => { setEditando(editando === e.id + dia ? null : e.id + dia); setMoviendo(null); }} className="rounded-lg px-2 py-1 text-xs text-acento hover:bg-card-2" aria-label="Editar">✏️</button>
                                {e.enlace && <a href={e.enlace} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1 text-xs text-acento hover:bg-card-2">abrir</a>}
                                <button onClick={() => borrar(e)} className="rounded-lg px-2 py-1 text-xs text-txt-3 hover:bg-card-2" aria-label="Borrar">🗑</button>
                              </div>
                            </div>
                            {moviendo === e.id + dia && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-card-2 p-2">
                                <span className="text-xs text-txt-3">Pasar a (misma hora):</span>
                                <Chip onClick={() => moverDias(e, 1)}>Mañana</Chip>
                                <Chip onClick={() => moverDias(e, 2)}>+2 días</Chip>
                                <Chip onClick={() => moverDias(e, 7)}>+1 semana</Chip>
                                <input type="date" className={`${inputCls} w-auto py-1 text-xs`} aria-label="Otro día" onChange={(x) => moverA(e, x.target.value)} />
                              </div>
                            )}
                            {editando === e.id + dia && <Editar e={e} cerrar={() => setEditando(null)} guardado={() => { setEditando(null); recargar(); }} />}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : <Vacio>No hay nada en los próximos {rango} días.</Vacio>}
        </Tarjeta>
        <Tarjeta titulo="Nuevo evento">
          <form onSubmit={crear} className="grid gap-3">
            <Campo etiqueta="Título"><input required className={inputCls} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
            <Campo etiqueta="Día"><input required type="date" className={inputCls} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.todoElDia} onChange={(e) => setF({ ...f, todoElDia: e.target.checked })} /> Todo el día</label>
            {!f.todoElDia && (
              <div className="grid grid-cols-2 gap-2">
                <Campo etiqueta="Desde"><input type="time" className={inputCls} value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></Campo>
                <Campo etiqueta="Hasta" ayuda="Vacío = 1 hora"><input type="time" className={inputCls} value={f.horaFin} onChange={(e) => setF({ ...f, horaFin: e.target.value })} /></Campo>
              </div>
            )}
            <Campo etiqueta="Lugar"><input className={inputCls} value={f.lugar} onChange={(e) => setF({ ...f, lugar: e.target.value })} /></Campo>
            <Boton type="submit" tipo="primario" disabled={enviando}>{enviando ? "Creando…" : "Crear evento"}</Boton>
          </form>
        </Tarjeta>
      </div>
    </div>
  );
}
