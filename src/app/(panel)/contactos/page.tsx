"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Vacio, llamar, avisar, inputCls, Campo, Modal, HtmlTelegram } from "@/components/ui";
import { claveEmpresa, normaliza } from "@/lib/parse";

type C = Record<string, string> & { fila: number };
interface Quien { exacto: string; interpretacion: string; nota: string; descartados: number; candidatos: { empresa: string; motivo: string; confianza: "alta" | "media" | "baja"; pregunta?: string; marcas: string[]; ficha: string[] }[] }
const CONF = { alta: { t: "Lo tiene seguro", cls: "bg-bien/15 text-bien-txt" }, media: { t: "Muy probable", cls: "bg-aviso/20 text-aviso-txt" }, baja: { t: "Puede ser: pregunta", cls: "bg-card-2 text-txt-2" } };

export default function Contactos() {
  const { datos, error, cargando, recargar } = useApi<{ cabecera: string[]; contactos: C[] }>("/api/contactos");
  const [q, setQ] = useState("");
  const [ed, setEd] = useState<C | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [prov, setProv] = useState("");
  const [provRes, setProvRes] = useState<Quien | null>(null);
  const [verExacto, setVerExacto] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const cab = datos?.cabecera || [];
  const lista = useMemo(() => {
    const t = normaliza(q);
    const k = claveEmpresa(q);
    return (datos?.contactos || [])
      .filter((c) => !t || normaliza(Object.values(c).join(" ")).includes(t) || (k.length >= 6 && claveEmpresa(c.Empresa).includes(k)))
      .sort((a, b) => (a.Empresa || "").localeCompare(b.Empresa || ""));
  }, [datos, q]);

  // Recuento de fichas por empresa, calculado al vuelo (no se escribe en la hoja)
  const grupos = useMemo(() => {
    const m = new Map<string, C[]>();
    for (const c of datos?.contactos || []) {
      const k = claveEmpresa(c.Empresa);
      if (k) m.set(k, [...(m.get(k) || []), c]);
    }
    return m;
  }, [datos]);

  const guardar = async () => {
    try {
      if (ed) await llamar("/api/contactos", "PATCH", { fila: ed.fila, esperado: ed.Empresa || "", datos: form });
      else await llamar("/api/contactos", "POST", form);
      avisar("Contacto guardado");
      setEd(null); setNuevo(false);
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const borrar = async (c: C) => {
    if (!confirm(`¿Borrar la ficha de ${c.Contacto || ""} (${c.Empresa})?`)) return;
    try {
      await llamar(`/api/contactos?fila=${c.fila}&esperado=${encodeURIComponent(c.Empresa || "")}`, "DELETE");
      avisar("Borrado");
      recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const buscarProv = async (e: React.FormEvent) => {
    e.preventDefault();
    setBuscando(true);
    try {
      setProvRes(null);
      setProvRes(await llamar<Quien>(`/api/contactos/quien?q=${encodeURIComponent(prov)}`, "GET"));
    } catch (x) {
      avisar((x as Error).message, "error");
    } finally {
      setBuscando(false);
    }
  };

  if (cargando && !datos) return <Cargando />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;

  return (
    <div>
      <Titulo titulo="Contactos y proveedores" sub={`${datos?.contactos.length || 0} fichas en «tarjetas visitas» · ${grupos.size} empresas`}
        extra={<Boton tipo="primario" onClick={() => (setForm({}), setEd(null), setNuevo(true))}>+ Nuevo contacto</Boton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="lg:col-span-2 order-2 lg:order-1" titulo="Fichas" extra={<input className={inputCls + " !w-48 !py-1 text-xs"} placeholder="Buscar empresa, persona, email…" value={q} onChange={(e) => setQ(e.target.value)} />}>
          {lista.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {lista.map((c) => {
                const n = grupos.get(claveEmpresa(c.Empresa))?.length || 1;
                return (
                  <div key={c.fila} className="rounded-xl border border-borde p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{c.Empresa || "—"} {n > 1 && <span className="text-[11px] font-normal text-txt-3">({n} fichas)</span>}</div>
                        <div className="text-txt-2">{c.Contacto}</div>
                      </div>
                      <span className="text-[11px] text-txt-3">#C{c.fila}</span>
                    </div>
                    <div className="mt-2 grid gap-0.5 text-xs text-txt-2">
                      {c.Telefono && <a href={`tel:${c.Telefono.split(/[;']/)[0].replace(/\s/g, "")}`} className="hover:text-acento">☏ {c.Telefono}</a>}
                      {c.Email && <a href={`mailto:${c.Email}`} className="hover:text-acento truncate">✉ {c.Email}</a>}
                      {c["Pagina Web"] && <span className="truncate">🌐 {c["Pagina Web"]}</span>}
                      {c.Otros?.trim() && <span className="text-txt-3">{c.Otros}</span>}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Boton pequeno tipo="fantasma" onClick={() => { setEd(c); setForm(Object.fromEntries(cab.map((k) => [k, c[k] || ""]))); setNuevo(true); }}>✎ Editar</Boton>
                      <Boton pequeno tipo="fantasma" onClick={() => borrar(c)}>🗑</Boton>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Vacio>Sin resultados.</Vacio>}
        </Tarjeta>
        <Tarjeta className="order-1 lg:order-2" titulo="🔎 ¿Quién me lo puede vender?" sub="Escribe un producto, material o marca. Te digo quién lo tiene seguro (está en tus hojas) y quién probablemente (por las marcas que distribuye), con su teléfono.">
          <form onSubmit={buscarProv} className="flex gap-2">
            <input className={inputCls} value={prov} onChange={(e) => setProv(e.target.value)} placeholder="rodamiento 6205, variador Omron, banda PU…" />
            <Boton type="submit" tipo="primario" disabled={buscando || prov.trim().length < 2}>{buscando ? "Buscando…" : "Buscar"}</Boton>
          </form>
          {buscando && <p className="mt-3 animate-pulse text-xs text-txt-3">Cruzando tus fichas, la matriz de marcas y el maestro de proveedores…</p>}
          {provRes && (
            <div className="mt-3 grid gap-3">
              {provRes.interpretacion && <p className="text-xs text-txt-3">Entiendo: {provRes.interpretacion}</p>}
              {provRes.candidatos.length ? provRes.candidatos.map((k) => {
                const fichas = (datos?.contactos || []).filter((c) => claveEmpresa(c.Empresa) === claveEmpresa(k.empresa));
                return (
                  <div key={k.empresa} className="rounded-xl border border-borde p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{k.empresa}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONF[k.confianza].cls}`}>{CONF[k.confianza].t}</span>
                    </div>
                    <p className="mt-1 text-xs text-txt-2">{k.motivo}</p>
                    {k.pregunta && <p className="mt-1 text-xs text-txt-3">📞 Pregúntale: {k.pregunta}</p>}
                    {fichas.map((c) => (
                      <div key={c.fila} className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span className="text-txt-2">{c.Contacto || "—"}</span>
                        {c.Telefono && <a className="text-acento" href={`tel:${c.Telefono.split(/[;']/)[0].replace(/s/g, "")}`}>☏ {c.Telefono.split(/[;']/)[0]}</a>}
                        {c.Email && <a className="text-acento" href={`mailto:${c.Email}`}>✉ {c.Email}</a>}
                      </div>
                    ))}
                    {!fichas.length && <p className="mt-2 text-[11px] text-txt-3">Sin ficha de contacto: está en tu matriz de marcas.</p>}
                  </div>
                );
              }) : <Vacio>{provRes.nota || "Ninguno de tus proveedores parece tenerlo."}</Vacio>}
              {provRes.candidatos.length > 0 && provRes.nota && <p className="text-xs text-txt-3">{provRes.nota}</p>}
              <p className="text-[11px] text-txt-3">«Lo tiene seguro» = está escrito en tu ficha o en su lista de marcas. Lo demás es una deducción: confírmalo al llamar.</p>
              {provRes.exacto && (
                <div>
                  <Boton pequeno tipo="fantasma" onClick={() => setVerExacto(!verExacto)}>{verExacto ? "Ocultar" : "Ver"} coincidencias exactas en tus hojas</Boton>
                  {verExacto && <div className="mt-2 max-h-[50vh] overflow-y-auto scroll-fino rounded-lg bg-card-2 p-3"><HtmlTelegram html={provRes.exacto} /></div>}
                </div>
              )}
            </div>
          )}
        </Tarjeta>
      </div>
      <Modal abierto={nuevo} cerrar={() => setNuevo(false)} titulo={ed ? `Editar #C${ed.fila}` : "Nuevo contacto"}>
        <div className="grid gap-3 sm:grid-cols-2">
          {cab.map((k) => (
            <Campo key={k} etiqueta={k} className={k === "Direccion" || k === "Otros" ? "sm:col-span-2" : ""}>
              <input className={inputCls} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </Campo>
          ))}
        </div>
        {!ed && form.Empresa && (grupos.get(claveEmpresa(form.Empresa))?.length || 0) > 0 && (
          <p className="mt-3 text-xs text-aviso-txt">Ya tienes {grupos.get(claveEmpresa(form.Empresa))!.length} ficha(s) de esta empresa: {grupos.get(claveEmpresa(form.Empresa))!.map((c) => c.Contacto || "sin nombre").join(", ")}. Si es otra persona, adelante.</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Boton onClick={() => setNuevo(false)}>Cancelar</Boton>
          <Boton tipo="primario" onClick={guardar}>Guardar</Boton>
        </div>
      </Modal>
    </div>
  );
}
