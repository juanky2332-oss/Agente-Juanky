"use client";
// La ficha del sumiller de un vino: lo que el motor GUIA GASTRO investigó en internet (columna
// FICHA de la hoja Vinos, en JSON) junto con lo que es SUYO (nota y comentarios).

export interface Investigacion {
  nombre_real?: string; bodega?: string; do?: string; tipo?: string; uva?: string; anada?: string; graduacion?: string;
  precio?: string; precio_mercado?: string; bodega_info?: string; origen?: string; crianza?: string; cata?: string;
  puntuaciones?: string; veredicto?: string; maridaje?: string; temperatura?: string; guarda?: string; curiosidad?: string;
  fuentes?: { web: string; url: string }[]; investigado?: string;
}

export function leerFicha(x: Record<string, string>): Investigacion | null {
  const t = (x.FICHA || "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const j = JSON.parse(t);
    return j && typeof j === "object" ? (j as Investigacion) : null;
  } catch {
    return null;
  }
}

/** Sus comentarios (sin el antiguo "Ficha (internet): ..." que el bot metía ahí). */
export function comentariosSuyos(c: string | undefined): string[] {
  return (c || "").split("|").map((s) => s.trim()).filter((s) => s && !/^ficha \(internet\)\s*:/i.test(s));
}

const BLOQUES: [keyof Investigacion, string, string][] = [
  ["bodega_info", "🏠", "Quién lo hace"],
  ["origen", "🗺", "Origen"],
  ["crianza", "🛢", "Crianza"],
  ["cata", "👃", "En copa"],
  ["puntuaciones", "🏅", "Puntuaciones"],
  ["veredicto", "⚖️", "Veredicto del sumiller"],
  ["maridaje", "🍽", "Con qué tomarlo"],
  ["curiosidad", "💡", "Curiosidad"],
];

export function FichaVino({ v, ficha }: { v: Record<string, string>; ficha: Investigacion | null }) {
  const cab = [v.BODEGA, v.DO, v.TIPO, ficha?.graduacion].filter(Boolean).join(" · ");
  const suyos = comentariosSuyos(v.COMENTARIO);
  const servir = [ficha?.temperatura ? `Servir a ${ficha.temperatura}` : "", ficha?.guarda || ""].filter(Boolean).join(" · ");
  return (
    <div className="grid gap-4 text-sm">
      <div>
        {cab && <div className="text-txt-2">{cab}</div>}
        {v.UVA && <div className="mt-0.5 text-txt-2">🍇 {v.UVA}{v["AÑADA"] ? ` · añada ${v["AÑADA"]}` : ""}</div>}
        {ficha?.nombre_real && ficha.nombre_real.toLowerCase() !== (v.NOMBRE || "").toLowerCase() && (
          <div className="mt-1 text-xs text-txt-3">En las fuentes aparece como «{ficha.nombre_real}»</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-card-2 p-3">
          <div className="text-[11px] uppercase tracking-wide text-txt-3">Precio de mercado</div>
          <div className="mt-1 font-semibold">{ficha?.precio_mercado || v.PRECIO || "—"}</div>
        </div>
        <div className="rounded-xl bg-card-2 p-3">
          <div className="text-[11px] uppercase tracking-wide text-txt-3">Tu nota</div>
          <div className="mt-1 text-lg font-semibold tabular">{v.NOTA ? `${v.NOTA}/10` : "—"}</div>
          {v.DONDE && <div className="text-xs text-txt-3">📍 {v.DONDE}</div>}
        </div>
      </div>

      {suyos.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-txt-3">Tus comentarios</div>
          <ul className="grid gap-1">{suyos.map((s, i) => <li key={i} className="text-txt-2">💬 {s}</li>)}</ul>
        </div>
      )}

      {ficha ? (
        <div className="grid gap-2.5">
          {BLOQUES.filter(([k]) => ficha[k]).map(([k, ico, tit]) => (
            <div key={k}>
              <div className="text-[11px] uppercase tracking-wide text-txt-3">{ico} {tit}</div>
              <div className="mt-0.5 leading-relaxed">{String(ficha[k])}</div>
            </div>
          ))}
          {servir && <div className="text-txt-2">🌡 {servir}</div>}
          {!!ficha.fuentes?.length && (
            <div className="text-xs text-txt-3">
              Fuentes:{" "}
              {ficha.fuentes.map((f, i) => (
                <span key={f.url}>
                  {i > 0 && " · "}
                  <a className="underline hover:text-acento" href={f.url} target="_blank" rel="noopener noreferrer">{f.web}</a>
                </span>
              ))}
              {ficha.investigado && <> · investigado el {ficha.investigado}</>}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-card-2 p-3 text-txt-3">Todavía no está investigado. Dale a «Investigar» y el sumiller busca su ficha técnica, la Guía Peñín y el precio en tiendas.</p>
      )}
    </div>
  );
}
