import admin from "firebase-admin";

// Middleware to verify Firebase ID token or fallback API secret
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const apiKey = req.headers["x-api-key"] || bearerToken;
  if (!apiKey) return res.status(401).json({ error: "missing_auth" });

  // Allow using a static API secret for trusted integrations
  if (process.env.API_SECRET && apiKey === process.env.API_SECRET) return next();

  try {
    const decoded = await admin.auth().verifyIdToken(apiKey);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error("[auth] verification failed", err);
    return res.status(401).json({ error: "unauthorized" });
  }
}
