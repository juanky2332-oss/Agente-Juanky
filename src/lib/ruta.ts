import "server-only";
import { NextResponse } from "next/server";
import { ErrorN8n } from "./n8n";
import { accesoPermitido, credencialesDe } from "./acceso";

/**
 * Envuelve un handler: cualquier error sale como JSON legible, nunca como página de error.
 * Y repite la comprobación de acceso del proxy (lib/acceso.ts): si el proxy se salta una ruta
 * por un matcher mal puesto, la ruta sigue cerrada. Única ruta que NO pasa por aquí a propósito:
 * /api/login (es la que da la cookie).
 */
export function manejar<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
  return async (...a: A) => {
    try {
      const req = a.find((x): x is Request => x instanceof Request);
      // Sin Request no hay credenciales que mirar: se cierra.
      if (!req || !(await accesoPermitido(credencialesDe(req)))) return NextResponse.json({ error: "Sesión caducada. Vuelve a entrar." }, { status: 401 });
      const r = await fn(...a);
      return r instanceof Response ? r : NextResponse.json(r);
    } catch (e) {
      const status = e instanceof ErrorN8n ? e.status : 500;
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[api]", msg);
      return NextResponse.json({ error: msg }, { status: status >= 400 && status < 600 ? status : 500 });
    }
  };
}

export function nuevoId(prefijo = "A") {
  return prefijo + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}
