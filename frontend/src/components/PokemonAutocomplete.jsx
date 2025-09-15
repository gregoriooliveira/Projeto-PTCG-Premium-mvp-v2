import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { searchPokemon } from "../services/api.js";

export default function PokemonAutocomplete({ label, required=false, value, onChange, placeholder="Digite o nome do Pokémon" }){
  const [q, setQ] = useState(value?.name || "");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const min = 2;
  const blurTimeout = useRef(null);

  useEffect(()=>{ setQ(value?.name || ""); }, [value?.name]);

  useEffect(()=>{
    let abort=false;
    const run = async () => {
      const s = q.trim();
      if (value?.name && value.name === s){ setItems([]); setOpen(false); return; }
      if (s.length < min){ setItems([]); setOpen(false); return; }
      try{
        const res = await searchPokemon(s);
        if (!abort){ setItems(res||[]); setOpen((res||[]).length>0); }
      }catch{}
    };
    run();
    return () => { abort = true; };
  }, [q, value?.name]);

  const handleBlur = () => {
    // espera clique no item (onMouseDown) antes de fechar
    blurTimeout.current = setTimeout(()=> setOpen(false), 120);
  };
  const handleFocus = () => {
    if (items.length>0) setOpen(true);
  };
  const pick = (p) => {
    onChange && onChange(p);
    setQ(p?.name || "");
    setOpen(false);
    if (blurTimeout.current){ clearTimeout(blurTimeout.current); }
  };

  return (
    <div className="space-y-1">
      <label className="text-sm text-zinc-400">{label}{required && " *"}</label>
      <div className="relative">
        <input
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100"
          placeholder={placeholder}
          value={q}
          onChange={e=>setQ(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
        />
        {open && items.length>0 && (
          <div className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-lg">
            {items.map(p => (
              <button
                key={p.slug}
                type="button"
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 text-left"
                onMouseDown={(e)=>{ e.preventDefault(); pick(p); }}
              >
                {p.image && <img src={p.image} alt="" className="w-7 h-7 rounded" />}
                <span className="text-zinc-200">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
PokemonAutocomplete.propTypes = {
  label: PropTypes.string.isRequired,
  required: PropTypes.bool,
  value: PropTypes.shape({ name: PropTypes.string, slug: PropTypes.string }),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
};
