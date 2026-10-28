// Materias del bloque Estudio (28-10-2026): técnica (la original), compras, inglés y refranes.
// Todas usan la misma forma de lección; aquí cambian el nombre, el comando de Telegram, las etiquetas
// de cada apartado y lo que se le cuenta al profesor IA. Sin repaso: lo entendido queda en «Lo visto».
import { TEMARIO, TEMAS, type Leccion } from "./estudioTemario";
import { TEMARIO_COMPRAS, TEMAS_COMPRAS } from "./estudioCompras";
import { TEMARIO_INGLES, TEMAS_INGLES } from "./estudioIngles";
import { TEMARIO_REFRANES, TEMAS_REFRANES } from "./estudioRefranes";

export type IdMateria = "tecnica" | "compras" | "ingles" | "refranes";

export interface Materia {
  id: IdMateria;
  nombre: string;
  emoji: string;
  comando: string; // en Telegram, sin la barra
  sub: string;
  temas: readonly string[];
  lecciones: Leccion[];
  et: { frase: string; explicacion: string; analogia: string; enTusApps: string; paraCliente: string; flujo: string };
  profesor: string; // contexto para «no lo entiendo»
}

export const MATERIAS: Materia[] = [
  {
    id: "tecnica", nombre: "IA y técnica", emoji: "🛠", comando: "estudio",
    sub: "La teoría de lo que construyes.",
    temas: TEMAS, lecciones: TEMARIO,
    et: { frase: "En una frase", explicacion: "Explicación", analogia: "Como si…", enTusApps: "Dónde lo usas tú", paraCliente: "Cómo decírselo a un cliente", flujo: "Cómo funciona, paso a paso" },
    profesor: "Juanky es consultor y desarrollador de IA que construye muy bien (Next.js, Supabase/Neon, n8n, OpenAI, bots de Telegram, un ERP para talleres, un chatbot para una tienda online técnica) pero olvida la teoría y los términos. En «enTusApps» di dónde aparece en lo que ya ha construido.",
  },
  {
    id: "compras", nombre: "Compras", emoji: "🛒", comando: "compras",
    sub: "Habilidades de comprador: negociar, proveedores, números y condiciones.",
    temas: TEMAS_COMPRAS, lecciones: TEMARIO_COMPRAS,
    et: { frase: "En una frase", explicacion: "Explicación", analogia: "Como si…", enTusApps: "En tu día a día", paraCliente: "Frase para el proveedor", flujo: "Paso a paso" },
    profesor: "Juanky trabaja en el departamento de compras de una empresa industrial en España (pide ofertas, lanza pedidos en SAP, trata con proveedores de material técnico). En «enTusApps» di cómo aplicarlo en su trabajo de compras esta semana. Nada de cifras ni normas inventadas.",
  },
  {
    id: "ingles", nombre: "Inglés", emoji: "🇬🇧", comando: "ingles",
    sub: "Cómo aprender según los expertos e inglés práctico para compras. Y un corrector de frases.",
    temas: TEMAS_INGLES, lecciones: TEMARIO_INGLES,
    et: { frase: "La idea", explicacion: "Explicación", analogia: "Consejo de experto", enTusApps: "Hazlo hoy (5 min)", paraCliente: "Frases para usar", flujo: "Paso a paso" },
    profesor: "Juanky es español, trabaja en compras industriales y quiere aprender inglés (nivel básico-intermedio) para correos y llamadas con proveedores. Explica en español; los ejemplos en inglés van con su traducción. En «enTusApps» propón un ejercicio de 5 minutos para hoy. No atribuyas frases a expertos si no estás seguro.",
  },
  {
    id: "refranes", nombre: "Refranes", emoji: "🗣", comando: "refranes",
    sub: "Refranes de verdad, qué significan y cuándo soltarlos en compras y en el trabajo.",
    temas: TEMAS_REFRANES, lecciones: TEMARIO_REFRANES,
    et: { frase: "Qué quiere decir", explicacion: "Cuándo encaja (y cuándo no)", analogia: "En compras", enTusApps: "En el trabajo", paraCliente: "Así queda en una conversación", flujo: "La escena" },
    profesor: "Juanky trabaja en compras industriales en España y quiere usar refranes españoles con sentido y en el momento justo. Explica el refrán de forma sencilla; en «ejemplo» pon una situación de compras; en «enTusApps» una frase natural para decirlo en el trabajo. Solo refranes reales y con su significado correcto.",
  },
];

export const materia = (id?: string | null) => MATERIAS.find((m) => m.id === id) || MATERIAS[0];
export const materiaDe = (idLeccion: string) => MATERIAS.find((m) => m.lecciones.some((l) => l.id === idLeccion)) || MATERIAS[0];
export const leccionDe = (id: string) => MATERIAS.flatMap((m) => m.lecciones).find((l) => l.id === id);
