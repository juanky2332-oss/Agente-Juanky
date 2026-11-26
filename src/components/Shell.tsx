"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, ViewTransition, type ReactNode } from "react";
import { Toasts } from "./ui";

const NAV = [
  { href: "/", txt: "Inicio", ico: "◧" },
  { href: "/gastos", txt: "Gastos", ico: "€", destacado: true },
  { href: "/ingresos", txt: "Ingresos", ico: "↗" },
  { href: "/tareas", txt: "Tareas", ico: "✓" },
  { href: "/agenda", txt: "Agenda", ico: "▦" },
  { href: "/chat", txt: "Asistente", ico: "✦" },
  { href: "/contactos", txt: "Contactos", ico: "☏" },
  { href: "/gastro", txt: "Gastro", ico: "🍷" },
  { href: "/estudio", txt: "Estudio", ico: "📚" },
  { href: "/correo", txt: "Correo", ico: "✉" },
  { href: "/sistema", txt: "Sistema", ico: "⚙" },
];
const MOVIL = ["/", "/gastos", "/ingresos", "/tareas", "/chat"];

const indiceDe = (ruta: string) => {
  const i = NAV.findIndex((n) => (n.href === "/" ? ruta === "/" : ruta.startsWith(n.href)));
  return i < 0 ? 0 : i;
};
/** Ir a una sección de más abajo en el menú = «adelante»; a una de más arriba = «atrás». */
const tipoHacia = (desde: string, hacia: string) => {
  const a = indiceDe(desde), b = indiceDe(hacia);
  return a === b ? [] : [b > a ? "seccion-adelante" : "seccion-atras"];
};

function Tema() {
  const [t, setT] = useState<string>("auto");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador
      setT(localStorage.getItem("tema") || "auto");
    } catch {}
  }, []);
  const cambiar = () => {
    const sig = t === "auto" ? "dark" : t === "dark" ? "light" : "auto";
    setT(sig);
    try {
      if (sig === "auto") {
        localStorage.removeItem("tema");
        delete document.documentElement.dataset.theme;
      } else {
        localStorage.setItem("tema", sig);
        document.documentElement.dataset.theme = sig;
      }
    } catch {}
  };
  return (
    <button onClick={cambiar} className="pulsable rounded-lg px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-txt-2 hover:bg-card-2" title="Cambiar tema">
      {t === "auto" ? "◐ Auto" : t === "dark" ? "● Oscuro" : "○ Claro"}
    </button>
  );
}

function Logo({ grande }: { grande?: boolean }) {
  return (
    <span className={`logo-j grid place-items-center font-display font-bold text-white ${grande ? "h-8 w-8 rounded-lg text-sm" : "h-7 w-7 rounded-lg text-xs"}`}>J</span>
  );
}

const nada = () => () => {};
export default function Shell({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  // Todo depende de la hora y los datos del navegador: nada se prerenderiza (evita desajustes de hidratación)
  const enCliente = useSyncExternalStore(nada, () => true, () => false);
  const [menu, setMenu] = useState(false);
  const [rutaMenu, setRutaMenu] = useState(ruta);
  if (rutaMenu !== ruta) {
    setRutaMenu(ruta);
    setMenu(false);
  }
  const activo = (h: string) => (h === "/" ? ruta === "/" : ruta.startsWith(h));
  const seccion = NAV[indiceDe(ruta)];
  const salir = async () => {
    await fetch("/api/login", { method: "DELETE" });
    location.href = "/login";
  };
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="cristal hidden lg:flex sticky top-0 h-dvh flex-col border-r border-borde px-3 py-4" style={{ viewTransitionName: "menu-lateral" }}>
        <Link href="/" transitionTypes={tipoHacia(ruta, "/")} className="mb-6 flex items-center gap-2.5 px-2">
          <Logo grande />
          <span>
            <span className="block font-display text-sm font-semibold leading-tight tracking-wide">JUANKY</span>
            <span className="block font-mono text-[10px] uppercase leading-tight tracking-[0.14em] text-txt-3">centro de mando</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto scroll-fino">
          {NAV.map((n) => {
            const on = activo(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                transitionTypes={tipoHacia(ruta, n.href)}
                aria-current={on ? "page" : undefined}
                className={`pulsable relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${on ? "font-semibold text-acento" : "text-txt-2 hover:bg-card-2 hover:text-txt"}`}
              >
                {on && (
                  <ViewTransition name="nav-activo">
                    <span aria-hidden className="absolute inset-0 rounded-lg border border-acento/25 bg-acento-suave">
                      <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-neon shadow-[0_0_10px_var(--neon)]" />
                    </span>
                  </ViewTransition>
                )}
                <span className="relative w-4 text-center" aria-hidden>{n.ico}</span>
                <span className="relative">{n.txt}</span>
                {n.destacado && <span className="relative ml-auto rounded border border-acento/40 px-1.5 font-mono text-[9px] uppercase tracking-wider text-acento">foco</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-3 flex items-center justify-between border-t border-borde pt-3">
          <Tema />
          <button onClick={salir} className="pulsable rounded-lg px-2.5 py-1.5 text-xs text-txt-3 hover:bg-card-2 hover:text-txt">Salir</button>
        </div>
      </aside>

      {/* Móvil: cabecera + barra inferior */}
      <header className="cristal lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-borde px-4 py-2.5" style={{ viewTransitionName: "cabecera-movil" }}>
        <Link href="/" transitionTypes={tipoHacia(ruta, "/")} className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-sm font-semibold tracking-wide">JUANKY</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-txt-3">/ {seccion.txt}</span>
        </Link>
        <div className="flex items-center gap-1">
          <Tema />
          <button onClick={() => setMenu(!menu)} className="pulsable rounded-lg px-3 py-1.5 text-sm hover:bg-card-2" aria-expanded={menu} aria-label="Menú">
            {menu ? "✕" : "☰"}
          </button>
        </div>
      </header>
      {menu && (
        <div className="cristal ventana-modal lg:hidden fixed inset-x-0 top-[49px] z-40 border-b border-borde p-3 shadow-xl grid grid-cols-3 gap-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} transitionTypes={tipoHacia(ruta, n.href)} className={`pulsable rounded-lg border px-2 py-3 text-center text-xs ${activo(n.href) ? "border-acento/40 bg-acento-suave text-acento font-semibold" : "border-borde bg-card-2 text-txt-2"}`}>
              <div className="text-base" aria-hidden>{n.ico}</div>
              {n.txt}
            </Link>
          ))}
          <button onClick={salir} className="col-span-3 rounded-lg py-2 text-xs text-txt-3">Cerrar sesión</button>
        </div>
      )}

      <main className="min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-7 max-w-[1400px] w-full">
        {enCliente ? (
          <ViewTransition
            key={seccion.href}
            enter={{ "seccion-adelante": "seccion-adelante", "seccion-atras": "seccion-atras", default: "none" }}
            exit={{ "seccion-adelante": "seccion-adelante", "seccion-atras": "seccion-atras", default: "none" }}
            default="none"
          >
            <div>{children}</div>
          </ViewTransition>
        ) : null}
      </main>

      <nav className="cristal lg:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-borde pb-[env(safe-area-inset-bottom)]" style={{ viewTransitionName: "barra-movil" }}>
        {NAV.filter((n) => MOVIL.includes(n.href)).map((n) => {
          const on = activo(n.href);
          return (
            <Link key={n.href} href={n.href} transitionTypes={tipoHacia(ruta, n.href)} aria-current={on ? "page" : undefined} className={`pulsable relative flex flex-col items-center py-2 text-[11px] ${on ? "text-acento font-semibold" : "text-txt-3"}`}>
              {on && (
                <ViewTransition name="nav-activo-movil">
                  <span aria-hidden className="absolute left-1/2 top-0 h-[2px] w-8 -translate-x-1/2 rounded-b bg-neon shadow-[0_0_10px_var(--neon)]" />
                </ViewTransition>
              )}
              <span className="text-base leading-none mb-0.5" aria-hidden>{n.ico}</span>
              {n.txt}
            </Link>
          );
        })}
      </nav>
      <Toasts />
    </div>
  );
}
