import React from "react";

export default function MobileTopbar({ onMenu }) {
  return (
    <div className="md:hidden sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
      <div className="flex items-center justify-between px-3 py-3">
        <button onClick={onMenu} className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200">Menu</button>
        <div className="text-white font-semibold">PTCG Premium</div>
        <div className="w-[64px]" />
      </div>
    </div>
  );
}
