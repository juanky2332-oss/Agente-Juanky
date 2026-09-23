// Clasificación del correo personal (juanky2332@gmail.com). Determinista y barata: la IA solo
// entra si pides el resumen. El 95 % de ese buzón es ruido; aquí se queda lo que sirve para la app.
import { normaliza } from "./parse";

export interface Mensaje { id: string; hilo: string; de: string; asunto: string; fecha: string; resumen: string; etiquetas: string[] }

export const GRUPOS = [
  { k: "facturas", t: "Facturas y recibos", ico: "💶" },
  { k: "bebe", t: "Bebé, salud y trámites", ico: "🍼" },
  { k: "banco", t: "Bancos y pagos", ico: "🏦" },
  { k: "trabajo", t: "Proyectos y servicios", ico: "💻" },
  { k: "compras", t: "Compras y envíos", ico: "📦" },
  { k: "seguridad", t: "Códigos y seguridad", ico: "🔐" },
  { k: "otros", t: "Otros", ico: "✉️" },
] as const;
export type Grupo = (typeof GRUPOS)[number]["k"];

const RE: [Grupo, RegExp][] = [
  ["seguridad", /verification code|codigo de verificacion|codigo de acceso|security code|sudo|inicio de sesion|new sign-in|contrasena|password|2fa|one-time/],
  ["bebe", /seg-social|seguridad social|agencia ?tributaria|aeat|carm\.es|murcia\.es|sms\.carm|sanidad|hospital|arrixaca|centro de salud|registro civil|mjusticia|inss|guarderi|escuela infantil|bebe|pediatr|maternidad|paternidad|nacimiento|cita previa/],
  ["banco", /revolut|openbank|bbva|santander|caixabank|ing\.es|\bing\b|bankinter|sabadell|unicaja|cajamar|paypal|bizum|transferencia|tarjeta|recibo domiciliado|adeudo/],
  ["trabajo", /vercel|github|supabase|n8n|hostinger|flownexion|transformaconia|openai|anthropic|claude|google cloud|cloudflare|stripe|cal\.com|scraperapi|serpapi|hunter/],
  ["compras", /amazon|aliexpress|pedido|envio|entrega|seur|mrw|correos|gls|dhl|ups|tu compra|order|shipped/],
];

// Ruido comercial de su bandeja (misma lección que el filtro del bot: lista negra explícita).
const RUIDO = /(newsletter|news@|marketing|promo|noreply@.*(booksy|wikiloc|samsung|uber)|jonhernandez|info@.*education|comunicaciones@marketing|no dejes pasar|descuento|oferta|rebajas|webinar)/;

export function clasificar(m: Mensaje, remitentesFactura: string[]): { grupo: Grupo; ruido: boolean } {
  const de = normaliza(m.de), t = normaliza(`${m.de} ${m.asunto} ${m.resumen}`);
  const promo = (m.etiquetas || []).some((e) => /CATEGORY_(PROMOTIONS|SOCIAL|FORUMS)/.test(e));
  if (remitentesFactura.some((r) => r && de.includes(r.toLowerCase())) && /factura|recibo|receipt|invoice|pago|importe/.test(t)) return { grupo: "facturas", ruido: false };
  for (const [g, re] of RE) if (re.test(t)) return { grupo: g, ruido: false };
  return { grupo: "otros", ruido: promo || RUIDO.test(t) };
}
