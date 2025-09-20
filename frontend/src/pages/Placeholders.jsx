import React from "react";
import { useParams } from "react-router-dom";

export function DayPage() {
  const { mdy } = useParams();
  return <div className="p-6 text-zinc-200">📅 Placeholder Dia: {mdy}</div>;
}

export function DeckPage() {
  const { name } = useParams();
  return <div className="p-6 text-zinc-200">🃏 Placeholder Deck: {decodeURIComponent(name || "")}</div>;
}

export function OpponentPage() {
  const { name } = useParams();
  return <div className="p-6 text-zinc-200">👤 Placeholder Oponente: {decodeURIComponent(name || "")}</div>;
}

export function RegistroPage() {
  const { id } = useParams();
  return <div className="p-6 text-zinc-200">📄 Placeholder Registro: {id}</div>;
}

