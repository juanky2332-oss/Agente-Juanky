import { beforeAll, describe, expect, it } from "vitest";
import { accesoPermitido, credencialesDe, igual, leerCookie } from "./acceso";
import { COOKIE, firmar } from "./auth";

const env = { N8N_APP_KEY: "clave-del-bot-123", CRON_SECRET: "secreto-cron-456" };
let cookie = "";

beforeAll(async () => {
  process.env.AUTH_SECRET = "un-secreto-de-prueba-largo-123456";
  cookie = await firmar();
});

describe("accesoPermitido (misma lógica en proxy y en manejar)", () => {
  it("cookie de sesión válida entra en cualquier ruta", async () => {
    expect(await accesoPermitido({ ruta: "/api/gastos", cookie }, env)).toBe(true);
  });
  it("sin credenciales o con cookie falsa/manipulada no entra", async () => {
    expect(await accesoPermitido({ ruta: "/api/gastos" }, env)).toBe(false);
    expect(await accesoPermitido({ ruta: "/api/gastos", cookie: "123.abc" }, env)).toBe(false);
    const [exp, sig] = cookie.split(".");
    expect(await accesoPermitido({ ruta: "/api/gastos", cookie: `${+exp + 999}.${sig}` }, env)).toBe(false);
  });
  it("cookie caducada no entra", async () => {
    expect(await accesoPermitido({ ruta: "/api/x", cookie: "1000.firmafalsa" }, env)).toBe(false);
  });
  it("x-app-key del bot solo vale en /api/bot/*", async () => {
    expect(await accesoPermitido({ ruta: "/api/bot/gastos", appKey: env.N8N_APP_KEY }, env)).toBe(true);
    expect(await accesoPermitido({ ruta: "/api/bot/gastos", appKey: "otra" }, env)).toBe(false);
    expect(await accesoPermitido({ ruta: "/api/gastos", appKey: env.N8N_APP_KEY }, env)).toBe(false);
    expect(await accesoPermitido({ ruta: "/api/cron", appKey: env.N8N_APP_KEY }, env)).toBe(false);
  });
  it("sin N8N_APP_KEY configurada, una clave vacía no abre nada", async () => {
    expect(await accesoPermitido({ ruta: "/api/bot/gastos", appKey: "" }, {})).toBe(false);
  });
  it("Bearer del cron solo vale en /api/cron", async () => {
    expect(await accesoPermitido({ ruta: "/api/cron", authorization: "Bearer " + env.CRON_SECRET }, env)).toBe(true);
    expect(await accesoPermitido({ ruta: "/api/cron", authorization: "Bearer mal" }, env)).toBe(false);
    expect(await accesoPermitido({ ruta: "/api/cron", authorization: env.CRON_SECRET }, env)).toBe(false);
    expect(await accesoPermitido({ ruta: "/api/finanzas", authorization: "Bearer " + env.CRON_SECRET }, env)).toBe(false);
    expect(await accesoPermitido({ ruta: "/api/cron/ingresos", authorization: "Bearer " + env.CRON_SECRET }, env)).toBe(true);
    expect(await accesoPermitido({ ruta: "/api/cronx", authorization: "Bearer " + env.CRON_SECRET }, env)).toBe(false);
  });
  it("sin CRON_SECRET configurado, nadie entra por el cron", async () => {
    expect(await accesoPermitido({ ruta: "/api/cron", authorization: "Bearer " }, {})).toBe(false);
    expect(await accesoPermitido({ ruta: "/api/cron", authorization: "Bearer undefined" }, {})).toBe(false);
  });
});

describe("piezas", () => {
  it("igual() es estricto y no acepta vacíos", () => {
    expect(igual("a", "a")).toBe(true);
    expect(igual("a", "b")).toBe(false);
    expect(igual("", "")).toBe(false);
    expect(igual("ab", "a")).toBe(false);
  });
  it("leerCookie y credencialesDe leen la cabecera de una Request estándar", () => {
    expect(leerCookie(`a=1; ${COOKIE}=xyz.abc; b=2`, COOKIE)).toBe("xyz.abc");
    expect(leerCookie("a=1", COOKIE)).toBeUndefined();
    const c = credencialesDe(new Request("https://app.test/api/bot/propuesta?x=1", { headers: { cookie: `${COOKIE}=t.s`, "x-app-key": "k", authorization: "Bearer z" } }));
    expect(c).toEqual({ ruta: "/api/bot/propuesta", cookie: "t.s", appKey: "k", authorization: "Bearer z" });
  });
});
