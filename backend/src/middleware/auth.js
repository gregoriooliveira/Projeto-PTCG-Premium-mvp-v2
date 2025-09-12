import admin from "firebase-admin";

// Middleware to verify Firebase ID tokens
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing_auth" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error("[auth] verification failed", err);
    return res.status(401).json({ error: "unauthorized" });
  }
}
