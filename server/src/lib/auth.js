import { getUserById } from './scope.js';

export function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: 'Not signed in' });
  const user = getUserById(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Not signed in' });
  }
  req.user = user;
  next();
}
