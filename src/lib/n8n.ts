import "server-only";

// Todo pasa por el workflow "API APP JUANKY (dashboard)" de n8n: allí viven las
// credenciales de Google, OpenAI y Telegram. La app nunca las ve.
const BASE = process.env.N8N_BASE_URL || "https://paneln8n.transformaconia.com";
const KEY = process.env.N8N_APP_KEY || "";

export class ErrorN8n extends Error {
  status: number;
  constructor(msg: string, status = 500) {
    super(msg);
    this.status = status;
  }
}

export async function n8n<T = unknown>(body: Record<string, unknown>, timeoutMs = 60000): Promise<T> {
  if (!KEY) throw new ErrorN8n("Falta N8N_APP_KEY en las variables de entorno");
  const r = await fetch(BASE + "/webhook/app-juanky-api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-key": KEY },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const txt = await r.text();
  let j: { ok?: boolean; status?: number; data?: unknown };
  try {
    j = JSON.parse(txt);
  } catch {
    throw new ErrorN8n("n8n devolvió algo que no es JSON: " + txt.slice(0, 200), 502);
  }
  if (!j.ok) {
    const d = j.data as { error?: { message?: string } } | string | undefined;
    const msg = typeof d === "string" ? d : d?.error?.message || JSON.stringify(d).slice(0, 300);
    throw new ErrorN8n(msg || "error en n8n", j.status || 502);
  }
  return j.data as T;
}

/** Webhooks de los workflows que ya usa el bot (mismo motor, mismas reglas). */
export async function webhook<T = unknown>(path: string, body: unknown, timeoutMs = 90000): Promise<T> {
  const r = await fetch(BASE + "/webhook/" + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-app-key": KEY },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const txt = await r.text();
  if (!r.ok) throw new ErrorN8n(`${path}: ${r.status} ${txt.slice(0, 200)}`, 502);
  try {
    return JSON.parse(txt) as T;
  } catch {
    return txt as unknown as T;
  }
}

export async function avisarTelegram(texto: string): Promise<boolean> {
  try {
    await n8n({ op: "telegram", texto });
    return true;
  } catch {
    return false;
  }
}

export function escHtml(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
