"use client";
import { useMemo, useState } from "react";
import { useApi, Tarjeta, Boton, Cargando, FalloCarga, Titulo, Vacio, llamar, avisar, inputCls, Campo, Modal, HtmlTelegram } from "@/components/ui";
import { claveEmpresa, normaliza } from "@/lib/parse";

type C = Record<string, string> & { fila: number };

export default function Contactos() {
  const { datos, error, cargando, recargar } = useApi<{ cabecera: string[]; contactos: C[] }>("/api/contactos");
  const [q, setQ] = useState("");
  const [ed, setEd] = useState<C | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [prov, setProv] = useState("");
  const [provRes, setProvRes] = useState("");
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
      setProvRes((await llamar<{ resultado: string }>(`/api/proveedores?q=${encodeURIComponent(prov)}`, "GET")).resultado);
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
        <Tarjeta className="lg:col-span-2" titulo="Fichas" extra={<input className={inputCls + " !w-48 !py-1 text-xs"} placeholder="Buscar empresa, persona, email…" value={q} onChange={(e) => setQ(e.target.value)} />}>
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
        <Tarjeta titulo="Buscador de proveedores" sub="El mismo motor que /prov del bot: fichas de contacto + maestro de acreedores.">
          <form onSubmit={buscarProv} className="flex gap-2">
            <input className={inputCls} value={prov} onChange={(e) => setProv(e.target.value)} placeholder="Omron, rodamientos, OC Soluciones…" />
            <Boton type="submit" disabled={buscando || !prov.trim()}>{buscando ? "…" : "Buscar"}</Boton>
          </form>
          {provRes && <div className="mt-3 max-h-[60vh] overflow-y-auto scroll-fino rounded-lg bg-card-2 p-3"><HtmlTelegram html={provRes} /></div>}
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
