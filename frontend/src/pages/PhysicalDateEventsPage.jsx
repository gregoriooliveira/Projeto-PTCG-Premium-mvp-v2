import React from "react";
import BackButton from "../components/BackButton.jsx";
export default function PhysicalDateEventsPage() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto text-zinc-100">
      <div className="mb-2"><BackButton href="#/tcg-fisico" label="Voltar ao TCG Físico" /></div>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Eventos por Data</h1>
      <p className="text-zinc-400 mb-4 text-sm">Integração pendente. Nenhum dado no momento.</p>
      <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 shadow-lg p-4 text-zinc-400">
        Em breve.
      </div>
    </div>
  );
}