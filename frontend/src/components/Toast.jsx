import React, { useEffect } from "react";

export default function Toast({ message, tone = "neutral", onClose }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => onClose && onClose(), 3000);
    return () => clearTimeout(id);
  }, [message, onClose]);

  if (!message) return null;

  const tones = {
    neutral: "bg-zinc-800 text-zinc-100",
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white",
  };

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg ${
        tones[tone] || tones.neutral
      }`}
    >
      {message}
    </div>
  );
}

