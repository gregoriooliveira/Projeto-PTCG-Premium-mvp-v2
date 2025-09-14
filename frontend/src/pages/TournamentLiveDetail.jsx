
import { getLiveTournament } from "../services/api.js";
import React, { useEffect, useState } from "react";
import { CalendarDays, Trophy, ListChecks, Users, ChevronRight } from "lucide-react";

async function fetchTournament(id) {
  try {
    return await getLiveTournament(id);
  } catch {
    return null;
  }
}

export default function TournamentLiveDetail({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const d = await fetchTournament(id);
      if (active) {
        setData(d);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <div className="p-4">Carregando...</div>;
  if (!data || !data.tournament) return <div className="p-4">Torneio não encontrado.</div>;

  const t = data.tournament;
  const rounds = (data.rounds || []).map((r, i) => ({
    ...r,
    id: r.id || r.logId || [t.tournamentId, r.round, i + 1].filter(Boolean).join("|"),
  }));
  const stats = {
    total: rounds.length,
    wins: rounds.filter((r) => r.result === "W").length,
    losses: rounds.filter((r) => r.result === "L").length,
    ties: rounds.filter((r) => r.result === "T").length,
  };
  const wr = stats.total ? Math.round(((stats.wins + 0.5 * stats.ties) / stats.total) * 100) : 0;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          {t.name}
        </h1>
        <div className="text-sm flex items-center gap-3 text-zinc-300">
          <div className="hidden md:flex items-center gap-2 text-zinc-400">
            <a className="hover:underline" href="#/tcg-live/torneios">Torneios</a>
            <ChevronRight className="w-4 h-4" />
            <span className="text-zinc-200 font-medium">{t.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-zinc-400" />
            {new Date(t.dateISO).toLocaleDateString("pt-BR")}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent>
            <SectionTitle icon={<ListChecks className="w-5 h-5 text-green-400" />} title="Resumo do Torneio" />
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat value={`${wr}%`} label="Win Rate" accent="text-green-400" />
              <Stat value={stats.total} label="Rounds" />
              <div>
                <p className="font-bold text-xl">{stats.wins} / {stats.losses} / {stats.ties}</p>
                <p className="text-zinc-400 text-sm">W / L / T</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle icon={<ListChecks className="w-5 h-5 text-blue-400" />} title="Progresso (round a round)" />
            <div className="flex gap-3 flex-wrap">
              {rounds.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">R{i + 1}</span>
                  <ResultPill r={r.result} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rounds Table */}
      <Card>
        <CardContent>
          <SectionTitle icon={<Users className="w-5 h-5 text-amber-400" />} title="Rounds" />
          <table className="w-full table-fixed text-sm text-left text-zinc-300">
            <colgroup>
              <col className="w-1/12" />
              <col className="w-5/12" />
              <col className="w-4/12" />
              <col className="w-2/12" />
            </colgroup>
            <thead className="text-zinc-400 border-b border-zinc-700">
              <tr>
                <th className="py-1">Round</th>
                <th className="py-1">Oponente</th>
                <th className="py-1">Deck do Oponente</th>
                <th className="py-1 text-center">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r, i) => (
                <tr key={r.id} className="border-b border-zinc-800">
                  <td className="py-2">R{i + 1}</td>
                  <td className="py-2">{r.opponent || "-"}</td>
                  <td className="py-2">{r.opponentDeck || "-"}</td>
                  <td className="py-2 text-center"><ResultPill r={r.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
      {icon}
      <span>{title}</span>
    </h2>
  );
}

function Stat({ value, label, accent = "" }) {
  return (
    <div>
      <p className={`font-bold text-xl ${accent}`}>{value}</p>
      <p className="text-zinc-400 text-sm">{label}</p>
    </div>
  );
}

function ResultPill({ r }) {
  const map = {
    W: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    L: "bg-rose-900/40 text-rose-300 border-rose-700",
    T: "bg-amber-900/40 text-amber-300 border-amber-700",
  };
  const cls = map[r] || "bg-zinc-800 text-zinc-300 border-zinc-700";
  return <span className={`px-2 py-0.5 rounded-lg border text-xs font-semibold ${cls}`}>{r ?? "-"}</span>;
}

function Card({ className = "", children }) {
  return <div className={`rounded-2xl bg-zinc-900 border border-zinc-700 shadow-lg ${className}`}>{children}</div>;
}
function CardContent({ className = "", children }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}
