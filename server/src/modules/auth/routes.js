import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { User } from '../../database/models.js';
import { hashPassword, verifyPassword } from '../shared/passwords.js';
import { HttpError } from '../shared/errors.js';
import { SESSION_COOKIE, endSession, readSessionToken, requireAuth, sessionCookieOptions, startSession } from './sessions.js';
import { permissionsFor } from './permissions.js';

// One message for unknown, wrong-password and inactive accounts (SEC-008, SEC-009).
const LOGIN_FAILED = 'Invalid email or password.';
let decoyHash;

// Permissions let the client hide actions; the server still checks every request (SEC-004).
export const publicUser = ({ _id, name, email, role }) => ({ id: String(_id), name, email, role, permissions: permissionsFor(role) });

function readCredentials(body) {
  const { email, password } = body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password
    || email.length > 254 || password.length > 128) {
    throw new HttpError(400, 'Email and password are required.');
  }
  return { email: email.trim().toLowerCase(), password };
}

export function authRoutes() {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = readCredentials(req.body);
    const user = await User.findOne({ email }).select('+passwordHash').lean();
    // Check a decoy hash for unknown emails so response time does not reveal which accounts exist.
    decoyHash ??= await hashPassword(randomBytes(24).toString('base64url'));
    const valid = await verifyPassword(password, user?.passwordHash ?? decoyHash);
    if (!user || !valid || user.status !== 'ACTIVE') throw new HttpError(401, LOGIN_FAILED);

    await endSession(readSessionToken(req));
    const { token, expiresAt } = await startSession(user._id);
    res.cookie(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: expiresAt });
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', async (req, res) => {
    await endSession(readSessionToken(req));
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}
