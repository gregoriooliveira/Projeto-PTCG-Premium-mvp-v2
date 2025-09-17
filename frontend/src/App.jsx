import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import MainContent from "./components/MainContent.jsx";
import MobileTopbar from "./components/MobileTopbar.jsx";
import Drawer from "./components/Drawer.jsx";
import NovoRegistroDialog from "./components/NovoRegistroDialog.jsx";
import ImportLogsModal from "./components/ImportLogsModal.jsx";

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const novoRegistroRef = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    window.__ptcgNovoRegistroDialogRef = novoRegistroRef.current;
    return () => {
      if (window.__ptcgNovoRegistroDialogRef === novoRegistroRef.current) {
        delete window.__ptcgNovoRegistroDialogRef;
      }
    };
  });

  const handleNewRecord = () => {
    try {
      const dialog = novoRegistroRef.current ?? window.__ptcgNovoRegistroDialogRef;
      const open = dialog?.open;
      if (typeof open === "function") {
        try {
          const raw = window.location.hash || "";
          const segs = raw
            .split("?")[0]
            .replace(/^#/, "")
            .split("/")
            .filter(Boolean);
          const dia =
            segs[0] === "tcg-fisico" &&
            segs[1] === "eventos" &&
            segs[2] === "data" &&
            segs[3]
              ? segs[3]
              : undefined;
          open(dia ? { dia } : undefined);
        } catch {
          open();
        }
        return;
      }
    } catch {}
    try {
      sessionStorage.setItem("ptcg:openNovoRegistro", "1");
    } catch {}
    if (window.location.hash !== "#/tcg-fisico") {
      navigate("/tcg-fisico");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-neutral-950 to-black text-zinc-200">
      <MobileTopbar onMenu={() => setMobileOpen(true)} />
      <div className="mx-auto max-w-[1600px] flex">
        <Sidebar onImport={() => setShowImport(true)} onNewRecord={handleNewRecord} />
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
          <Sidebar
            onNavigate={() => setMobileOpen(false)}
            onImport={() => {
              setShowImport(true);
              setMobileOpen(false);
            }}
            onNewRecord={() => {
              handleNewRecord();
              setMobileOpen(false);
            }}
          />
        </Drawer>
        <MainContent />
        <NovoRegistroDialog ref={novoRegistroRef} renderTrigger={false} />
        <ImportLogsModal
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          onSaved={(p) => {
            setShowImport(false);
            navigate(`/tcg-live/logs/${p.id}`);
          }}
        />
      </div>
    </div>
  );
}
