import express from "express";
import cors from "cors";
import liveRoutes from "./live/routes.js";
import homeRoutes from "./home/routes.js";
import importRoutes from "./importing/routes.js";
import eventsRoutes from "./events/routes.js";
import logsRoutes from "./logs/routes.js";
import { nanoid } from "nanoid";

const app = express();

// NDJSON request/response logging
import fs from "fs"; import path from "path";
const _logsDir = path.resolve(process.cwd(), "logs");
try{ if (!fs.existsSync(_logsDir)) fs.mkdirSync(_logsDir, { recursive:true }); }catch{}

// simple size-based log rotation
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB
function createRotatingStream(file) {
  let stream = fs.createWriteStream(file, { flags: "a" });
  async function rotateIfNeeded() {
    try {
      const { size } = await fs.promises.stat(file);
      if (size >= MAX_LOG_BYTES) {
        stream.end();
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        await fs.promises.rename(file, `${file}.${ts}`);
        stream = fs.createWriteStream(file, { flags: "a" });
      }
    } catch {
      // ignore rotation errors
    }
  }
  return {
    write(str) {
      stream.write(str, (err) => {
        if (!err) rotateIfNeeded();
      });
    },
  };
}

const _reqLog = createRotatingStream(path.join(_logsDir, "requests.ndjson"));
const _resLog = createRotatingStream(path.join(_logsDir, "responses.ndjson"));

app.use((req, res, next) => {
  const start = Date.now();

  // sanitize sensitive headers
  const headers = { ...req.headers };
  if (headers.authorization) headers.authorization = "[REDACTED]";
  if (headers.cookie) headers.cookie = "[REDACTED]";
  try{ _reqLog.write(JSON.stringify({ ts:new Date().toISOString(), method:req.method, url:req.originalUrl, headers })+"\n"); }catch{}

  const _json = res.json.bind(res);
  res.json = (payload) => {
    const ms = Date.now() - start;
    let payloadSize = 0;
    try { payloadSize = JSON.stringify(payload).length; } catch {}
    try{ _resLog.write(JSON.stringify({ ts:new Date().toISOString(), method:req.method, url:req.originalUrl, status: res.statusCode, ms, payloadSize })+"\n"); }catch{}
    return _json(payload);
  };
  next();
});


// CORS (strict) - allow Vite dev with credentials
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const corsOptions = {
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET","POST","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-CSRF-Token"]
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


app.use(express.json({ limit: "2mb" }));

// CSRF protection - double submit token
const CSRF_COOKIE = "csrfToken";
function getCookie(req, name){
  const cookieHeader = req.headers.cookie || "";
  const parts = cookieHeader.split(";").map(c => c.trim().split("="));
  for(const [k, v] of parts){
    if(k === name) return decodeURIComponent(v || "");
  }
  return null;
}

app.use((req, res, next) => {
  let token = getCookie(req, CSRF_COOKIE);
  if(!token){
    token = nanoid();
    res.cookie(CSRF_COOKIE, token, {
      sameSite: "strict",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production"
    });
  }
  if(!["GET","HEAD","OPTIONS"].includes(req.method)){
    const headerToken = req.headers["x-csrf-token"];
    if(!headerToken || headerToken !== token){
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
  }
  next();
});

app.get("/api/health", (req, res) => res.json({ ok:true }));

// Mount Live routes under /api/live
app.use("/api/live", liveRoutes);
app.use("/api", homeRoutes);
app.use("/api", importRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/live-logs", logsRoutes);

// Placeholder for existing /api/home if needed (no-op here)
// app.get("/api/home", ...);

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`[ptcg-backend-live] API listening on http://localhost:${PORT}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
});
