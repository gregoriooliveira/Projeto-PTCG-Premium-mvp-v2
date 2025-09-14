// backend/src/middleware/auth.js
import admin from "firebase-admin";

export async function authMiddleware(req, res, next) {
  try {
    // BYPASS em DEV: injeta um usuário fake para não quebrar o controller
    if (process.env.AUTH_DISABLED === '1') {
      req.user = {
        uid: process.env.DEV_UID || 'dev-local',
        email: process.env.DEV_EMAIL || 'dev@local',
      };
      return next();
    }

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "missing_auth" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    console.error("[auth] verification failed", err);
    return res.status(401).json({ error: "unauthorized" });
  }
}
