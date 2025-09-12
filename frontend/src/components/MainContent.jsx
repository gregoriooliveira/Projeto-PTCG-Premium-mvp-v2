import React from "react";
import { useRoutes } from "react-router-dom";
import routes from "../routes.jsx";

export default function MainContent() {
  const element = useRoutes(routes);
  return <main className="flex-1">{element}</main>;
}
