"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Vacio, llamar, avisar, inputCls, Campo, Chip, Kpi, HtmlTelegram, Modal } from "@/components/ui";
import { Ranking, useColores } from "@/components/graficas";
import { normaliza, num } from "@/lib/parse";

type F = Record<string, string> & { fila: number };

export default function Gastro() {
  const { datos, error, cargando, recargar } = useApi<{ restaurantes: F[]; vinos: F[] }>("/api/gastro");
  const [que, setQue] = useState<"restaurantes" | "vinos">("restaurantes");
  const [estado, setEstado] = useState<string>("");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | { accion: "apuntar" | "alta"; nombre: string }>(null);
  const [f, setF] = useState({ nota: "", comentario: "", platos: "", quien: "" });
  const [resultado, setResultado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const c = useColores();

  const lista = useMemo(() => {
    const t = normaliza(q);
    return ((que === "restaurantes" ? datos?.restaurantes : datos?.vinos) || [])
      .filter((x) => (!estado || normaliza(x.ESTADO) === estado) && (!t || normaliza(Object.values(x).join(" ")).includes(t)))
      .sort((a, b) => num(b.NOTA) - num(a.NOTA) || (a.NOMBRE || "").localeCompare(b.NOMBRE || ""));
  }, [datos, que, estado, q]);

  const rs = datos?.restaurantes || [];
  const visitados = rs.filter((r) => num(r.VISITAS) > 0 || normaliza(r.ESTADO) === "visitado");
  const conNota = [...rs, ...(datos?.vinos || [])].filter((x) => num(x.NOTA) > 0);

  const enviar = async () => {
    if (!modal) return;
    setEnviando(true);
    try {
      const body =
        modal.accion === "apuntar"
          ? { que, accion: "apuntar", nombre: modal.nombre, nota: f.nota || undefined, comentario: f.comentario || undefined, platos: f.platos || undefined }
          : { que, accion: "alta", nombre: modal.nombre, datos: f.quien ? { "recomendado por": f.quien } : undefined };
      const r = await llamar<{ resultado: string }>("/api/gastro", "POST", body);
      setResultado(r.resultado);
      setModal(null);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;

  return (
    <div>
      <Titulo titulo="Guía gastro" sub="Restaurantes de Murcia y vinos. Se escribe con el mismo motor que /resto y /vino del bot (un vino nuevo se completa solo desde internet)."
        extra={<Boton tipo="primario" onClick={() => (setF({ nota: "", comentario: "", platos: "", quien: "" }), setModal({ accion: "alta", nombre: "" }))}>+ Añadir {que === "vinos" ? "vino" : "restaurante"}</Boton>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi etiqueta="Restaurantes" valor={rs.length} sub={`${visitados.length} visitados`} />
        <Kpi etiqueta="Pendientes de probar" valor={rs.filter((r) => normaliza(r.ESTADO) === "pendiente").length} />
        <Kpi etiqueta="Vinos catados" valor={datos?.vinos.length || 0} />
        <Kpi etiqueta="Nota media" valor={conNota.length ? (conNota.reduce((s, x) => s + num(x.NOTA), 0) / conNota.length).toLocaleString("es-ES", { maximumFractionDigits: 1 }) : "—"} sub={`${conNota.length} valoraciones`} />
      </div>
      {resultado && (
        <Tarjeta className="mb-4" titulo="Respuesta del motor" extra={<Boton pequeno tipo="fantasma" onClick={() => setResultado("")}>✕</Boton>}>
          <HtmlTelegram html={resultado} />
        </Tarjeta>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2" titulo={que === "restaurantes" ? "Restaurantes" : "Vinos"}
          extra={
            <div className="flex flex-wrap gap-1.5">
              <Chip activo={que === "restaurantes"} onClick={() => (setQue("restaurantes"), setEstado(""))}>🍽 Restaurantes</Chip>
              <Chip activo={que === "vinos"} onClick={() => (setQue("vinos"), setEstado(""))}>🍷 Vinos</Chip>
              {que === "restaurantes" && ["", "pendiente", "visitado"].map((e) => <Chip key={e} activo={estado === e} onClick={() => setEstado(e)}>{e || "todos"}</Chip>)}
              <input className={inputCls + " !w-32 !py-1 text-xs"} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          }>
          {lista.length ? (
            <ul className="divide-y divide-borde">
              {lista.map((x) => (
                <li key={x.fila} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="font-medium">{x.NOMBRE} <span className="text-[11px] text-txt-3">#{que === "vinos" ? "V" : "R"}{x.fila}</span></div>
                    <div className="text-xs text-txt-3">
                      {que === "vinos"
                        ? [x.BODEGA, x.DO, x.TIPO, x.UVA, x["AÑADA"], x.PRECIO].filter(Boolean).join(" · ")
                        : [x.ZONA, x.COCINA, x.ESTADO, num(x.VISITAS) ? `${x.VISITAS} visitas` : "", x["ULTIMA VISITA"]].filter(Boolean).join(" · ")}
                    </div>
                    {x.COMENTARIO && <div className="mt-1 text-xs text-txt-2 line-clamp-2">{x.COMENTARIO}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {num(x.NOTA) > 0 && <span className="rounded-lg bg-acento-suave px-2 py-1 text-sm font-semibold text-acento tabular">{x.NOTA}</span>}
                    <Boton pequeno onClick={() => (setF({ nota: "", comentario: "", platos: "", quien: "" }), setModal({ accion: "apuntar", nombre: x.NOMBRE }))}>Valorar</Boton>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Vacio>Nada con ese filtro.</Vacio>}
        </Tarjeta>
        <Tarjeta titulo="Top por nota">
          <Ranking items={conNota.sort((a, b) => num(b.NOTA) - num(a.NOTA)).slice(0, 10).map((x) => ({ nombre: x.NOMBRE, valor: num(x.NOTA), color: c.s1, clave: x.NOMBRE + x.fila }))} max={10} formato={(n) => n.toLocaleString("es-ES") + "/10"} vacio="Aún no hay valoraciones" />
        </Tarjeta>
      </div>
      <Modal abierto={!!modal} cerrar={() => setModal(null)} titulo={modal?.accion === "alta" ? `Nuevo ${que === "vinos" ? "vino" : "restaurante"}` : `Valorar ${modal?.nombre}`} ancho="max-w-lg">
        {modal && (
          <div className="grid gap-3">
            {modal.accion === "alta" && (
              <>
                <Campo etiqueta="Nombre"><input className={inputCls} value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} /></Campo>
                {que === "restaurantes" && <Campo etiqueta="Recomendado por"><input className={inputCls} value={f.quien} onChange={(e) => setF({ ...f, quien: e.target.value })} /></Campo>}
                {que === "vinos" && <p className="text-xs text-txt-3">Si el vino es nuevo, el motor busca en internet bodega, D.O., uva y precio (tarda unos segundos).</p>}
              </>
            )}
            {modal.accion === "apuntar" && (
              <>
                <Campo etiqueta="Nota (1-10)"><input inputMode="numeric" className={inputCls} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
                {que === "restaurantes" && <Campo etiqueta="Platos"><input className={inputCls} value={f.platos} onChange={(e) => setF({ ...f, platos: e.target.value })} /></Campo>}
                <Campo etiqueta="Comentario" ayuda="Se acumula con la fecha, no pisa lo anterior"><textarea rows={3} className={inputCls} value={f.comentario} onChange={(e) => setF({ ...f, comentario: e.target.value })} /></Campo>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Boton onClick={() => setModal(null)}>Cancelar</Boton>
              <Boton tipo="primario" disabled={enviando || !modal.nombre.trim()} onClick={enviar}>{enviando ? "Guardando…" : "Guardar"}</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
