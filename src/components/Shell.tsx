"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
  { href: "/bebe", txt: "Bebé", ico: "🍼" },
  { href: "/correo", txt: "Correo", ico: "✉" },
  { href: "/sistema", txt: "Sistema", ico: "⚙" },
];
const MOVIL = ["/", "/gastos", "/ingresos", "/tareas", "/chat"];

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
    <button onClick={cambiar} className="rounded-lg px-2.5 py-1.5 text-xs text-txt-2 hover:bg-card-2" title="Cambiar tema">
      {t === "auto" ? "◐ Auto" : t === "dark" ? "● Oscuro" : "○ Claro"}
    </button>
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
  const salir = async () => {
    await fetch("/api/login", { method: "DELETE" });
    location.href = "/login";
  };
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden lg:flex sticky top-0 h-dvh flex-col border-r border-borde bg-card px-3 py-4">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-acento text-sm font-bold text-white">J</span>
          <span>
            <span className="block text-sm font-semibold leading-tight">Juanky</span>
            <span className="block text-[11px] text-txt-3 leading-tight">panel del asistente</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto scroll-fino">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${activo(n.href) ? "bg-acento-suave font-semibold text-acento" : "text-txt-2 hover:bg-card-2"}`}
            >
              <span className="w-4 text-center" aria-hidden>{n.ico}</span>
              {n.txt}
              {n.destacado && <span className="ml-auto rounded bg-acento px-1.5 text-[10px] font-semibold text-white">foco</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-3 flex items-center justify-between border-t border-borde pt-3">
          <Tema />
          <button onClick={salir} className="rounded-lg px-2.5 py-1.5 text-xs text-txt-3 hover:bg-card-2">Salir</button>
        </div>
      </aside>

      {/* Móvil: cabecera + barra inferior */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-borde bg-card/95 backdrop-blur px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-acento text-xs font-bold text-white">J</span>
          <span className="text-sm font-semibold">Juanky</span>
        </Link>
        <div className="flex items-center gap-1">
          <Tema />
          <button onClick={() => setMenu(!menu)} className="rounded-lg px-3 py-1.5 text-sm hover:bg-card-2" aria-expanded={menu}>
            {menu ? "✕" : "☰"}
          </button>
        </div>
      </header>
      {menu && (
        <div className="lg:hidden fixed inset-x-0 top-[49px] z-40 border-b border-borde bg-card p-3 shadow-xl grid grid-cols-3 gap-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rounded-lg px-2 py-3 text-center text-xs ${activo(n.href) ? "bg-acento-suave text-acento font-semibold" : "text-txt-2 bg-card-2"}`}>
              <div className="text-base" aria-hidden>{n.ico}</div>
              {n.txt}
            </Link>
          ))}
          <button onClick={salir} className="col-span-3 rounded-lg py-2 text-xs text-txt-3">Cerrar sesión</button>
        </div>
      )}

      <main className="min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-7 max-w-[1400px] w-full">{enCliente ? children : null}</main>

      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-borde bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {NAV.filter((n) => MOVIL.includes(n.href)).map((n) => (
          <Link key={n.href} href={n.href} className={`flex flex-col items-center py-2 text-[11px] ${activo(n.href) ? "text-acento font-semibold" : "text-txt-3"}`}>
            <span className="text-base leading-none mb-0.5" aria-hidden>{n.ico}</span>
            {n.txt}
          </Link>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}
