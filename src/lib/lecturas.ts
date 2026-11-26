import { AsyncLocalStorage } from "node:async_hooks";

// Lecturas de hojas compartidas DENTRO de una misma petición a la API.
//
// Una consulta de ingresos leía Ingresos + Cobros hasta tres veces seguidas (sincronizar el taller,
// sincronizar Flownexion y montar la respuesta). Aquí se recuerda cada rango leído mientras dura
// ESA petición, y se olvida todo en cuanto se escribe algo (antes y después de cualquier llamada a
// n8n que no sea una lectura de hojas). Fuera de una petición (tests, scripts) no se recuerda nada.
// No se comparte nada entre peticiones ni entre usuarios: no hay caché que se quede vieja.

interface Memoria {
  valores: Map<string, string[][]>;
  enCamino: Map<string, Promise<string[][]>>; // lecturas pedidas y aún sin respuesta
  generacion: number; // sube con cada escritura: una lectura que empezó antes no se guarda
}

const almacen = new AsyncLocalStorage<Memoria>();

export function conLecturasCompartidas<T>(fn: () => Promise<T>): Promise<T> {
  return almacen.run({ valores: new Map(), enCamino: new Map(), generacion: 0 }, fn);
}

/** Cualquier escritura (o llamada que pueda escribir) invalida lo leído. */
export function olvidarLecturas() {
  const m = almacen.getStore();
  if (!m) return;
  m.valores.clear();
  m.enCamino.clear();
  m.generacion++;
}

const clave = (render: string, rango: string) => render + "|" + rango;
const copia = (v: string[][]) => v.map((f) => [...f]);

/** Lo que ya se leyó en esta petición (copias, para que nadie toque el original). */
export function recordadas(render: string, rangos: string[]): (string[][] | undefined)[] {
  const m = almacen.getStore();
  return rangos.map((r) => {
    const v = m?.valores.get(clave(render, r));
    return v ? copia(v) : undefined;
  });
}

export function generacionActual(): number {
  return almacen.getStore()?.generacion ?? -1;
}

/** Guarda lo leído solo si no se ha escrito nada mientras se leía. */
export function recordar(render: string, rangos: string[], valores: string[][][], generacion: number) {
  const m = almacen.getStore();
  if (!m || m.generacion !== generacion) return;
  rangos.forEach((r, i) => m.valores.set(clave(render, r), copia(valores[i])));
}

/** Lecturas de estos rangos que ya se han pedido en esta petición y aún no han vuelto. */
export function enCamino(render: string, rangos: string[]): (Promise<string[][]> | undefined)[] {
  const m = almacen.getStore();
  return rangos.map((r) => m?.enCamino.get(clave(render, r))?.then(copia));
}

/** Apunta una lectura en camino (se borra sola al terminar; una escritura la descarta antes). */
export function apuntarEnCamino(render: string, rangos: string[], todo: Promise<string[][][]>) {
  const m = almacen.getStore();
  if (!m) return;
  rangos.forEach((r, i) => {
    const k = clave(render, r);
    const p = todo.then((v) => v[i]);
    p.catch(() => {});
    m.enCamino.set(k, p);
    todo.finally(() => m.enCamino.get(k) === p && m.enCamino.delete(k)).catch(() => {});
  });
}
