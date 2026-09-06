import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import * as repo from '../lib/repo.js';
import { HttpError } from '../lib/repo.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { stage, open_only, closed_only, min_amount, max_amount, account_name, owner_name } = req.query;
  const opportunities = repo.listOpportunities(req.user, {
    stage,
    open_only: open_only === 'true',
    closed_only: closed_only === 'true',
    min_amount: min_amount ? Number(min_amount) : undefined,
    max_amount: max_amount ? Number(max_amount) : undefined,
    account_name,
    owner_name,
  });
  res.json({ opportunities });
});

router.get('/:id', (req, res) => {
  const opportunity = repo.getOpportunity(req.user, req.params.id);
  if (!opportunity) return res.status(404).json({ error: 'Not found' });
  const proposals = repo.proposalsForOpportunity(req.user, req.params.id);
  const account = repo.getAccount(req.user, opportunity.account_id);
  res.json({ opportunity, proposals, account });
});

router.post('/', (req, res, next) => {
  try {
    res.status(201).json({ opportunity: repo.createOpportunity(req.user, req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', (req, res, next) => {
  try {
    res.json({ opportunity: repo.updateOpportunity(req.user, req.params.id, req.body || {}) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    res.json(repo.deleteOpportunity(req.user, req.params.id));
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
