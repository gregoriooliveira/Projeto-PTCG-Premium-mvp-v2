import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import EventPhysicalSummaryPage from './EventPhysicalSummaryPage.jsx';

// Simple hash-based router with placeholders
export default function Router({ children }) {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash.startsWith('#/registro/')) {
    const id = hash.replace('#/registro/', '');
    return <div className="p-6 text-zinc-200">📄 Placeholder Registro: {id}</div>;
  }
  if (hash.startsWith('#/deck/')) {
    const name = decodeURIComponent(hash.replace('#/deck/', ''));
    return <div className="p-6 text-zinc-200">🃏 Placeholder Deck: {name}</div>;
  }
  if (hash.startsWith('#/opponent/')) {
    const name = decodeURIComponent(hash.replace('#/opponent/', ''));
    return <div className="p-6 text-zinc-200">👤 Placeholder Oponente: {name}</div>;
  }
  if (hash.startsWith('#/day/')) {
    const date = hash.replace('#/day/', '');
    return <div className="p-6 text-zinc-200">📅 Placeholder Dia: {date}</div>;
  }


  // Event summary page (Pokémon TCG Físico)
  if (hash.startsWith('#/tcg-fisico/eventos/')) {
    const id = decodeURIComponent(hash.replace('#/tcg-fisico/eventos/', ''));
    const eventFromProps = (history.state && history.state.eventFromProps) || null;
    return <EventPhysicalSummaryPage eventFromProps={eventFromProps} />;
  }
  if (hash.startsWith('#/eventos/')) {
    const id = decodeURIComponent(hash.replace('#/eventos/', ''));
    const eventFromProps = (history.state && history.state.eventFromProps) || null;
    return <EventPhysicalSummaryPage eventFromProps={eventFromProps} />;
  }


  if (hash.startsWith('#/oponentes')) {
    return <div className="p-6 text-zinc-200">⚠️ Esta rota é renderizada pelo App.jsx. (Fallback Router)</div>;
  }

  return children;
}

Router.propTypes = {
  children: PropTypes.node,
};

Router.defaultProps = {
  children: null,
};
