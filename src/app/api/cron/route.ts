import { manejar } from "@/lib/ruta";
import { generarProgramados } from "@/lib/datos";

// Vercel lo llama cada mañana (vercel.json): apunta los gastos/ingresos programados aunque
// nadie abra la app ese día, para que el bot y el parte de las 8:00 los vean.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = manejar(async () => ({ ok: true, ...(await generarProgramados()) }));
