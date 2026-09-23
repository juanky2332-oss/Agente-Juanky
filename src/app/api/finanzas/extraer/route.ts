import { manejar } from "@/lib/ruta";
import { leerFactura } from "@/lib/extraer";

export const maxDuration = 120;

export const POST = manejar(async (req: Request) => leerFactura((await req.json()) as { base64: string; mime: string }));
