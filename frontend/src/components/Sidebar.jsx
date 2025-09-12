import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home as HomeIcon,
  Gamepad2,
  Upload,
  Trophy,
  Settings,
  ChevronRight,
  CalendarDays,
} from "lucide-react";

const SidebarItem = ({ to, icon: Icon, label, onClick, onNavigate }) => {
  if (to) {
    return (
      <NavLink
        to={to}
        end
        onClick={onNavigate}
        className={({ isActive }) =>
          `group flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white"}`
        }
      >
        <Icon size={18} className="opacity-80" />
        <span>{label}</span>
        <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
      </NavLink>
    );
  }
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors text-zinc-300 hover:bg-zinc-800/60 hover:text-white"
    >
      <Icon size={18} className="opacity-80" />
      <span>{label}</span>
      <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
};

export default function Sidebar({ onNavigate, onImport, onNewRecord }) {
  return (
    <aside className="h-full w-64 shrink-0 hidden md:flex flex-col gap-2 p-3 bg-zinc-950/80 border-r border-zinc-800">
      <div className="px-3 py-4">
        <div className="text-lg font-bold text-white">PTCG Premium</div>
        <div className="text-xs text-zinc-400">v2 • App Shell</div>
      </div>
      <nav className="flex-1 space-y-1">
        <SidebarItem to="/" icon={HomeIcon} label="Home" onNavigate={onNavigate} />
        <SidebarItem to="/tcg-live" icon={Gamepad2} label="Pokémon TCG Live" onNavigate={onNavigate} />
        <SidebarItem to="/tcg-fisico" icon={Trophy} label="Pokémon TCG Físico" onNavigate={onNavigate} />
        <div className="pt-2 border-t border-zinc-800/60" />
        <SidebarItem icon={Upload} label="Importar Log" onClick={onImport} />
        <SidebarItem icon={CalendarDays} label="Novo Registro" onClick={onNewRecord} />
        <div className="pt-2 border-t border-zinc-800/60" />
        <SidebarItem to="/config" icon={Settings} label="Configurações" onNavigate={onNavigate} />
      </nav>
      <div className="px-3 pb-3 text-[11px] text-zinc-500">© 2025 PTCG Premium</div>
    </aside>
  );
}
