import React from "react";
import PropTypes from "prop-types";
import { ArrowLeft } from "lucide-react";

export default function BackButton({ href, label }) {
  return (
    <a
      href={href}
      className={[
        "group inline-flex items-center gap-2 text-zinc-300",
        "hover:text-zinc-100 transition-colors focus:outline-none",
        "focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-lg",
      ].join(" ")}
      aria-label={label}
    >
      <span
        className={[
          "inline-flex h-7 w-7 items-center justify-center rounded-lg",
          "bg-zinc-800 ring-1 ring-inset ring-zinc-700 transition-colors",
          "group-hover:bg-zinc-700",
        ].join(" ")}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="text-sm md:text-[0.95rem] font-medium tracking-tight">{label}</span>
    </a>
  );
}

BackButton.propTypes = {
  href: PropTypes.string,
  label: PropTypes.string,
};

BackButton.defaultProps = {
  href: "#",
  label: "Voltar",
};

