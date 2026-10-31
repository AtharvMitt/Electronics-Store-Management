import { Router } from 'express';
import { User } from '../../database/models.js';
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';

// Read-only user list (SRS §13.1: Admin manages users, Manager views them).
// Creating and editing accounts (FR-AUTH-006) is not part of #7.
export function userRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', requirePermission('users:view'), async (_req, res) => {
    const users = await User.find().sort({ name: 1 }).lean();
    res.json({ users: users.map(({ _id, name, email, role, status }) => ({ id: String(_id), name, email, role, status })) });
  });

  return router;
}
