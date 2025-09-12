import React from "react";

export default function Drawer({ open, onClose, children }) {
  return (
    <div className={`md:hidden fixed inset-0 z-30 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 left-0 w-72 bg-zinc-950 border-r border-zinc-800 transform transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}
