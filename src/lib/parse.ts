// Utilidades compartidas (servidor y cliente). La hoja mezcla formatos:
// "2.475,00€", "82.07", "0,33", "may 18, 2026", "04/03/2026", "2026-08-05"...
// Todo lo que sea número o fecha pasa por aquí.

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/[^0-9,.\-]/g, "").trim();
  if (!s || s === "-") return 0;
  const c = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (c > -1 && p > -1) s = c > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c > -1) {
    // "1,234" con 3 decimales exactos y sin más comas es ambiguo: en esta hoja siempre es decimal español
    s = s.replace(/,/g, ".");
    const partes = s.split(".");
    if (partes.length > 2) s = partes.slice(0, -1).join("") + "." + partes[partes.length - 1];
  } else if (p > -1) {
    const partes = s.split(".");
    // "1.234.567" = miles; "1.234" solo es miles si hay más de un punto
    if (partes.length > 2) s = partes.join("");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function tieneNumero(v: unknown): boolean {
  return /\d/.test(String(v ?? ""));
}

const MESES: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

/** Devuelve "YYYY-MM-DD" o null. */
export function fechaISO(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, +m[2], +m[1]);
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  // "may 18, 2026" / "18 may 2026" / "18 de mayo de 2026"
  m = t.match(/^([a-zé]{3})[a-zé]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MESES[m[1]]) return iso(+m[3], MESES[m[1]], +m[2]);
  m = t.match(/^(\d{1,2})\s+(?:de\s+)?([a-zé]{3})[a-zé]*\.?\s+(?:de\s+)?(\d{4})/);
  if (m && MESES[m[2]]) return iso(+m[3], MESES[m[2]], +m[1]);
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (!(y > 1990 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "dd/MM/yyyy HH:mm" → Date (hora de Madrid aproximada como local) */
export function fechaHora(v: unknown): Date | null {
  const t = String(v ?? "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

export function isoAEs(isoStr: string | null): string {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-");
  return `${d}/${m}/${y}`;
}

export function mesClave(isoStr: string): string {
  return isoStr.slice(0, 7);
}

const NOMBRE_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function mesCorto(clave: string): string {
  const [y, m] = clave.split("-");
  return `${NOMBRE_MES[+m - 1]} ${y.slice(2)}`;
}
export function mesLargo(clave: string): string {
  const largos = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [y, m] = clave.split("-");
  return `${largos[+m - 1]} ${y}`;
}

export function eur(n: number, dec = 2): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";
}
export function eur0(n: number): string {
  return eur(n, Math.abs(n) >= 1000 ? 0 : 2);
}
export function pct(n: number, dec = 0): string {
  return (n > 0 ? "+" : "") + n.toLocaleString("es-ES", { maximumFractionDigits: dec }) + " %";
}

export function normaliza(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de empresa: sin acentos, sin espacios y sin forma jurídica (igual que el bot). */
export function claveEmpresa(s: unknown): string {
  return normaliza(s)
    .replace(/\b(s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?c\.?|c\.?\s?b\.?|pbc|inc|ltd|llc|gmbh|sau|slu)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function hoyISO(): string {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())!;
}
export function hoyEs(): string {
  return isoAEs(hoyISO());
}
