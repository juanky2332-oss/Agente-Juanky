"use client";
import { useEffect, useRef, useState } from "react";
import { Boton, HtmlTelegram, Titulo, llamar, inputCls } from "@/components/ui";

interface Msg { de: "yo" | "bot"; texto: string; hora: string; error?: boolean }

const SUGERENCIAS = [
  "¿Qué tengo pendiente esta semana?",
  "¿Qué correos importantes me han llegado de Flownexion?",
  "Recuérdame mañana a las 9 llamar al gestor",
  "¿Cuánto me deben del taller?",
  "Busca proveedor de rodamientos",
  "¿Qué restaurantes tenemos pendientes?",
];

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const g = sessionStorage.getItem("chat");
      if (g) setMsgs(JSON.parse(g));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("chat", JSON.stringify(msgs.slice(-60)));
    } catch {}
    fin.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, pensando]);

  const enviar = async (t: string) => {
    const m = t.trim();
    if (!m || pensando) return;
    const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setMsgs((x) => [...x, { de: "yo", texto: m, hora }]);
    setTexto("");
    setPensando(true);
    try {
      const r = await llamar<{ ok: boolean; respuesta: string }>("/api/chat", "POST", { mensaje: m });
      setMsgs((x) => [...x, { de: "bot", texto: r.respuesta, hora: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }), error: !r.ok }]);
    } catch (e) {
      setMsgs((x) => [...x, { de: "bot", texto: (e as Error).message, hora, error: true }]);
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-170px)] lg:h-[calc(100dvh-80px)] flex-col">
      <Titulo titulo="Asistente" sub="Es el mismo agente de Telegram: mismas herramientas y la misma memoria. Lo que le cuentes aquí lo recuerda allí." extra={msgs.length ? <Boton pequeno tipo="fantasma" onClick={() => setMsgs([])}>Limpiar pantalla</Boton> : null} />
      <div className="flex-1 overflow-y-auto scroll-fino rounded-2xl border border-borde bg-card p-4">
        {!msgs.length && (
          <div className="grid h-full place-items-center">
            <div className="max-w-lg text-center">
              <p className="text-sm text-txt-2">Pregúntale lo mismo que en Telegram: agenda, correo, notas, proveedores, gastos, restaurantes…</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => enviar(s)} className="rounded-full border border-borde px-3 py-1.5 text-xs text-txt-2 hover:bg-card-2">{s}</button>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-txt-3">Para cifras de gastos, la pantalla Gastos es más exacta: allí las calcula el código.</p>
            </div>
          </div>
        )}
        <div className="grid gap-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.de === "yo" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.de === "yo" ? "bg-acento text-white rounded-br-md" : m.error ? "border border-alerta/40 bg-card-2 rounded-bl-md" : "bg-card-2 rounded-bl-md"}`}>
                {m.de === "yo" ? <p className="whitespace-pre-wrap text-sm">{m.texto}</p> : <HtmlTelegram html={m.texto} />}
                <div className={`mt-1 text-right text-[10px] ${m.de === "yo" ? "text-white/70" : "text-txt-3"}`}>{m.hora}</div>
              </div>
            </div>
          ))}
          {pensando && <div className="text-sm text-txt-3 animate-pulse">El asistente está pensando…</div>}
          <div ref={fin} />
        </div>
      </div>
      <form onSubmit={(e) => (e.preventDefault(), enviar(texto))} className="mt-3 flex gap-2">
        <textarea
          rows={1}
          className={inputCls + " resize-none"}
          placeholder="Escribe como en Telegram…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), enviar(texto))}
        />
        <Boton type="submit" tipo="primario" disabled={pensando || !texto.trim()}>Enviar</Boton>
      </form>
    </div>
  );
}
