import { Router } from 'express';
import { getSession, SESSION_MAX_ITEMS } from '../sessionStore.js';

const router = Router();

router.get('/', (req, res) => {
  const session = getSession(req, res);
  res.json(session.logs);
});

router.post('/', (req, res) => {
  const session = getSession(req, res);
  const log = req.body || {};
  if (!log.id) log.id = `log_${Date.now()}`;
  session.logs.unshift(log);
  if (session.logs.length > SESSION_MAX_ITEMS) session.logs.pop();
  res.json(log);
});

export default router;
