"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// ───────────── datos ─────────────
export function useApi<T>(url: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string>("");
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marca de carga al cambiar la URL o recargar
    setCargando(true);
    // "Failed to fetch" = corte de red o el servidor arrancando (p.ej. justo tras un despliegue):
    // se reintenta solo dos veces antes de enseñar el error.
    const pedir = async (intento: number): Promise<T> => {
      let r: Response;
      try {
        r = await fetch(url, { cache: "no-store" });
      } catch {
        if (intento < 2) {
          await new Promise((ok) => setTimeout(ok, 1200 * (intento + 1)));
          return pedir(intento + 1);
        }
        throw new Error("No hay conexión con el servidor (¿sin cobertura o recién actualizada la app?). Dale a Reintentar.");
      }
      const j = await r.json().catch(() => ({ error: "Respuesta ilegible" }));
      if (r.status === 401) location.href = "/login";
      if (r.status >= 502 && intento < 1) return pedir(intento + 1);
      if (!r.ok) throw new Error(j.error || "Error " + r.status);
      return j as T;
    };
    pedir(0)
      .then((j) => vivo && (setDatos(j), setError("")))
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [url, version]);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, error, cargando, recargar, setDatos };
}

export async function llamar<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Comprueba la cobertura, recarga para ver si se guardó y repite si no está.");
  }
  const j = await r.json().catch(() => ({ error: "Respuesta ilegible del servidor" }));
  if (r.status === 401) location.href = "/login";
  if (!r.ok) throw new Error(j.error || "Error " + r.status);
  return j as T;
}

// ───────────── avisos (toasts) ─────────────
type Toast = { id: number; texto: string; tipo: "ok" | "error" };
let emitir: ((t: Omit<Toast, "id">) => void) | null = null;
export function avisar(texto: string, tipo: "ok" | "error" = "ok") {
  emitir?.({ texto, tipo });
}
export function Toasts() {
  const [lista, setLista] = useState<Toast[]>([]);
  useEffect(() => {
    emitir = (t) => {
      const id = Date.now() + Math.random();
      setLista((l) => [...l, { ...t, id }]);
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), t.tipo === "error" ? 9000 : 4500);
    };
    return () => {
      emitir = null;
    };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:max-w-md" aria-live="polite">
      {lista.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border px-4 py-3 text-sm shadow-lg bg-card ${t.tipo === "error" ? "border-alerta text-alerta-txt" : "border-borde"}`}
        >
          {t.tipo === "error" ? "⚠️ " : "✓ "}
          {t.texto}
        </div>
      ))}
    </div>
  );
}

// ───────────── piezas ─────────────
export function Tarjeta({ titulo, extra, children, className = "", sub }: { titulo?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-borde bg-card p-4 sm:p-5 min-w-0 ${className}`}>
      {(titulo || extra) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="text-[15px] font-semibold text-txt">{titulo}</h2>}
            {sub && <p className="text-xs text-txt-3 mt-0.5">{sub}</p>}
          </div>
          {extra && <div className="shrink-0 flex items-center gap-2">{extra}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ etiqueta, valor, sub, tono }: { etiqueta: string; valor: ReactNode; sub?: ReactNode; tono?: "bien" | "alerta" | "aviso" }) {
  const c = tono === "bien" ? "text-bien-txt" : tono === "alerta" ? "text-alerta-txt" : tono === "aviso" ? "text-aviso-txt" : "text-txt-3";
  return (
    <div className="rounded-2xl border border-borde bg-card p-4 min-w-0">
      <div className="text-xs font-medium text-txt-3 truncate">{etiqueta}</div>
      <div className="mt-1 text-2xl font-semibold tabular text-txt truncate">{valor}</div>
      {sub && <div className={`mt-1 text-xs tabular ${c}`}>{sub}</div>}
    </div>
  );
}

export function Boton({
  children, onClick, tipo = "normal", disabled, className = "", type = "button", title, pequeno,
}: {
  children: ReactNode; onClick?: () => void; tipo?: "normal" | "primario" | "peligro" | "fantasma"; disabled?: boolean; className?: string; type?: "button" | "submit"; title?: string; pequeno?: boolean;
}) {
  const t = {
    normal: "border border-borde bg-card hover:bg-card-2 text-txt",
    primario: "bg-acento text-white hover:opacity-90",
    peligro: "border border-alerta/50 text-alerta-txt hover:bg-alerta/10",
    fantasma: "text-txt-2 hover:bg-card-2",
  }[tipo];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg ${pequeno ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"} font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${t} ${className}`}
    >
      {children}
    </button>
  );
}

export function Campo({ etiqueta, children, ayuda, className = "" }: { etiqueta: string; children: ReactNode; ayuda?: string; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1 block text-xs font-medium text-txt-2">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] text-txt-3">{ayuda}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-borde bg-card px-3 py-2 text-sm text-txt placeholder:text-txt-3 focus:border-acento focus:outline-none";

export function Modal({ abierto, cerrar, titulo, children, ancho = "max-w-2xl" }: { abierto: boolean; cerrar: () => void; titulo: string; children: ReactNode; ancho?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [abierto, cerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} className={`w-full ${ancho} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-borde bg-card p-5 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{titulo}</h3>
          <button onClick={cerrar} className="rounded-lg px-2 py-1 text-txt-3 hover:bg-card-2" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Cargando({ texto = "Cargando datos de tus hojas…" }: { texto?: string }) {
  return (
    <div className="grid gap-3">
      <div className="text-sm text-txt-3">{texto}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl border border-borde bg-card animate-pulse" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-borde bg-card animate-pulse" />
    </div>
  );
}

export function FalloCarga({ error, reintentar }: { error: string; reintentar: () => void }) {
  return (
    <div className="rounded-2xl border border-alerta/40 bg-card p-5">
      <p className="font-medium text-alerta-txt">No he podido leer los datos</p>
      <p className="mt-1 text-sm text-txt-2">{error}</p>
      <Boton className="mt-3" onClick={reintentar}>
        Reintentar
      </Boton>
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-borde p-6 text-center text-sm text-txt-3">{children}</div>;
}

export function Chip({ children, activo, onClick }: { children: ReactNode; activo?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition whitespace-nowrap ${activo ? "border-acento bg-acento-suave text-acento" : "border-borde text-txt-2 hover:bg-card-2"}`}
    >
      {children}
    </button>
  );
}

const NIVEL = {
  alerta: { icono: "⛔", etiqueta: "Alerta", cls: "border-alerta/40", txt: "text-alerta-txt", barra: "bg-alerta" },
  aviso: { icono: "⚠️", etiqueta: "Ojo", cls: "border-aviso/50", txt: "text-aviso-txt", barra: "bg-aviso" },
  bien: { icono: "✅", etiqueta: "Bien", cls: "border-bien/40", txt: "text-bien-txt", barra: "bg-bien" },
  info: { icono: "💡", etiqueta: "Dato", cls: "border-borde", txt: "text-txt-2", barra: "bg-acento" },
} as const;

export function Estado({ nivel }: { nivel: keyof typeof NIVEL }) {
  const n = NIVEL[nivel];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${n.txt}`}>
      <span aria-hidden>{n.icono}</span>
      {n.etiqueta}
    </span>
  );
}

export function TarjetaHallazgo({ nivel, titulo, detalle, pie }: { nivel: keyof typeof NIVEL; titulo: string; detalle: string; pie?: ReactNode }) {
  const n = NIVEL[nivel];
  return (
    <div className={`relative overflow-hidden rounded-xl border ${n.cls} bg-card p-3.5 pl-4`}>
      <span className={`absolute left-0 top-0 h-full w-1 ${n.barra}`} aria-hidden />
      <Estado nivel={nivel} />
      <div className="mt-1 text-sm font-semibold text-txt">{titulo}</div>
      <p className="mt-1 text-[13px] leading-snug text-txt-2">{detalle}</p>
      {pie && <div className="mt-2">{pie}</div>}
    </div>
  );
}

/** Texto HTML de Telegram (<b> <i> <code> <a>) pintado de forma segura. */
export function HtmlTelegram({ html, className = "" }: { html: string; className?: string }) {
  const seguro = html
    .replace(/&(?!(amp|lt|gt|quot|#\d+);)/g, "&amp;")
    .replace(/<(?!\/?(b|i|u|s|code|pre|a|strong|em)(\s|>|\/))/gi, "&lt;")
    .replace(/<a\s+[^>]*href="(https?:[^"]+)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">')
    .replace(/\son\w+="[^"]*"/gi, "");
  return <div className={`prosa-tg whitespace-pre-wrap break-words text-sm leading-relaxed ${className}`} dangerouslySetInnerHTML={{ __html: seguro }} />;
}

export function Titulo({ titulo, sub, extra }: { titulo: string; sub?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-txt-3">{sub}</p>}
      </div>
      {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
    </div>
  );
}
