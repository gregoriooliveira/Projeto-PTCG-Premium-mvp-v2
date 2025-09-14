import { Router } from 'express';
import { getSession, SESSION_MAX_ITEMS } from '../sessionStore.js';

const router = Router();

router.get('/', (req, res) => {
  const session = getSession(req, res);
  res.json(session.events);
});

router.get('/:id', (req, res) => {
  const session = getSession(req, res);
  const ev = session.events.find(e => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'not found' });
  res.json(ev);
});

router.post('/', (req, res) => {
  const session = getSession(req, res);
  const ev = req.body || {};
  if (!ev.id) ev.id = `evt_${Date.now()}`;
  session.events.push(ev);
  if (session.events.length > SESSION_MAX_ITEMS) session.events.shift();
  res.json(ev);
});

router.put('/:id', (req, res) => {
  const session = getSession(req, res);
  const ev = session.events.find(e => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'not found' });
  Object.assign(ev, req.body || {});
  res.json(ev);
});

export default router;
