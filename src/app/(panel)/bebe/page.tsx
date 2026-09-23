"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Chip, llamar, avisar, inputCls, Kpi, HtmlTelegram, Vacio } from "@/components/ui";
import { Donut, useColores, colorSerie } from "@/components/graficas";
import { isoAEs, hoyISO, eur0 } from "@/lib/parse";

interface Ayuda {
  id: string; ambito: string; ayuda: string; tipo: string; quien: string; importe: string; eurosAnio: number; cuando: string; como: string;
  documentos: string; requisitos: string; estado: string; limite: string | null; fuente: string; verificado: string; notas: string;
}
interface Datos { ayudas: Ayuda[]; nacimiento: string | null; confirmado: boolean }

const ESTADOS = ["por pedir", "pedida", "concedida", "cobrando", "hecho", "comprobar", "vigilar", "opcional", "no aplica"];
const TONO: Record<string, string> = {
  "por pedir": "bg-alerta/10 text-alerta-txt", pedida: "bg-aviso/20 text-aviso-txt", concedida: "bg-bien/15 text-bien-txt", cobrando: "bg-bien/15 text-bien-txt",
  hecho: "bg-bien/15 text-bien-txt", comprobar: "bg-acento-suave text-acento", vigilar: "bg-card-2 text-txt-2", opcional: "bg-card-2 text-txt-3", "no aplica": "bg-card-2 text-txt-3",
};
const TIPO_ICO: Record<string, string> = { prestación: "💶", deducción: "🧾", permiso: "🗓", beca: "🎒", ayuda: "🤝", trámite: "📄", mejora: "✨" };
const HECHAS = ["concedida", "cobrando", "hecho", "no aplica"];

export default function Bebe() {
  const { datos, error, cargando, recargar } = useApi<Datos>("/api/bebe");
  const [filtro, setFiltro] = useState<string>("pendientes");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [fecha, setFecha] = useState("");
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [pensando, setPensando] = useState(false);
  const c = useColores();
  const hoy = hoyISO();

  const ayudas = useMemo(() => datos?.ayudas || [], [datos]);
  const lista = useMemo(
    () =>
      ayudas
        .filter((a) => (filtro === "pendientes" ? !HECHAS.includes(a.estado) && a.estado !== "opcional" : filtro === "todas" ? true : a.tipo === filtro))
        .sort((a, b) => (a.limite || "9999").localeCompare(b.limite || "9999")),
    [ayudas, filtro],
  );

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  if (!datos) return null;

  const cuantificado = ayudas.filter((a) => a.eurosAnio > 0 && a.estado !== "no aplica");
  const totalAnio = cuantificado.reduce((s, a) => s + a.eurosAnio, 0);
  const urgentes = ayudas.filter((a) => ["por pedir", "pedida"].includes(a.estado) && a.limite && a.limite <= new Date(Date.parse(hoy) + 21 * 86400000).toISOString().slice(0, 10));
  const hechas = ayudas.filter((a) => HECHAS.includes(a.estado)).length;
  const tipos = [...new Set(ayudas.map((a) => a.tipo))];

  const cambiar = async (id: string, estado: string) => {
    try {
      await llamar("/api/bebe", "PATCH", { id, estado });
      avisar(`Marcado como «${estado}»`);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const preguntar = async () => {
    if (!pregunta.trim()) return;
    setPensando(true);
    setRespuesta("");
    try {
      const r = await llamar<{ respuesta: string }>("/api/bebe", "POST", { pregunta });
      setRespuesta(r.respuesta);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setPensando(false);
    }
  };

  return (
    <div>
      <Titulo
        titulo="Bebé: ayudas, deducciones y trámites"
        sub="Pareja de Murcia (38 y 32 años), empadronados en Murcia. Todo verificado en fuentes oficiales; lo que depende de vuestra renta está marcado «comprobar»."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi etiqueta="Nacimiento" valor={datos.nacimiento ? isoAEs(datos.nacimiento) : "—"} sub={datos.confirmado ? "confirmado" : "fecha prevista: confírmala abajo"} tono={datos.confirmado ? "bien" : "aviso"} />
        <Kpi etiqueta="Dinero cuantificado" valor={`${eur0(totalAnio)}/año`} sub="deducciones y ayudas con importe fijo (sin contar las 19 semanas)" tono="bien" />
        <Kpi etiqueta="Urgente (3 semanas)" valor={urgentes.length} sub={urgentes[0] ? urgentes[0].ayuda : "nada con plazo cercano"} tono={urgentes.length ? "alerta" : "bien"} />
        <Kpi etiqueta="Resueltas" valor={`${hechas} / ${ayudas.length}`} sub="concedidas, cobrando, hechas o no aplican" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Tarjeta className="lg:col-span-2" titulo="🧑‍⚖️ Pregúntame lo que sea" sub="Respondo solo con lo verificado de vuestra lista; si no está, te digo dónde confirmarlo. También por Telegram: /bebe tu pregunta">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className={inputCls} value={pregunta} onChange={(e) => setPregunta(e.target.value)} onKeyDown={(e) => e.key === "Enter" && preguntar()} placeholder="¿Cómo pedimos las 19 semanas? ¿Qué desgravamos en la renta?" />
            <Boton tipo="primario" disabled={pensando || !pregunta.trim()} onClick={preguntar}>{pensando ? "Pensando…" : "Preguntar"}</Boton>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["¿Qué tenemos que hacer esta semana?", "¿Cuánto dinero podemos conseguir el primer año?", "¿Qué papeles necesitamos para la prestación?", "¿Qué deducciones van en la renta de 2026?"].map((p) => (
              <Chip key={p} onClick={() => setPregunta(p)}>{p}</Chip>
            ))}
          </div>
          {respuesta && <div className="mt-3 rounded-xl bg-card-2 p-3"><HtmlTelegram html={respuesta} /></div>}
        </Tarjeta>
        <Tarjeta titulo="De dónde sale el dinero" sub="Lo que ya tiene importe fijo al año">
          {cuantificado.length ? (
            <Donut alto={170} centro={{ valor: eur0(totalAnio), etiqueta: "al año" }} items={cuantificado.map((a, k) => ({ nombre: a.ayuda, valor: a.eurosAnio, color: colorSerie(c, k % 8) }))} />
          ) : <Vacio>Aún nada cuantificado.</Vacio>}
          <p className="mt-2 text-[11px] text-txt-3">La prestación de 19 semanas (el 100 % de vuestro sueldo, sin IRPF) va aparte: es lo más gordo.</p>
        </Tarjeta>
      </div>

      <Tarjeta
        className="mb-4"
        titulo={`${lista.length} ${filtro === "pendientes" ? "pendientes" : "ayudas y trámites"}`}
        sub="Toca una para ver cómo se pide, qué papeles hacen falta y los requisitos"
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip activo={filtro === "pendientes"} onClick={() => setFiltro("pendientes")}>Pendientes</Chip>
          <Chip activo={filtro === "todas"} onClick={() => setFiltro("todas")}>Todas</Chip>
          {tipos.map((t) => <Chip key={t} activo={filtro === t} onClick={() => setFiltro(t)}>{TIPO_ICO[t] || "•"} {t}</Chip>)}
        </div>
        {lista.length ? (
          <ul className="grid gap-2">
            {lista.map((a) => {
              const venc = a.limite && a.limite < hoy && !HECHAS.includes(a.estado);
              const abierto = abierta === a.id;
              return (
                <li key={a.id} className={`rounded-xl border ${venc ? "border-alerta/50" : "border-borde"} bg-card`}>
                  <button className="flex w-full items-start justify-between gap-3 p-3 text-left" onClick={() => setAbierta(abierto ? null : a.id)} aria-expanded={abierto}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{TIPO_ICO[a.tipo] || "•"} {a.ayuda} <span className="text-[11px] font-normal text-txt-3">{a.id}</span></div>
                      <div className="mt-0.5 text-xs text-txt-2">{a.importe}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-txt-3">
                        <span>{a.ambito}</span><span>👤 {a.quien}</span>
                        {a.limite && <span className={venc ? "font-semibold text-alerta-txt" : ""}>⏰ antes del {isoAEs(a.limite)}</span>}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONO[a.estado] || "bg-card-2"}`}>{a.estado}</span>
                  </button>
                  {abierto && (
                    <div className="grid gap-2 border-t border-borde p-3 text-sm">
                      {a.cuando && <p><b>Cuándo:</b> {a.cuando}</p>}
                      {a.como && <p><b>Cómo se pide:</b> {a.como}</p>}
                      {a.documentos && <p><b>Papeles:</b> {a.documentos}</p>}
                      {a.requisitos && <p><b>Requisitos:</b> {a.requisitos}</p>}
                      {a.notas && <p className="rounded-lg bg-card-2 p-2 text-txt-2">💡 {a.notas}</p>}
                      <p className="text-[11px] text-txt-3">Fuente: {a.fuente} · verificado el {a.verificado}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {ESTADOS.map((e) => <Chip key={e} activo={a.estado === e} onClick={() => a.estado !== e && cambiar(a.id, e)}>{e}</Chip>)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : <Vacio>Todo resuelto con este filtro 🎉</Vacio>}
      </Tarjeta>

      <Tarjeta titulo="Fecha de nacimiento" sub="Con la fecha real recalculo todos los plazos (inscripción, prestación, seguro…)">
        <div className="flex flex-wrap items-end gap-2">
          <input type="date" className={inputCls + " !w-44"} value={fecha} onChange={(e) => setFecha(e.target.value)} max={hoy} />
          <Boton tipo="primario" disabled={!fecha} onClick={async () => {
            try { await llamar("/api/bebe", "PATCH", { nacimiento: fecha }); avisar("Fecha guardada, plazos recalculados"); recargar(); } catch (e) { avisar((e as Error).message, "error"); }
          }}>Guardar fecha</Boton>
          <span className="text-xs text-txt-3">Ahora: {datos.nacimiento ? isoAEs(datos.nacimiento) : "sin fecha"} {datos.confirmado ? "(confirmada)" : "(prevista)"}</span>
        </div>
        <p className="mt-3 text-[11px] text-txt-3">La checklist anterior de tareas se borró como pediste (hay copia de seguridad).</p>
      </Tarjeta>
    </div>
  );
}
