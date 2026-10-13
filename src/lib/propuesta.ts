// Propuesta comercial de «TransformaConIA Gestión» en PDF (2 páginas). Sin red: solo datos -> bytes.
// Tarifa vigente (web transformaconia.com/erp-industria/ y landing, 2026-10): puesta en marcha 690 €
// (tarifa general 990 €) en dos pagos de 345 €, mantenimiento 69 €/mes con los 3 primeros meses
// gratis, usuario extra 15 €/mes desde el primer mes, sin permanencia (30 días de aviso). Importes sin IVA y orientativos.
// REGLA: en lo comercial NUNCA aparece «Flownexion».
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LOGO_PNG_B64, LOGO_ANCHO, LOGO_ALTO } from "./propuestaLogo";

export const TARIFA = {
  puestaEnMarcha: 690,
  puestaEnMarchaGeneral: 990,
  pagoInicial: 345,
  pagoMes3: 345,
  mantenimientoMes: 69,
  mesesGratis: 3,
  usuarioExtraMes: 15,
  contacto: "info@transformaconia.com",
} as const;

export interface PeticionPropuesta {
  cliente: string;
  usuariosExtra?: number | string;
  modulos?: string[] | string;
  notas?: string;
}

export interface DatosPropuesta {
  cliente: string;
  usuariosExtra: number;
  modulos: string[];
  notas: string;
}

export class ErrorPropuesta extends Error {}

const limpia = (v: unknown) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** Valida y normaliza lo que manda el bot. Lanza ErrorPropuesta (400) si algo no vale. */
export function validarPeticion(b: Partial<PeticionPropuesta> | null | undefined): DatosPropuesta {
  const cliente = limpia(b?.cliente);
  if (!cliente) throw new ErrorPropuesta("Falta el nombre del cliente (cliente).");
  if (cliente.length > 120) throw new ErrorPropuesta("El nombre del cliente es demasiado largo (máximo 120 caracteres).");
  const bruto = b?.usuariosExtra;
  const n = bruto === undefined || bruto === null || String(bruto).trim() === "" ? 0 : Number(String(bruto).replace(",", "."));
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new ErrorPropuesta("usuariosExtra tiene que ser un número entero entre 0 y 100.");
  const modulos = (Array.isArray(b?.modulos) ? b!.modulos : String(b?.modulos ?? "").split(/[,;\n]+/))
    .map(limpia)
    .filter(Boolean)
    .slice(0, 12)
    .map((m) => m.slice(0, 60));
  const notas = limpia(b?.notas).slice(0, 400);
  if (/flownexion/i.test([cliente, notas, ...modulos].join(" "))) throw new ErrorPropuesta("La oferta es de TransformaConIA Gestión: no se puede nombrar a otra marca en el documento.");
  return { cliente, usuariosExtra: n, modulos, notas };
}

/** Cuota mensual a partir del mes 4: mantenimiento + usuarios extra (estos se cobran ya desde el mes 1). */
export const cuotaMensual = (usuariosExtra: number) => TARIFA.mantenimientoMes + usuariosExtra * TARIFA.usuarioExtraMes;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// En Vercel el reloj va en UTC: la fecha del PDF es la de Madrid.
const enMadrid = (d: Date) => new Date(d.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
export const fechaLarga = (d: Date) => { const m = enMadrid(d); return `${m.getDate()} de ${MESES[m.getMonth()]} de ${m.getFullYear()}`; };
const fechaCorta = (d0: Date) => { const d = enMadrid(d0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €`;

/** Nombre de archivo seguro: Propuesta-TransformaConIA-Gestion-Talleres-Demo-SL-2026-10-13.pdf */
export function nombreArchivo(cliente: string, hoy: Date) {
  const slug = cliente.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "cliente";
  return `Propuesta-TransformaConIA-Gestion-${slug}-${fechaCorta(hoy)}.pdf`;
}

// ─── Dibujo ────────────────────────────────────────────────────────────────────────────────

const C = {
  ink: rgb(0.071, 0.071, 0.102),
  muted: rgb(0.357, 0.349, 0.439),
  line: rgb(0.894, 0.886, 0.925),
  soft: rgb(0.965, 0.957, 0.984),
  purple: rgb(0.69, 0.125, 1),
  purpleDark: rgb(0.478, 0.071, 0.722),
  purpleSoft: rgb(0.953, 0.902, 1),
  purpleLight: rgb(0.824, 0.482, 1),
  dark: rgb(0.035, 0.035, 0.047),
  white: rgb(1, 1, 1),
  grey: rgb(0.74, 0.73, 0.8),
};
const W = 595.28, H = 841.89, M = 50;

interface Fuentes { r: PDFFont; b: PDFFont }

/** Solo caracteres que la fuente estándar (WinAnsi) sabe pintar; el resto se cambia por «?». */
function seguro(f: PDFFont, t: string) {
  const ok = new Set(f.getCharacterSet());
  return [...t].map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function trocear(f: PDFFont, texto: string, tam: number, ancho: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const palabra of seguro(f, texto).split(" ")) {
    let p = palabra;
    // Palabra más larga que la línea: se parte.
    while (p.length > 1 && f.widthOfTextAtSize(p, tam) > ancho) {
      let k = p.length - 1;
      while (k > 1 && f.widthOfTextAtSize(p.slice(0, k), tam) > ancho) k--;
      if (cur) out.push(cur), (cur = "");
      out.push(p.slice(0, k));
      p = p.slice(k);
    }
    const prueba = cur ? cur + " " + p : p;
    if (f.widthOfTextAtSize(prueba, tam) <= ancho) cur = prueba;
    else {
      out.push(cur);
      cur = p;
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface Opc { x: number; y: number; tam: number; font: PDFFont; color?: ReturnType<typeof rgb>; ancho?: number; interlinea?: number; maxLineas?: number; derecha?: boolean }

/** Escribe texto con saltos de línea automáticos. Devuelve la y justo debajo del último renglón. */
function parrafo(p: PDFPage, texto: string, o: Opc): number {
  const ancho = o.ancho ?? (o.derecha ? o.x - M : W - M - o.x);
  const inter = o.interlinea ?? o.tam * 1.4;
  let ls = trocear(o.font, texto, o.tam, ancho);
  if (o.maxLineas && ls.length > o.maxLineas) {
    ls = ls.slice(0, o.maxLineas);
    let u = ls[o.maxLineas - 1];
    while (u.length > 1 && o.font.widthOfTextAtSize(u + "...", o.tam) > ancho) u = u.slice(0, -1);
    ls[o.maxLineas - 1] = u.trimEnd() + "...";
  }
  let y = o.y;
  for (const l of ls) {
    const x = o.derecha ? o.x - o.font.widthOfTextAtSize(l, o.tam) : o.x;
    p.drawText(l, { x, y, size: o.tam, font: o.font, color: o.color ?? C.ink });
    y -= inter;
  }
  return y;
}

const INCLUYE = [
  "Calculadora de costes y precios",
  "Presupuestos con tu logo en un clic",
  "Albaranes y partes firmados en el móvil",
  "Facturas, cobros y vencimientos",
  "Gastos por foto en Telegram",
  "Fiscal y asesor: paquete trimestral",
  "Agenda compartida del equipo",
  "Informes: facturado, cobrado, pendiente",
  "Asistente de IA que pide confirmación",
  "Usuarios con permisos por perfil",
];

const PASOS = [
  ["Demo", "Videollamada con datos de ejemplo y un presupuesto real de tu taller, con tu margen."],
  ["Semana 1", "Configuración: cargamos tus clientes, tu catálogo y tus tarifas de máquina, taller y material."],
  ["Semanas 2 y 3", "Arranque con tu equipo: presupuestáis, albaranáis y facturáis con el programa y ajustamos lo necesario."],
  ["Tu visto bueno", "Cuando el programa está a tu gusto empieza el mantenimiento (los 3 primeros meses, gratis)."],
];

/** Genera el PDF de 2 páginas. `hoy` se puede fijar para pruebas. */
export async function generarPropuestaPdf(d: DatosPropuesta, hoy = new Date()): Promise<{ pdf: Uint8Array; archivo: string; paginas: number }> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Propuesta TransformaConIA Gestión - ${d.cliente}`);
  doc.setAuthor("Transforma con IA");
  doc.setSubject("Propuesta comercial");
  doc.setCreator("Transforma con IA");
  const f: Fuentes = { r: await doc.embedFont(StandardFonts.Helvetica), b: await doc.embedFont(StandardFonts.HelveticaBold) };
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG_B64, "base64"));
  const fecha = fechaLarga(hoy);

  // ───────── Página 1: portada ─────────
  const p1 = doc.addPage([W, H]);
  p1.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.dark });
  p1.drawCircle({ x: W - 40, y: H - 60, size: 230, color: C.purple, opacity: 0.16 });
  p1.drawCircle({ x: 30, y: 90, size: 170, color: C.purple, opacity: 0.1 });
  const lw = 215;
  p1.drawImage(logo, { x: M, y: H - 52 - (lw * LOGO_ALTO) / LOGO_ANCHO, width: lw, height: (lw * LOGO_ALTO) / LOGO_ANCHO });
  parrafo(p1, fecha, { x: W - M, y: H - 70, tam: 10, font: f.r, color: C.grey, derecha: true });

  p1.drawText("PROPUESTA COMERCIAL", { x: M, y: H - 190, size: 10, font: f.b, color: C.purpleLight });
  p1.drawText("TransformaConIA", { x: M, y: H - 236, size: 40, font: f.b, color: C.white });
  p1.drawText("Gestión", { x: M, y: H - 282, size: 40, font: f.b, color: C.purpleLight });
  parrafo(p1, "El programa de gestión (ERP) con IA para la industria: presupuesta, entrega y factura desde un solo sitio, y la IA te hace el papeleo.", { x: M, y: H - 312, tam: 12, font: f.r, color: C.grey, ancho: 430, interlinea: 17 });

  p1.drawRectangle({ x: M, y: H - 420, width: 4, height: 66, color: C.purple });
  p1.drawText("PREPARADA PARA", { x: M + 16, y: H - 366, size: 8.5, font: f.b, color: C.purpleLight });
  parrafo(p1, d.cliente, { x: M + 16, y: H - 392, tam: 22, font: f.b, color: C.white, ancho: W - 2 * M - 16, interlinea: 26, maxLineas: 2 });

  let y = H - 468;
  p1.drawText("QUÉ INCLUYE", { x: M, y, size: 10, font: f.b, color: C.purpleLight });
  y -= 24;
  const colW = (W - 2 * M) / 2;
  INCLUYE.forEach((t, k) => {
    const x = M + (k % 2) * colW;
    const yy = y - Math.floor(k / 2) * 26;
    p1.drawRectangle({ x, y: yy - 1, width: 7, height: 7, color: C.purple });
    parrafo(p1, t, { x: x + 16, y: yy, tam: 10.5, font: f.r, color: C.white, ancho: colW - 24, maxLineas: 1 });
  });
  y -= Math.ceil(INCLUYE.length / 2) * 26 + 4;
  parrafo(p1, "Soporte, copias de seguridad y mejoras incluidos en el mantenimiento. Se abre desde el móvil, la tableta o el ordenador: no hay que instalar nada.", { x: M, y, tam: 9.5, font: f.r, color: C.grey, ancho: W - 2 * M, interlinea: 13.5 });
  y -= 13.5 * 2 + 14;

  if (d.modulos.length) {
    p1.drawText("MÓDULOS ADICIONALES A ACTIVAR", { x: M, y, size: 8.5, font: f.b, color: C.purpleLight });
    y = parrafo(p1, d.modulos.join(" · "), { x: M, y: y - 15, tam: 10.5, font: f.r, color: C.white, ancho: W - 2 * M, interlinea: 14.5, maxLineas: 3 }) - 8;
  }
  if (d.notas) {
    p1.drawText("NOTAS", { x: M, y, size: 8.5, font: f.b, color: C.purpleLight });
    parrafo(p1, d.notas, { x: M, y: y - 15, tam: 10, font: f.r, color: C.grey, ancho: W - 2 * M, interlinea: 14, maxLineas: 5 });
  }
  p1.drawLine({ start: { x: M, y: 52 }, end: { x: W - M, y: 52 }, thickness: 0.6, color: rgb(0.2, 0.2, 0.27) });
  p1.drawText("Transforma con IA · Murcia", { x: M, y: 34, size: 9, font: f.r, color: C.grey });
  parrafo(p1, TARIFA.contacto, { x: W - M, y: 34, tam: 9, font: f.b, color: C.purpleLight, derecha: true });

  // ───────── Página 2: precio, condiciones y próximos pasos ─────────
  const p2 = doc.addPage([W, H]);
  p2.drawRectangle({ x: 0, y: H - 74, width: W, height: 74, color: C.dark });
  p2.drawImage(logo, { x: M, y: H - 52, width: 150, height: (150 * LOGO_ALTO) / LOGO_ANCHO });
  parrafo(p2, `Propuesta para ${d.cliente}`, { x: W - M, y: H - 42, tam: 9.5, font: f.r, color: C.grey, derecha: true, ancho: 300, maxLineas: 1 });
  parrafo(p2, fecha, { x: W - M, y: H - 56, tam: 9, font: f.r, color: C.grey, derecha: true });

  y = H - 118;
  p2.drawText("Condiciones económicas", { x: M, y, size: 22, font: f.b, color: C.ink });
  p2.drawText("Importes orientativos, sin IVA. Tras la demo recibes el presupuesto cerrado.", { x: M, y: y - 20, size: 10, font: f.r, color: C.muted });
  y -= 48;

  const n = d.usuariosExtra;
  const filas: { t: string; det: string; imp: string; sub?: string }[] = [
    { t: "Puesta en marcha", det: "Demo, configuración a tu manera y arranque con tu equipo. En dos pagos de " + eur(TARIFA.pagoInicial) + ".", imp: eur(TARIFA.puestaEnMarcha), sub: `Oferta de lanzamiento (tarifa general ${eur(TARIFA.puestaEnMarchaGeneral)})` },
    { t: "Mantenimiento", det: `Soporte, copias de seguridad y mejoras. Los ${TARIFA.mesesGratis} primeros meses, gratis.`, imp: `${eur(TARIFA.mantenimientoMes)}/mes` },
    n > 0
      ? { t: `Usuarios extra (${n})`, det: `${n} ${n === 1 ? "usuario adicional" : "usuarios adicionales"} con sus propios permisos, a ${eur(TARIFA.usuarioExtraMes)} por usuario y mes desde el primer mes (no entran en los meses gratis).`, imp: `${eur(n * TARIFA.usuarioExtraMes)}/mes` }
      : { t: "Usuarios extra", det: "Oficina o encargado adicionales con sus propios permisos, si los necesitas.", imp: `${eur(TARIFA.usuarioExtraMes)}/mes`, sub: "por usuario" },
  ];
  filas.forEach((r, k) => {
    const alto = 56;
    p2.drawRectangle({ x: M, y: y - alto, width: W - 2 * M, height: alto, color: k % 2 ? C.white : C.soft, borderColor: C.line, borderWidth: 0.6 });
    p2.drawText(seguro(f.b, r.t), { x: M + 14, y: y - 22, size: 12, font: f.b, color: C.ink });
    parrafo(p2, r.det, { x: M + 14, y: y - 37, tam: 9, font: f.r, color: C.muted, ancho: 270, interlinea: 11.5, maxLineas: 2 });
    parrafo(p2, r.imp, { x: W - M - 14, y: y - 25, tam: 15, font: f.b, color: C.purpleDark, derecha: true });
    if (r.sub) parrafo(p2, r.sub, { x: W - M - 14, y: y - 40, tam: 7.5, font: f.r, color: C.muted, derecha: true, ancho: 190, maxLineas: 1 });
    y -= alto;
  });

  // Resumen de pagos
  y -= 16;
  const cuota = cuotaMensual(n);
  p2.drawRectangle({ x: M, y: y - 92, width: W - 2 * M, height: 92, color: C.purpleSoft, borderColor: C.purple, borderWidth: 0.8 });
  p2.drawText("RESUMEN DE PAGOS", { x: M + 14, y: y - 20, size: 8.5, font: f.b, color: C.purpleDark });
  const celdas: [string, string, string][] = [
    ["Al empezar", eur(TARIFA.pagoInicial), n > 0 ? `1.er pago + usuarios ${eur(n * TARIFA.usuarioExtraMes)}/mes` : "primer pago de la puesta en marcha"],
    [`A los ${TARIFA.mesesGratis} meses`, eur(TARIFA.pagoMes3), "segundo pago, si te convence"],
    [`Desde el mes ${TARIFA.mesesGratis + 1}`, `${eur(cuota)}/mes`, n > 0 ? `${eur(TARIFA.mantenimientoMes)} + ${n} x ${eur(TARIFA.usuarioExtraMes)}` : "mantenimiento"],
  ];
  const cw = (W - 2 * M - 28) / 3;
  celdas.forEach(([a, b, c], k) => {
    const x = M + 14 + k * cw;
    p2.drawText(a, { x, y: y - 42, size: 9, font: f.r, color: C.muted });
    p2.drawText(seguro(f.b, b), { x, y: y - 62, size: 17, font: f.b, color: C.ink });
    parrafo(p2, c, { x, y: y - 76, tam: 8, font: f.r, color: C.muted, ancho: cw - 8, maxLineas: 1 });
  });
  y -= 92 + 26;

  // Condiciones
  p2.drawText("Condiciones", { x: M, y, size: 13, font: f.b, color: C.ink });
  y -= 20;
  const conds = [
    "Sin permanencia: mes a mes, con 30 días de aviso. Si lo dejas, te llevas tus datos exportados.",
    "El mantenimiento no empieza hasta que el programa está a tu gusto y das el visto bueno.",
    `Oferta de lanzamiento para las 10 primeras empresas; la tarifa general de puesta en marcha es de ${eur(TARIFA.puestaEnMarchaGeneral)}.`,
    "Tus datos, en un servidor propio para tu empresa, en la UE. Tu logo y tus datos en presupuestos, albaranes y facturas.",
  ];
  for (const t of conds) {
    p2.drawRectangle({ x: M, y: y + 1, width: 5, height: 5, color: C.purple });
    y = parrafo(p2, t, { x: M + 14, y, tam: 9.5, font: f.r, color: C.ink, ancho: W - 2 * M - 14, interlinea: 13 }) - 4;
  }

  // Próximos pasos
  y -= 12;
  p2.drawText("Próximos pasos", { x: M, y, size: 13, font: f.b, color: C.ink });
  y -= 24;
  PASOS.forEach(([t, txt], k) => {
    p2.drawCircle({ x: M + 10, y: y + 3, size: 10, color: C.purple });
    const num = String(k + 1);
    p2.drawText(num, { x: M + 10 - f.b.widthOfTextAtSize(num, 10) / 2, y: y - 0.5, size: 10, font: f.b, color: C.white });
    p2.drawText(seguro(f.b, t), { x: M + 30, y: y + 2, size: 10, font: f.b, color: C.ink });
    parrafo(p2, txt, { x: M + 30, y: y - 11, tam: 9, font: f.r, color: C.muted, ancho: W - 2 * M - 30, interlinea: 11.5, maxLineas: 2 });
    y -= 42;
  });

  // Contacto
  p2.drawRectangle({ x: 0, y: 0, width: W, height: 70, color: C.dark });
  p2.drawText("¿Lo vemos con tus trabajos y tus precios?", { x: M, y: 42, size: 11, font: f.b, color: C.white });
  p2.drawText("Murcia · en persona en la Región de Murcia y en remoto en toda España", { x: M, y: 26, size: 8.5, font: f.r, color: C.grey });
  parrafo(p2, TARIFA.contacto, { x: W - M, y: 34, tam: 12, font: f.b, color: C.purpleLight, derecha: true });

  const pdf = await doc.save();
  return { pdf, archivo: nombreArchivo(d.cliente, hoy), paginas: doc.getPageCount() };
}
