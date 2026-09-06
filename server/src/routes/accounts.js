import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import * as repo from '../lib/repo.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ accounts: repo.listAccounts(req.user, { name: req.query.name }) });
});

router.get('/:id', (req, res) => {
  const account = repo.getAccount(req.user, req.params.id);
  if (!account) return res.status(404).json({ error: 'Not found' });
  res.json({ account });
});

export default router;
