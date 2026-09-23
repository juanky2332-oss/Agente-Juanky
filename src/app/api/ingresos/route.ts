import { manejar } from "@/lib/ruta";
import { cargarIngresos } from "@/lib/datos";

export const dynamic = "force-dynamic";
export const GET = manejar(async () => cargarIngresos());
