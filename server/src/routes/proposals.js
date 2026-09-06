import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import * as repo from '../lib/repo.js';
import { HttpError } from '../lib/repo.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { status, opportunity_id, account_name } = req.query;
  res.json({ proposals: repo.listProposals(req.user, { status, opportunity_id, account_name }) });
});

router.get('/:id', (req, res) => {
  const proposal = repo.getProposal(req.user, req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Not found' });
  res.json({ proposal });
});

router.post('/', (req, res, next) => {
  try {
    res.status(201).json({ proposal: repo.createProposal(req.user, req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    res.json({ proposal: repo.updateProposal(req.user, req.params.id, req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    res.json(repo.deleteProposal(req.user, req.params.id));
  } catch (e) {
    next(e);
  }
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

export default router;
