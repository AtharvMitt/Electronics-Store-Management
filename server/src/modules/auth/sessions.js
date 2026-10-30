import { createHash, randomBytes } from 'node:crypto';
import { Session, User } from '../../database/models.js';
import { HttpError } from '../shared/errors.js';

export const SESSION_COOKIE = 'tz_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function readSessionToken(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=') || null;
  }
  return null;
}

export function sessionCookieOptions() {
  // Secure cookies need HTTPS, which is a production requirement (SEC-005).
  return { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api' };
}

export async function startSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await Session.create({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function endSession(token) {
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
}

// Returns the active user for a valid, unexpired session, otherwise null.
export async function findSessionUser(token) {
  if (!token || token.length > 100) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const user = await User.findById(session.userId).lean();
  if (!user || user.status !== 'ACTIVE') {
    // A deactivated account loses its existing sessions too (FR-AUTH-003).
    await Session.deleteMany({ userId: session.userId });
    return null;
  }
  return user;
}

export async function requireAuth(req, _res, next) {
  const user = await findSessionUser(readSessionToken(req));
  if (!user) throw new HttpError(401, 'Please log in to continue.');
  req.user = user;
  next();
}
