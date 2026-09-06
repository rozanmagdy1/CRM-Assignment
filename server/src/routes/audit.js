import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { recentAuditLog } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);

// Admin-only: the audit log spans every user's activity, so it follows the
// same access model as everything else - only Ava (admin) can read it.
router.get('/', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can view the tool audit log' });
  }
  res.json({ entries: recentAuditLog(200) });
});

export default router;
