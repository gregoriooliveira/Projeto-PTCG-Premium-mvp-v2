import admin from "firebase-admin";

let app;
if (!admin.apps.length) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || "ptcg-premium-dev";
  const options = { projectId };
  // If running against the emulator, admin SDK picks it up from FIRESTORE_EMULATOR_HOST
  app = admin.initializeApp({ projectId });
}
export const db = admin.firestore();
export const FieldValue = admin.firestore.FieldValue;
