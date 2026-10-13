import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { manejar } from "./ruta";
import { COOKIE, firmar } from "./auth";

let cookie = "";
beforeAll(async () => {
  process.env.AUTH_SECRET = "un-secreto-de-prueba-largo-123456";
  process.env.N8N_APP_KEY = "clave-del-bot-123";
  process.env.CRON_SECRET = "secreto-cron-456";
  cookie = await firmar();
});

const pide = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
const GET = manejar(async (_req: Request) => ({ ok: true }));

describe("manejar(): segunda comprobación de sesión", () => {
  it("sin sesión responde 401 y NO ejecuta el handler", async () => {
    let corrio = false;
    const h = manejar(async (_r: Request) => ((corrio = true), { ok: true }));
    const r = await h(pide("https://app.test/api/finanzas"));
    expect(r.status).toBe(401);
    expect(corrio).toBe(false);
  });
  it("con cookie válida pasa", async () => {
    const r = await GET(pide("https://app.test/api/finanzas", { cookie: `${COOKIE}=${cookie}` }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  it("el bot entra por /api/bot/* con x-app-key, pero no por otras rutas", async () => {
    expect((await GET(pide("https://app.test/api/bot/propuesta", { "x-app-key": "clave-del-bot-123" }))).status).toBe(200);
    expect((await GET(pide("https://app.test/api/finanzas", { "x-app-key": "clave-del-bot-123" }))).status).toBe(401);
  });
  it("el cron entra con Bearer solo en /api/cron", async () => {
    expect((await GET(pide("https://app.test/api/cron", { authorization: "Bearer secreto-cron-456" }))).status).toBe(200);
    expect((await GET(pide("https://app.test/api/cron", { authorization: "Bearer otro" }))).status).toBe(401);
  });
  it("sin Request (no hay credenciales) se cierra", async () => {
    const h = manejar(async () => ({ ok: true }));
    expect((await h()).status).toBe(401);
  });
  it("los errores del handler siguen saliendo como JSON", async () => {
    const h = manejar(async (_r: Request) => {
      throw new Error("boom");
    });
    const r = await h(pide("https://app.test/api/x", { cookie: `${COOKIE}=${cookie}` }));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "boom" });
  });
});
