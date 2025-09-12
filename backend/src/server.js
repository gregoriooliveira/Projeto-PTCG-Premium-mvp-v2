import express from "express";
import cors from "cors";
import liveRoutes from "./live/routes.js";
import homeRoutes from "./home/routes.js";
import importRoutes from "./importing/routes.js";

const app = express();

// NDJSON request/response logging
import fs from "fs"; import path from "path";
const _logsDir = path.resolve(process.cwd(), "logs");
try{ if (!fs.existsSync(_logsDir)) fs.mkdirSync(_logsDir, { recursive:true }); }catch{}
const _reqLog = fs.createWriteStream(path.join(_logsDir, "requests.ndjson"), { flags:"a" });
const _resLog = fs.createWriteStream(path.join(_logsDir, "responses.ndjson"), { flags:"a" });
app.use((req, res, next) => {
  const start = Date.now();
  try{ _reqLog.write(JSON.stringify({ ts:new Date().toISOString(), method:req.method, url:req.originalUrl, headers:req.headers })+"\n"); }catch{}
  const _json = res.json.bind(res);
  res.json = (payload) => {
    const ms = Date.now() - start;
    try{ _resLog.write(JSON.stringify({ ts:new Date().toISOString(), method:req.method, url:req.originalUrl, status: res.statusCode, ms, payload })+"\n"); }catch{}
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
  allowedHeaders: ["Content-Type","Authorization"]
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok:true }));

// Mount Live routes under /api/live
app.use("/api/live", liveRoutes);
app.use("/api", homeRoutes);
app.use("/api", importRoutes);

// Placeholder for existing /api/home if needed (no-op here)
// app.get("/api/home", ...);

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`[ptcg-backend-live] API listening on http://localhost:${PORT}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`Using Firestore emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
});
