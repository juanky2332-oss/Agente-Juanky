"use client";
// Facturas del taller que llegaron por Telegram y esperan el ✅: cada pedido con lo que dice la
// factura y tu 10 %. Confirmar = apuntarlo como pagado (lo mismo que el botón de Telegram).
import { useEffect, useState } from "react";
import { useApi, Tarjeta, Boton, llamar, avisar } from "@/components/ui";
import { eur, isoAEs } from "@/lib/parse";
import type { DatosTaller } from "@/lib/facturaTaller";

type B = { id: string; fecha: string; enlace: string; taller: DatosTaller };

export default function FacturasTaller({ alCambiar }: { alCambiar: () => void }) {
  const { datos, recargar } = useApi<{ borradores: B[] }>("/api/borradores?clase=taller");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("factura");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resaltar la factura que viene en el enlace de Telegram
    if (id) setFoco(id.toUpperCase());
  }, []);
  const xs = datos?.borradores || [];
  if (!xs.length) return null;

  async function hacer(id: string, accion: "confirmar" | "descartar") {
    setEnviando(id);
    try {
      await llamar("/api/borradores", "POST", { id, accion });
      avisar(accion === "confirmar" ? "Apuntado como pagado · avisado en Telegram" : "Descartada");
      recargar();
      alCambiar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <Tarjeta className="mb-4" titulo={`🔧 Facturas del taller por confirmar (${xs.length})`} sub="Las que me has mandado por Telegram. Al confirmar se apunta tu parte como pagada">
      <div className="space-y-3">
        {xs.map((b) => {
          const t = b.taller;
          const total = t.casos.reduce((s, c) => s + c.aCobrar, 0);
          return (
            <div key={b.id} className={`rounded-xl border p-3 ${foco === b.id ? "border-acento" : "border-borde"}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span><b>{t.numero ? `Nº ${t.numero}` : "Sin nº"}</b> · {t.fecha ? isoAEs(t.fecha) : "¿fecha?"} · base {eur(t.base)} <span className="text-txt-3">({b.id})</span></span>
                {b.enlace && <a className="text-xs underline" href={b.enlace} target="_blank" rel="noreferrer">📎 documento</a>}
              </div>
              <ul className="space-y-1.5 text-sm">
                {t.casos.map((c, k) => (
                  <li key={k}>
                    <b>Pedido {c.pedido}</b> · {c.concepto}{c.id ? <span className="text-txt-3"> #{c.id}</span> : <i> (nuevo)</i>}
                    <div className="text-txt-2">Factura {eur(c.totalFactura)} → tu {c.porcentaje} % = <b>{eur(c.tuyo)}</b>{Math.abs(c.aCobrar - c.tuyo) > 0.005 && ` · se apuntan ${eur(c.aCobrar)}`}</div>
                    {c.aviso && <div className="text-xs text-txt-3">{c.aviso}</div>}
                  </li>
                ))}
              </ul>
              {t.avisos.map((a, k) => <p key={k} className="mt-1 text-xs text-aviso-txt">⚠️ {a}</p>)}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-auto text-sm">Te toca: <b>{eur(total)}</b></span>
                <Boton pequeno tipo="primario" disabled={!!enviando || total <= 0.005} onClick={() => hacer(b.id, "confirmar")}>✅ Confirmar cobro</Boton>
                <Boton pequeno tipo="fantasma" disabled={!!enviando} onClick={() => hacer(b.id, "descartar")}>Descartar</Boton>
              </div>
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}
