// Quién puede entrar. UNA sola lógica para src/proxy.ts (primera puerta) y manejar() de ruta.ts
// (segunda puerta: si el proxy falla o cambia el matcher, la ruta sigue protegida).
//   - Panel: cookie jk_sesion firmada con HMAC (AUTH_SECRET).
//   - /api/bot/*: cabecera x-app-key = N8N_APP_KEY (el bot de Telegram en n8n).
//   - /api/cron: Authorization: Bearer <CRON_SECRET> (cron diario de Vercel).
// Sin dependencias de servidor (Web Crypto): vale en el proxy y en las rutas.
import { COOKIE, valida } from "./auth";

/** Comparación en tiempo constante; vacío nunca es igual. */
export function igual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export interface Credenciales {
  ruta: string; // pathname
  cookie?: string; // valor de jk_sesion
  appKey?: string; // cabecera x-app-key
  authorization?: string; // cabecera authorization
}

/** ¿Trae credenciales válidas para esa ruta? */
export async function accesoPermitido(c: Credenciales, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  // El bot de Telegram (n8n) entra con la misma clave compartida del workflow de la API.
  if (c.ruta.startsWith("/api/bot/") && igual(c.appKey || "", env.N8N_APP_KEY || "")) return true;
  // Cron diario de Vercel (manda "Authorization: Bearer <CRON_SECRET>").
  if (c.ruta === "/api/cron" && igual(c.authorization || "", "Bearer " + (env.CRON_SECRET || "\u0000"))) return true;
  return valida(c.cookie);
}

/** Valor de una cookie en una cabecera "cookie: a=1; b=2". */
export function leerCookie(cabecera: string | null | undefined, nombre: string): string | undefined {
  for (const par of String(cabecera || "").split(";")) {
    const i = par.indexOf("=");
    if (i > 0 && par.slice(0, i).trim() === nombre) return par.slice(i + 1).trim();
  }
  return undefined;
}

/** Lo mismo a partir de una Request estándar (la que reciben las rutas). */
export function credencialesDe(req: Request): Credenciales {
  return {
    ruta: new URL(req.url).pathname,
    cookie: leerCookie(req.headers.get("cookie"), COOKIE),
    appKey: req.headers.get("x-app-key") || "",
    authorization: req.headers.get("authorization") || "",
  };
}
