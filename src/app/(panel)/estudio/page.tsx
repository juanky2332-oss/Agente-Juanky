"use client";
import { useEffect, useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Chip, llamar, avisar, inputCls, Kpi, Vacio } from "@/components/ui";
import { TEMAS, type Leccion } from "@/lib/estudioTemario";

interface Explicacion { explicacion: string; ejemplo: string; enTusApps: string; pregunta: string; fecha: string }
interface Progreso { id: string; estado: "nueva" | "entendida" | "repasar"; veces: number; ultima: string; explicacion: Explicacion | null; duda: string }
type LeccionP = Leccion & { progreso: Progreso };
interface Datos { lecciones: LeccionP[]; cuenta: { entendidas: number; repasar: number; total: number }; siguiente: string | null }
interface Noticia { titulo: string; resumen: string; importa: string; termino: string; enlace: string; fuente: string }

const ICO = { entendida: "✅", repasar: "🔁", nueva: "▫️" } as const;
const TXT = { entendida: "Entendida", repasar: "Por repasar", nueva: "Sin ver" } as const;

/** Vista gráfica: el flujo de la lección como cajas con flechas (en vertical en el móvil). */
function Flujo({ pasos }: { pasos: string[] }) {
  return (
    <ol className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2">
      {pasos.map((p, i) => (
        <li key={i} className="flex flex-col sm:flex-row items-center gap-2">
          <span className={`rounded-xl border px-3 py-2 text-sm text-center w-full sm:w-auto ${i === pasos.length - 1 ? "border-acento bg-acento-suave text-txt font-medium" : "border-borde bg-card-2 text-txt"}`}>
            <span className="mr-1.5 text-xs text-txt-3 tabular">{i + 1}</span>
            {p}
          </span>
          {i < pasos.length - 1 && <span className="text-acento text-lg leading-none sm:rotate-0 rotate-90" aria-hidden="true">→</span>}
        </li>
      ))}
    </ol>
  );
}

function Bloque({ ico, titulo, children }: { ico: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-borde bg-card-2 p-3">
      <div className="text-xs font-semibold text-txt-2 mb-1">{ico} {titulo}</div>
      <div className="text-sm text-txt leading-relaxed">{children}</div>
    </div>
  );
}

function VistaLeccion({ l, lecciones, abrir, recargar }: { l: LeccionP; lecciones: LeccionP[]; abrir: (id: string) => void; recargar: () => void }) {
  const [modo, setModo] = useState<"texto" | "grafico">("texto");
  const [duda, setDuda] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const [ex, setEx] = useState<Explicacion | null>(l.progreso.explicacion);
  const [idVisto, setIdVisto] = useState(l.id);
  if (idVisto !== l.id) {
    setIdVisto(l.id);
    setEx(l.progreso.explicacion);
    setPidiendo(false);
    setDuda("");
  }
  const rel = l.relacionadas.map((id) => lecciones.find((x) => x.id === id)).filter(Boolean) as LeccionP[];

  const entiendo = async () => {
    try {
      await llamar("/api/estudio", "POST", { accion: "entiendo", id: l.id });
      avisar("Apuntado: volverá en unos días para repasar");
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const explicar = async () => {
    setPreguntando(true);
    try {
      const r = await llamar<{ explicacion: Explicacion }>("/api/estudio", "POST", { accion: "no-entiendo", id: l.id, duda });
      setEx(r.explicacion);
      setPidiendo(false);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setPreguntando(false);
    }
  };

  return (
    <Tarjeta
      titulo={<span>{ICO[l.progreso.estado]} {l.titulo}</span>}
      sub={`${l.tema} · ${TXT[l.progreso.estado]}${l.progreso.ultima ? ` · última vez ${l.progreso.ultima.split("-").reverse().join("/")}` : ""}`}
      extra={
        <div className="flex gap-1">
          <Chip activo={modo === "texto"} onClick={() => setModo("texto")}>Texto</Chip>
          <Chip activo={modo === "grafico"} onClick={() => setModo("grafico")}>Gráfico</Chip>
        </div>
      }
    >
      <p className="text-base font-medium text-txt mb-3">{l.frase}</p>
      {modo === "texto" ? (
        <div className="grid gap-2">
          <p className="text-sm text-txt leading-relaxed">{l.explicacion}</p>
          <Bloque ico="🧩" titulo="Como si…">{l.analogia}</Bloque>
          <Bloque ico="🛠" titulo="Dónde lo usas tú">{l.enTusApps}</Bloque>
          <Bloque ico="💬" titulo="Cómo decírselo a un cliente">{l.paraCliente}</Bloque>
        </div>
      ) : (
        <div className="grid gap-4">
          <div>
            <div className="text-xs font-semibold text-txt-2 mb-2">Cómo funciona, paso a paso</div>
            <Flujo pasos={l.flujo} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Bloque ico="🧩" titulo="Imagínalo así">{l.analogia}</Bloque>
            <Bloque ico="🛠" titulo="En tus apps">{l.enTusApps}</Bloque>
            <Bloque ico="💬" titulo="En una reunión">{l.paraCliente}</Bloque>
          </div>
        </div>
      )}

      {rel.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-txt-3">Relacionado:</span>
          {rel.map((r) => (
            <Chip key={r.id} onClick={() => abrir(r.id)}>{ICO[r.progreso.estado]} {r.titulo}</Chip>
          ))}
        </div>
      )}

      {ex && (
        <div className="mt-4 rounded-xl border border-acento/40 bg-acento-suave p-3 grid gap-2">
          <div className="text-xs font-semibold text-acento">🔁 Explicado de otra forma{l.progreso.duda ? ` · tu duda: «${l.progreso.duda}»` : ""}</div>
          <p className="text-sm text-txt leading-relaxed">{ex.explicacion}</p>
          {ex.ejemplo && <p className="text-sm text-txt"><b>🏠 Ejemplo:</b> {ex.ejemplo}</p>}
          {ex.enTusApps && <p className="text-sm text-txt"><b>🛠 En tus apps:</b> {ex.enTusApps}</p>}
          {ex.pregunta && <p className="text-sm text-txt-2"><b>❔ Ponte a prueba:</b> {ex.pregunta}</p>}
        </div>
      )}

      {pidiendo && (
        <div className="mt-4 grid gap-2">
          <textarea className={inputCls} rows={2} value={duda} onChange={(e) => setDuda(e.target.value)} placeholder="¿Qué parte no te encaja? (opcional, p. ej. «no veo la diferencia con una búsqueda normal»)" />
          <div className="flex gap-2">
            <Boton tipo="primario" onClick={explicar} disabled={preguntando}>{preguntando ? "Pensando un ejemplo…" : "Explícamelo de otra forma"}</Boton>
            <Boton tipo="fantasma" onClick={() => setPidiendo(false)}>Cancelar</Boton>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Boton tipo="primario" onClick={entiendo}>✅ Lo entiendo</Boton>
        {!pidiendo && <Boton onClick={() => setPidiendo(true)}>🤔 No lo entiendo</Boton>}
      </div>
    </Tarjeta>
  );
}

function Novedades({ abrir, nombre }: { abrir: (id: string) => void; nombre: (id: string) => string }) {
  const [n, setN] = useState<{ fecha: string; noticias: Noticia[] } | null>(null);
  const [cargando, setCargando] = useState(false);
  const pedir = async (forzar: boolean) => {
    setCargando(true);
    try {
      setN(await llamar("/api/estudio", "POST", { accion: "novedades", forzar }));
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primera carga (caché de 12 h en el servidor)
    pedir(false);
  }, []);
  return (
    <Tarjeta
      titulo="Novedades de IA de la semana"
      sub={n ? `Resumen del ${n.fecha.split("-").reverse().join("/")} · OpenAI, Hugging Face, TechCrunch, The Verge, Xataka y Genbeta` : "Leyendo las fuentes…"}
      extra={<Boton pequeno onClick={() => pedir(true)} disabled={cargando}>{cargando ? "Leyendo…" : "↻ Actualizar"}</Boton>}
    >
      {!n && cargando && <Cargando texto="Leyendo las noticias de la semana…" />}
      {n && (
        <ol className="grid gap-3">
          {n.noticias.map((x, i) => (
            <li key={i} className="rounded-xl border border-borde bg-card-2 p-3">
              <a href={x.enlace} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-txt hover:text-acento">{i + 1}. {x.titulo}</a>
              <p className="text-sm text-txt-2 mt-1">{x.resumen}</p>
              <p className="text-sm text-txt mt-1">👉 {x.importa}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-txt-3">
                <span>{x.fuente}</span>
                {x.termino && <Chip onClick={() => abrir(x.termino)}>📚 {nombre(x.termino)}</Chip>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
  );
}

export default function Estudio() {
  const { datos, error, cargando, recargar } = useApi<Datos>("/api/estudio");
  const [vista, setVista] = useState<"hoy" | "temario" | "novedades">("hoy");
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    // Enlaces desde Telegram: ?l=<lección> o ?vista=novedades
    const q = new URLSearchParams(location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- parámetros de la URL, solo en el navegador */
    if (q.get("l")) setAbierta(q.get("l"));
    if (q.get("vista") === "novedades") setVista("novedades");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const porTema = useMemo(
    () => TEMAS.map((t) => ({ tema: t, lista: (datos?.lecciones || []).filter((l) => l.tema === t) })),
    [datos],
  );

  if (cargando && !datos) return <Cargando texto="Cargando tu temario…" />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  if (!datos) return null;

  const abrir = (id: string) => {
    setAbierta(id);
    setVista("hoy");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const idActual = abierta || datos.siguiente;
  const actual = datos.lecciones.find((l) => l.id === idActual);
  const nombre = (id: string) => datos.lecciones.find((l) => l.id === id)?.titulo || id;

  return (
    <div className="grid gap-4">
      <Titulo titulo="Estudio" sub="La teoría de lo que construyes: léelo, márcalo y pide otra explicación cuando no te encaje. También en Telegram con /estudio y /novedades." />
      <div className="grid grid-cols-3 gap-3">
        <Kpi etiqueta="Entendidas" valor={`${datos.cuenta.entendidas}/${datos.cuenta.total}`} tono="bien" sub={`${Math.round((100 * datos.cuenta.entendidas) / datos.cuenta.total)} %`} />
        <Kpi etiqueta="Por repasar" valor={datos.cuenta.repasar} tono={datos.cuenta.repasar ? "aviso" : undefined} sub={datos.cuenta.repasar ? "salen primero" : "nada pendiente"} />
        <Kpi etiqueta="Siguiente" valor={<span className="text-base">{datos.siguiente ? nombre(datos.siguiente) : "Todo al día"}</span>} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip activo={vista === "hoy"} onClick={() => setVista("hoy")}>📖 Lección</Chip>
        <Chip activo={vista === "temario"} onClick={() => setVista("temario")}>📚 Temario</Chip>
        <Chip activo={vista === "novedades"} onClick={() => setVista("novedades")}>🗞 Novedades</Chip>
      </div>

      {vista === "hoy" &&
        (actual ? (
          <>
            {abierta && abierta !== datos.siguiente && datos.siguiente && (
              <div><Boton pequeno tipo="fantasma" onClick={() => setAbierta(null)}>← Ir a la que toca hoy</Boton></div>
            )}
            <VistaLeccion l={actual} lecciones={datos.lecciones} abrir={abrir} recargar={recargar} />
          </>
        ) : (
          <Vacio>🎉 Todo al día. Repasa lo que quieras desde el temario o mira las novedades.</Vacio>
        ))}

      {vista === "temario" && (
        <div className="grid gap-3 md:grid-cols-2">
          {porTema.map(({ tema, lista }) => {
            const ok = lista.filter((l) => l.progreso.estado === "entendida").length;
            return (
              <Tarjeta key={tema} titulo={tema} sub={`${ok} de ${lista.length} entendidas`}>
                <div className="h-1.5 rounded-full bg-card-2 mb-3 overflow-hidden">
                  <div className="h-full bg-acento" style={{ width: `${(100 * ok) / Math.max(1, lista.length)}%` }} />
                </div>
                <ul className="grid gap-1">
                  {lista.map((l) => (
                    <li key={l.id}>
                      <button onClick={() => abrir(l.id)} className="w-full text-left rounded-lg px-2 py-1.5 text-sm hover:bg-card-2 flex gap-2">
                        <span>{ICO[l.progreso.estado]}</span>
                        <span className="text-txt">{l.titulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            );
          })}
        </div>
      )}

      {vista === "novedades" && <Novedades abrir={abrir} nombre={nombre} />}
    </div>
  );
}
