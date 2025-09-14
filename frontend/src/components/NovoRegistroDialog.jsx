import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import PropTypes from "prop-types";
import { createEvent } from "../eventsRepo.js";

/**
 * NovoRegistroDialog (robusto, inputs não-controlados p/ digitação fluida)
 * - Overlay fixo com backdrop
 * - Refs para inputs de texto => digitação suave (sem perder foco)
 * - "Tipo do Evento" controlado para alternar Loja/Cidade
 * - Persistência no servidor e navegação por hash #/eventos/:id
 */
const NovoRegistroDialog = forwardRef(function NovoRegistroDialog(
  { renderTrigger, open: openProp, onOpenChange, onCreated },
  ref,
) {
  const isControlled = typeof openProp === "boolean";
  const [openState, setOpenState] = useState(false);
  const open = isControlled ? openProp : openState;
  const setOpen = (v) => {
    if (!isControlled) setOpenState(v);
    if (typeof onOpenChange === "function") onOpenChange(v);
  };

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
  }));

  // foco inicial ao abrir
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const first = document.querySelector(
        "#novo-registro-dialog input, #novo-registro-dialog select",
      );
      first?.focus?.();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // fechar por ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ---- Refs (inputs não-controlados para digitação fluida)
  const diaRef = useRef(null);
  const nomeRef = useRef(null);
  const lojaCidadeRef = useRef(null);
  const formatoRef = useRef(null);
  const classificacaoRef = useRef(null);

  // "Tipo do Evento" controlado (para alternar os campos ao lado)
  const [tipo, setTipo] = useState("");

  // valores iniciais
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const defaultDia = `${yyyy}-${mm}-${dd}`;

  const tiposOrdenados = [
    "CLP",
    "Challenge",
    "CUP",
    "Internacional",
    "Jogo Treino",
    "Liga de Amigos",
    "Liga Local",
    "Mundial",
    "Partida Amistosa",
    "Regional",
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const formatos = [
    "Standard",
    "Expanded",
    "GLC",
    "For Fun",
    "Legacy",
    "Unlimited",
  ];
  const classificacoes = [
    "Não Classificado",
    "Abandono",
    "Top 128",
    "Top 64",
    "Top 32",
    "Top 16",
    "Top 8",
    "Top 4",
    "Finalista",
    "Campeão",
  ];

  const exigeLoja =
    tipo === "Liga Local" ||
    tipo === "CUP" ||
    tipo === "Challenge" ||
    tipo === "CLP";
  const exigeCidade =
    tipo === "Regional" || tipo === "Internacional" || tipo === "Mundial";

  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    const dia = diaRef.current?.value?.trim();
    const nome = nomeRef.current?.value?.trim();
    const local = lojaCidadeRef.current?.value?.trim();
    const formato = formatoRef.current?.value?.trim();
    const classificacao = classificacaoRef.current?.value?.trim();

    if (!dia) e.dia = "Obrigatório";
    if (!nome) e.nome = "Obrigatório";
    if (!tipo) e.tipo = "Obrigatório";
    if (exigeLoja && !local) e.local = "Informe o nome da loja";
    if (exigeCidade && !local) e.local = "Informe a cidade";
    if (!formato) e.formato = "Obrigatório";
    if (!classificacao) e.classificacao = "Obrigatório";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    if (!validate()) return;

    const payload = {
      dia: diaRef.current?.value || "",
      nome: nomeRef.current?.value || "",
      tipo,
      local: lojaCidadeRef.current?.value || "",
      formato: formatoRef.current?.value || "",
      classificacao: classificacaoRef.current?.value || "",
      createdAt: new Date().toISOString(),
    };

    let eventId = null;
    try {
      ({ eventId } = await createEvent(payload));
      if (import.meta?.env?.DEV)
        console.info("[ptcg] evento salvo", { ...payload, eventId });
    } catch (err) {
      console.warn("Falha ao salvar evento no servidor", err);
    }

    if (typeof onCreated === "function") onCreated({ ...payload, eventId });

    try {
      if (eventId) location.hash = `#/eventos/${eventId}`;
    } catch {}

    setOpen(false);
  };

  const InputLabel = ({ label, error, children }) => (
    <label className="text-sm text-zinc-300">
      <span className="inline-flex items-center gap-1">
        {label}
        {error && <span className="text-red-400 ml-2">{error}</span>}
      </span>
      {children}
    </label>
  );

  return (
    <>
      {renderTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
        >
          + Novo Registro
        </button>
      )}

      {open && (
        <div
          id="novo-registro-dialog"
          className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
        >
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* card */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="novo-registro-title"
            className="relative w-full sm:max-w-2xl mx-2 sm:mx-0 rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-xl"
          >
            <h2
              id="novo-registro-title"
              className="text-lg font-semibold text-zinc-100 mb-2"
            >
              Novo Registro de Evento
            </h2>

            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <InputLabel label="Dia do Evento" error={errors.dia}>
                  <input
                    ref={diaRef}
                    type="date"
                    defaultValue={defaultDia}
                    className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-100"
                  />
                </InputLabel>
                <InputLabel label="Nome do Evento" error={errors.nome}>
                  <input
                    ref={nomeRef}
                    type="text"
                    placeholder="Ex: Liga da Loja XYZ #12"
                    className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-100"
                  />
                </InputLabel>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputLabel label="Tipo do Evento ▾" error={errors.tipo}>
                  <select
                    value={tipo}
                    onChange={(e) => {
                      const preserveNome = nomeRef.current
                        ? nomeRef.current.value
                        : "";
                      setTipo(e.target.value);
                      // limpar o campo ao lado quando trocar o tipo
                      if (lojaCidadeRef.current)
                        lojaCidadeRef.current.value = "";
                      // reatribui o nome após a atualização do tipo garantindo que o valor não se perca
                      setTimeout(() => {
                        if (nomeRef.current)
                          nomeRef.current.value = preserveNome;
                      }, 0);
                    }}
                    className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-100"
                  >
                    <option value="">Selecione...</option>
                    {tiposOrdenados.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </InputLabel>

                {exigeLoja && (
                  <InputLabel label="Nome da Loja" error={errors.local}>
                    <input
                      ref={lojaCidadeRef}
                      type="text"
                      className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-100"
                      placeholder="Ex: PokeCenter BR"
                    />
                  </InputLabel>
                )}
                {exigeCidade && (
                  <InputLabel label="Cidade" error={errors.local}>
                    <input
                      ref={lojaCidadeRef}
                      type="text"
                      className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-100"
                      placeholder="Ex: São Paulo/SP"
                    />
                  </InputLabel>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <InputLabel label="Formato do Jogo" error={errors.formato}>
                  <select
                    ref={formatoRef}
                    defaultValue=""
                    className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-100"
                  >
                    <option value="">Selecione...</option>
                    {formatos.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </InputLabel>

                <InputLabel label="Classificação" error={errors.classificacao}>
                  <select
                    ref={classificacaoRef}
                    defaultValue=""
                    className="mt-1 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-100"
                  >
                    <option value="">Selecione...</option>
                    {classificacoes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </InputLabel>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  Continuar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
});

NovoRegistroDialog.propTypes = {
  renderTrigger: PropTypes.bool,
  open: PropTypes.bool,
  onOpenChange: PropTypes.func,
  onCreated: PropTypes.func,
};

NovoRegistroDialog.defaultProps = {
  renderTrigger: false,
  open: undefined,
  onOpenChange: undefined,
  onCreated: undefined,
};

export default NovoRegistroDialog;
