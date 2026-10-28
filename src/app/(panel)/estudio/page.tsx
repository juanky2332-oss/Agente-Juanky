"use client";
import { useEffect, useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Chip, llamar, avisar, inputCls, Kpi, Vacio } from "@/components/ui";
import type { Leccion } from "@/lib/estudioTemario";
import { MATERIAS, materia as materiaPor, type IdMateria, type Materia } from "@/lib/estudioMaterias";

interface Explicacion { explicacion: string; ejemplo: string; enTusApps: string; pregunta: string; fecha: string }
interface Progreso { id: string; estado: "nueva" | "entendida" | "repasar"; veces: number; ultima: string; explicacion: Explicacion | null; duda: string }
type LeccionP = Leccion & { progreso: Progreso };
interface Datos {
  materia: IdMateria;
  temas: string[];
  lecciones: LeccionP[];
  cuenta: { entendidas: number; repasar: number; total: number };
  siguiente: string | null;
  materias: { id: IdMateria; nombre: string; emoji: string; vistas: number; total: number }[];
}
interface Noticia { titulo: string; resumen: string; importa: string; termino: string; enlace: string; fuente: string }
interface Correccion { correcta: string; natural: string; errores: { mal: string; bien: string; porque: string }[]; nota: string }
type Vista = "hoy" | "temario" | "visto" | "ampliar" | "novedades" | "corregir";

const ICO = { entendida: "✅", repasar: "🔁", nueva: "▫️" } as const;
const TXT = { entendida: "Vista", repasar: "Sin entender aún", nueva: "Sin ver" } as const;

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
      <div className="text-sm text-txt leading-relaxed whitespace-pre-line">{children}</div>
    </div>
  );
}

function VistaLeccion({ l, m, lecciones, abrir, recargar }: { l: LeccionP; m: Materia; lecciones: LeccionP[]; abrir: (id: string) => void; recargar: () => void }) {
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
      avisar("Apuntado: queda en «Lo visto»");
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
      sub={`${l.tema} · ${TXT[l.progreso.estado]}${l.progreso.ultima ? ` · ${l.progreso.ultima.split("-").reverse().join("/")}` : ""}`}
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
          <Bloque ico="🧩" titulo={m.et.analogia}>{l.analogia}</Bloque>
          <Bloque ico="🛠" titulo={m.et.enTusApps}>{l.enTusApps}</Bloque>
          <Bloque ico="💬" titulo={m.et.paraCliente}>{l.paraCliente}</Bloque>
        </div>
      ) : (
        <div className="grid gap-4">
          <div>
            <div className="text-xs font-semibold text-txt-2 mb-2">{m.et.flujo}</div>
            <Flujo pasos={l.flujo} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Bloque ico="🧩" titulo={m.et.analogia}>{l.analogia}</Bloque>
            <Bloque ico="🛠" titulo={m.et.enTusApps}>{l.enTusApps}</Bloque>
            <Bloque ico="💬" titulo={m.et.paraCliente}>{l.paraCliente}</Bloque>
          </div>
        </div>
      )}

      {l.fuentes && l.fuentes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-txt-3">📎 Fuentes:</span>
          {l.fuentes.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-acento hover:underline">{dominio(u)}</a>
          ))}
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
          {ex.enTusApps && <p className="text-sm text-txt"><b>🛠 {m.et.enTusApps}:</b> {ex.enTusApps}</p>}
          {ex.pregunta && <p className="text-sm text-txt-2"><b>❔ Ponte a prueba:</b> {ex.pregunta}</p>}
        </div>
      )}

      {pidiendo && (
        <div className="mt-4 grid gap-2">
          <textarea className={inputCls} rows={2} value={duda} onChange={(e) => setDuda(e.target.value)} placeholder="¿Qué parte no te encaja? (opcional)" />
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

const dominio = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 40);
  }
};

const IDEAS: Record<IdMateria, string[]> = {
  tecnica: ["Nivel más avanzado de agentes", "Seguridad de APIs con IA", "Cómo medir la calidad de un chatbot"],
  compras: ["Compras más complejas: acuerdos marco y pedidos abiertos", "Penalizaciones y garantías en contratos", "Negociar con un proveedor que tiene la sartén por el mango"],
  ingles: ["Algo más difícil: discrepar con educación en una reunión", "Phrasal verbs que se usan en el trabajo", "Condicionales para negociar"],
  refranes: ["Más refranes de la huerta de Murcia", "Refranes del campo de Cartagena y Lorca", "Refranes sobre el dinero y los tratos"],
};

/** «Ampliar»: pide lecciones nuevas sobre lo que quiera; se buscan en internet y se guardan en su temario. */
function Ampliar({ m, alTerminar }: { m: Materia; alTerminar: (primera: string) => void }) {
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const pedir = async (peticion: string) => {
    setCargando(true);
    try {
      const r = await llamar<{ tema: string; lecciones: { id: string; titulo: string }[] }>("/api/estudio", "POST", { accion: "ampliar", materia: m.id, texto: peticion });
      avisar(`${r.lecciones.length} lecciones nuevas en «${r.tema}»`);
      setTexto("");
      alTerminar(r.lecciones[0].id);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  };
  return (
    <Tarjeta titulo={`Ampliar ${m.nombre}`} sub="Dime qué quieres aprender y busco en internet fuentes fiables para prepararte 3 o 4 lecciones nuevas con el mismo formato. Tarda alrededor de un minuto.">
      <div className="grid gap-2">
        <textarea className={inputCls} rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`p. ej. «${IDEAS[m.id][0]}»`} disabled={cargando} />
        <div className="flex flex-wrap gap-1.5">
          {IDEAS[m.id].map((i) => (
            <Chip key={i} onClick={() => !cargando && pedir(i)}>{i}</Chip>
          ))}
        </div>
        <div><Boton tipo="primario" onClick={() => pedir(texto)} disabled={cargando}>{cargando ? "Buscando y preparando lecciones…" : "➕ Prepararme lecciones nuevas"}</Boton></div>
        {cargando && <Cargando texto="Buscando en fuentes fiables y montando las lecciones (≈1 minuto)…" />}
      </div>
    </Tarjeta>
  );
}

/** Resumen de todo lo visto en la materia: lo esencial de cada lección, para leerlo de un tirón. */
function LoVisto({ m, temas, lecciones, abrir }: { m: Materia; temas: string[]; lecciones: LeccionP[]; abrir: (id: string) => void }) {
  const vistas = lecciones.filter((l) => l.progreso.estado === "entendida");
  if (!vistas.length) return <Vacio>Aún no has marcado nada como entendido en {m.nombre}. Cuando pulses «✅ Lo entiendo», aparecerá aquí resumido.</Vacio>;
  return (
    <div className="grid gap-3">
      {temas.map((tema) => {
        const lista = vistas.filter((l) => l.tema === tema);
        if (!lista.length) return null;
        return (
          <Tarjeta key={tema} titulo={tema} sub={`${lista.length} vista${lista.length === 1 ? "" : "s"}`}>
            <ul className="grid gap-3">
              {lista.map((l) => (
                <li key={l.id} className="rounded-xl border border-borde bg-card-2 p-3">
                  <button onClick={() => abrir(l.id)} className="text-sm font-semibold text-txt hover:text-acento text-left">{l.titulo}</button>
                  <p className="text-sm text-txt mt-1">{l.frase}</p>
                  <p className="text-sm text-txt-2 mt-1 whitespace-pre-line">💬 {l.paraCliente}</p>
                </li>
              ))}
            </ul>
          </Tarjeta>
        );
      })}
    </div>
  );
}

function Corrector() {
  const [texto, setTexto] = useState("");
  const [r, setR] = useState<Correccion | null>(null);
  const [cargando, setCargando] = useState(false);
  const corregir = async () => {
    setCargando(true);
    try {
      setR(await llamar<Correccion>("/api/estudio", "POST", { accion: "corregir", texto }));
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setCargando(false);
    }
  };
  return (
    <Tarjeta titulo="Corrígeme el inglés" sub="Escribe una frase o un correo corto en inglés y te digo qué falla y cómo lo diría un nativo. También en Telegram: /ingles corrige …">
      <div className="grid gap-2">
        <textarea className={inputCls} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="p. ej. «Hello, I send you the order and I want know the delivery date»" />
        <div><Boton tipo="primario" onClick={corregir} disabled={cargando || !texto.trim()}>{cargando ? "Corrigiendo…" : "✍️ Corregir"}</Boton></div>
      </div>
      {r && (
        <div className="mt-4 grid gap-2">
          <Bloque ico="✍️" titulo="Corregida">{r.correcta}</Bloque>
          {r.natural && <Bloque ico="🗣" titulo="Más natural">{r.natural}</Bloque>}
          {r.errores.length > 0 && (
            <Bloque ico="🔎" titulo="Qué fallaba">
              <ul className="grid gap-1">
                {r.errores.map((e, i) => (
                  <li key={i}><s className="text-txt-3">{e.mal}</s> → <b>{e.bien}</b>: {e.porque}</li>
                ))}
              </ul>
            </Bloque>
          )}
          {r.nota && <p className="text-sm text-txt-2">💡 {r.nota}</p>}
        </div>
      )}
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
  const [idMateria, setIdMateria] = useState<IdMateria>("tecnica");
  const { datos, error, cargando, recargar } = useApi<Datos>(`/api/estudio?m=${idMateria}`);
  const [vista, setVista] = useState<Vista>("hoy");
  const [abierta, setAbierta] = useState<string | null>(null);
  const m = materiaPor(idMateria);

  useEffect(() => {
    // Enlaces desde Telegram: ?m=<materia>, ?l=<lección>, ?vista=novedades|visto
    const q = new URLSearchParams(location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- parámetros de la URL, solo en el navegador */
    if (q.get("m") && MATERIAS.some((x) => x.id === q.get("m"))) setIdMateria(q.get("m") as IdMateria);
    if (q.get("l")) setAbierta(q.get("l"));
    const v = q.get("vista");
    if (v === "novedades" || v === "visto" || v === "corregir") setVista(v);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const porTema = useMemo(() => (datos?.temas || m.temas).map((t) => ({ tema: t, lista: (datos?.lecciones || []).filter((l) => l.tema === t) })), [datos, m]);

  const cambiarMateria = (id: IdMateria) => {
    setIdMateria(id);
    setAbierta(null);
    setVista("hoy");
    history.replaceState(null, "", `/estudio?m=${id}`);
  };

  const pestañas = (
    <div className="flex flex-wrap gap-1.5">
      {MATERIAS.map((x) => {
        const c = datos?.materias.find((y) => y.id === x.id);
        return (
          <Chip key={x.id} activo={idMateria === x.id} onClick={() => cambiarMateria(x.id)}>
            {x.emoji} {x.nombre}{c ? ` · ${c.vistas}/${c.total}` : ""}
          </Chip>
        );
      })}
    </div>
  );

  if (!datos || datos.materia !== idMateria) {
    if (error && !cargando) return <FalloCarga error={error} reintentar={recargar} />;
    return (
      <div className="grid gap-4">
        <Titulo titulo="Estudio" sub={m.sub} />
        {pestañas}
        <Cargando texto={`Cargando ${m.nombre}…`} />
      </div>
    );
  }

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
      <Titulo titulo="Estudio" sub={`${m.sub} En Telegram: /${m.comando}${m.id === "tecnica" ? " y /novedades" : ""}.`} />
      {pestañas}
      <div className="grid grid-cols-3 gap-3">
        <Kpi etiqueta="Vistas" valor={`${datos.cuenta.entendidas}/${datos.cuenta.total}`} tono="bien" sub={`${Math.round((100 * datos.cuenta.entendidas) / Math.max(1, datos.cuenta.total))} %`} />
        <Kpi etiqueta="Sin entender" valor={datos.cuenta.repasar} tono={datos.cuenta.repasar ? "aviso" : undefined} sub={datos.cuenta.repasar ? "salen primero" : "nada pendiente"} />
        <Kpi etiqueta="Siguiente" valor={<span className="text-base">{datos.siguiente ? nombre(datos.siguiente) : "Todo visto"}</span>} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip activo={vista === "hoy"} onClick={() => setVista("hoy")}>📖 Lección</Chip>
        <Chip activo={vista === "temario"} onClick={() => setVista("temario")}>📚 Temario</Chip>
        <Chip activo={vista === "visto"} onClick={() => setVista("visto")}>📝 Lo visto</Chip>
        <Chip activo={vista === "ampliar"} onClick={() => setVista("ampliar")}>➕ Ampliar</Chip>
        {m.id === "ingles" && <Chip activo={vista === "corregir"} onClick={() => setVista("corregir")}>✍️ Corrígeme</Chip>}
        {m.id === "tecnica" && <Chip activo={vista === "novedades"} onClick={() => setVista("novedades")}>🗞 Novedades</Chip>}
      </div>

      {vista === "hoy" &&
        (actual ? (
          <>
            {abierta && abierta !== datos.siguiente && datos.siguiente && (
              <div><Boton pequeno tipo="fantasma" onClick={() => setAbierta(null)}>← Ir a la siguiente que toca</Boton></div>
            )}
            <VistaLeccion l={actual} m={m} lecciones={datos.lecciones} abrir={abrir} recargar={recargar} />
          </>
        ) : (
          <Vacio>🎉 Has visto todo {m.nombre}. Tienes el resumen en «Lo visto», y en «➕ Ampliar» te preparo más.</Vacio>
        ))}

      {vista === "temario" && (
        <div className="grid gap-3 md:grid-cols-2">
          {porTema.map(({ tema, lista }) => {
            const ok = lista.filter((l) => l.progreso.estado === "entendida").length;
            return (
              <Tarjeta key={tema} titulo={tema} sub={`${ok} de ${lista.length} vistas`}>
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

      {vista === "visto" && <LoVisto m={m} temas={datos.temas} lecciones={datos.lecciones} abrir={abrir} />}
      {vista === "ampliar" && (
        <Ampliar
          m={m}
          alTerminar={(primera) => {
            recargar();
            abrir(primera);
          }}
        />
      )}
      {vista === "corregir" && m.id === "ingles" && <Corrector />}
      {vista === "novedades" && m.id === "tecnica" && <Novedades abrir={abrir} nombre={nombre} />}
    </div>
  );
}
