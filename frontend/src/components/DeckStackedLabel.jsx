import React from "react";

export default function DeckStackedLabel({ deck, wr }) {
  const name = String(deck || "");
  const [first, second] = name.split("/").map(s => s?.trim()).filter(Boolean);
  const wrText = typeof wr === "number" ? `${Math.round(wr)}% WR` : null;

  return (
    <div className="leading-tight text-right">
      <div className="text-sm">{first || "—"}</div>
      {second ? <div className="text-sm">{second}</div> : null}
      
    </div>
  );
}
