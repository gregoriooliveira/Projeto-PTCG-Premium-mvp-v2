import express from "express";
import cors from "cors";
import liveRoutes from "./live/routes.js";
import physicalRoutes from "./physical/routes.js";
import homeRoutes from "./home/routes.js";
import importRoutes from "./importing/routes.js";
import eventsRoutes from "./events/routes.js";
import logsRoutes from "./logs/routes.js";
import { nanoid } from "nanoid";

const app = express();

// CORS (same-origin em prod; necessário em dev apenas se acessarem direto sem proxy)
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const corsOptions = {
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET","POST","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-CSRF-Token"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "2mb" }));

// CSRF: double-submit
const CSRF_COOKIE = "csrfToken";
function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const parts = cookieHeader.split(";").map(c => c.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === name) return decodeURIComponent(v || "");
  }
  return null;
}

app.use((req, res, next) => {
  let token = readCookie(req, CSRF_COOKIE);
  if (!token) {
    token = nanoid();
    res.cookie(CSRF_COOKIE, token, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
  }
  if (!["GET","HEAD","OPTIONS"].includes(req.method)) {
    const headerToken = req.headers["x-csrf-token"];
    if (!headerToken || headerToken !== token) {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
  }
  res.setHeader("X-CSRF-Token", token);
  next();
});

// Healthcheck (semeia o cookie CSRF)
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Rotas
app.use("/api/live", liveRoutes);
app.use("/api/physical", physicalRoutes);
app.use("/api", homeRoutes);
app.use("/api", importRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/live-logs", logsRoutes);

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`[ptcg-backend-live] API listening on http://localhost:${PORT}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
});
