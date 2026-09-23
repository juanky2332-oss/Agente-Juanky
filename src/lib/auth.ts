// Sesión firmada con HMAC (Web Crypto: funciona en proxy.ts y en las rutas).
export const COOKIE = "jk_sesion";
export const DURACION_S = 30 * 24 * 3600;

const enc = new TextEncoder();

async function clave() {
  const s = process.env.AUTH_SECRET || "";
  if (s.length < 16) throw new Error("AUTH_SECRET no configurado");
  return crypto.subtle.importKey("raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function firmar(): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + DURACION_S);
  const sig = await crypto.subtle.sign("HMAC", await clave(), enc.encode(exp));
  return exp + "." + b64(sig);
}

export async function valida(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || +exp < Date.now() / 1000) return false;
  try {
    const esperado = b64(await crypto.subtle.sign("HMAC", await clave(), enc.encode(exp)));
    if (esperado.length !== sig.length) return false;
    let d = 0;
    for (let i = 0; i < sig.length; i++) d |= sig.charCodeAt(i) ^ esperado.charCodeAt(i);
    return d === 0;
  } catch {
    return false;
  }
}

export function passwordOk(p: string): boolean {
  const real = process.env.APP_PASSWORD || "";
  if (!real || p.length !== real.length) return false;
  let d = 0;
  for (let i = 0; i < p.length; i++) d |= p.charCodeAt(i) ^ real.charCodeAt(i);
  return d === 0;
}
