import React from "react";
import HomePage from "./pages/HomePage.jsx";
import TCGLivePage from "./pages/TCGLivePage.jsx";
import TCGLiveDatePage from "./pages/TCGLiveDatePage.jsx";
import TCGLiveLogDetail from "./pages/TCGLiveLogDetail.jsx";
import DecksTCGLivePage, { DecksTCGFisicoPage } from "./pages/DecksLivePage.jsx";
import OpponentsPage from "./pages/OpponentsPage.jsx";
import PhysicalStoreEventsPage from "./pages/PhysicalStoreEventsPage.jsx";
import PhysicalDateEventsPage from "./pages/PhysicalDateEventsPage.jsx";
import PhysicalTournamentsMock from "./pages/PhysicalTournamentsMock.jsx";
import TournamentsLivePage from "./pages/TournamentsLivePage.jsx";
import PhysicalPageV2 from "./PhysicalPageV2.jsx";
import EventPhysicalSummaryPage from "./EventPhysicalSummaryPage.jsx";
import { DayPage, DeckPage, OpponentPage, RegistroPage, ConfigPage } from "./pages/Placeholders.jsx";

const routes = [
  { path: "/", element: <HomePage /> },
  {
    path: "/tcg-live",
    children: [
      { index: true, element: <TCGLivePage /> },
      { path: "logs/:logId", element: <TCGLiveLogDetail /> },
      { path: "decks", element: <DecksTCGLivePage /> },
      { path: "datas/:dateParam", element: <TCGLiveDatePage /> },
      { path: "torneios", element: <TournamentsLivePage /> },
    ],
  },
  {
    path: "/tcg-fisico",
    children: [
      { index: true, element: <PhysicalPageV2 /> },
      { path: "decks", element: <DecksTCGFisicoPage /> },
      {
        path: "eventos",
        children: [
          { index: true, element: <EventPhysicalSummaryPage /> },
          { path: "loja", element: <PhysicalStoreEventsPage /> },
          { path: "data", element: <PhysicalDateEventsPage /> },
          { path: ":eventId", element: <EventPhysicalSummaryPage /> },
        ],
      },
      { path: "torneios", element: <PhysicalTournamentsMock /> },
    ],
  },
  { path: "/oponentes", element: <OpponentsPage /> },
  { path: "/eventos/:eventId", element: <EventPhysicalSummaryPage /> },
  { path: "/day/:mdy", element: <DayPage /> },
  { path: "/deck/:name", element: <DeckPage /> },
  { path: "/opponent/:name", element: <OpponentPage /> },
  { path: "/registro/:id", element: <RegistroPage /> },
  { path: "/config", element: <ConfigPage /> },
  { path: "*", element: <HomePage /> },
];

export default routes;
