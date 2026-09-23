"use client";
import { useState } from "react";

export default function Login() {
  const [p, setP] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError("");
    const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: p }) });
    if (r.ok) {
      const volver = new URLSearchParams(location.search).get("volver");
      location.href = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";
    } else {
      setError((await r.json().catch(() => ({}))).error || "No se ha podido entrar");
      setEnviando(false);
    }
  };
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-2xl border border-borde bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-acento font-bold text-white">J</span>
          <div>
            <h1 className="text-lg font-semibold">Panel de Juanky</h1>
            <p className="text-xs text-txt-3">Gastos, ingresos y el asistente de Telegram</p>
          </div>
        </div>
        <label className="block text-xs font-medium text-txt-2 mb-1" htmlFor="pw">Contraseña</label>
        <input
          id="pw"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={p}
          onChange={(e) => setP(e.target.value)}
          className="w-full rounded-lg border border-borde bg-card px-3 py-2.5 text-sm focus:border-acento focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-alerta-txt">{error}</p>}
        <button disabled={enviando || !p} className="mt-4 w-full rounded-lg bg-acento py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        <p className="mt-4 text-center text-[11px] text-txt-3">La sesión dura 30 días en este dispositivo.</p>
      </form>
    </main>
  );
}
