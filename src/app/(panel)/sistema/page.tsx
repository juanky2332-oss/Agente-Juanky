"use client";
import { useApi, Tarjeta, Cargando, FalloCarga, Titulo, Kpi, Boton } from "@/components/ui";

interface W { id: string; nombre: string; existe: boolean; activo: boolean; actualizado: string; ultima: string; ultimoEstado: string; errores: number; ejecuciones: number }
interface E { id: string; nombre: string; status: string; startedAt: string; mode: string }

const f = (s: string) => (s ? new Date(s).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export default function Sistema() {
  const { datos, error, cargando, recargar } = useApi<{ workflows: W[]; ejecuciones: E[] }>("/api/sistema");
  if (cargando && !datos) return <Cargando texto="Preguntando a n8n…" />;
  if (error && !datos) return <FalloCarga error={error} reintentar={recargar} />;
  if (!datos) return null;
  const mal = datos.workflows.filter((w) => !w.existe || (!w.activo && w.id !== "b5vQp7gZYvsTCNbq"));
  const errores = datos.ejecuciones.filter((e) => e.status === "error");
  return (
    <div>
      <Titulo titulo="Sistema" sub="Estado de los workflows de n8n que mueven el bot y esta app (como /salud en Telegram)." extra={<Boton onClick={recargar}>Actualizar</Boton>} />
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Kpi etiqueta="Workflows" valor={datos.workflows.length} sub={`${datos.workflows.filter((w) => w.activo).length} activos`} />
        <Kpi etiqueta="Parados o ausentes" valor={mal.length} tono={mal.length ? "alerta" : "bien"} />
        <Kpi etiqueta="Errores recientes" valor={errores.length} sub="en las últimas 100 ejecuciones" tono={errores.length ? "aviso" : "bien"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Workflows">
          <ul className="divide-y divide-borde">
            {datos.workflows.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{w.existe ? (w.activo ? "✅" : "⏸") : "❌"} {w.nombre}</div>
                  <div className="text-[11px] text-txt-3">{w.id} · última ejecución {f(w.ultima)} {w.ultimoEstado && `(${w.ultimoEstado})`}</div>
                </div>
                {w.errores > 0 && <span className="text-xs text-alerta-txt shrink-0">{w.errores} errores</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-txt-3">Los subworkflows que se llaman desde otros (consultas) pueden salir «⏸»: no necesitan estar activos para funcionar.</p>
        </Tarjeta>
        <Tarjeta titulo="Últimas ejecuciones">
          <ul className="divide-y divide-borde text-sm">
            {datos.ejecuciones.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-1.5">
                <span className="truncate">{e.status === "error" ? "⛔" : e.status === "success" ? "✓" : "…"} {e.nombre}</span>
                <span className="text-[11px] text-txt-3 shrink-0">{f(e.startedAt)} · #{e.id}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  );
}
