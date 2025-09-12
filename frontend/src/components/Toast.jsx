import React, { useEffect } from "react";
import PropTypes from "prop-types";

export default function Toast({ message, type = "info", onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  const tones = {
    info: "bg-zinc-800 text-zinc-100",
    success: "bg-emerald-600 text-white",
    error: "bg-rose-600 text-white",
  };

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded shadow-lg text-sm ${
        tones[type] || tones.info
      }`}
      role="alert"
    >
      {message}
    </div>
  );
}

Toast.propTypes = {
  message: PropTypes.string,
  type: PropTypes.oneOf(["info", "success", "error"]),
  onClose: PropTypes.func.isRequired,
};
