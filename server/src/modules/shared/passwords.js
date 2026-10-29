import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const parameters = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Development passwords must contain 12–128 characters.');
  }
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, parameters);
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt}$${key.toString('hex')}`;
}

// Shared format for the authentication owner; this is not a login endpoint.
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length > 128 || typeof hash !== 'string') return false;
  const parts = hash.split('$');
  if (parts.length !== 6) return false;
  const [algorithm, n, r, p, salt, encoded] = parts;
  if (algorithm !== 'scrypt' || Number(n) !== parameters.N || Number(r) !== parameters.r || Number(p) !== parameters.p || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(encoded)) return false;
  const actual = await scrypt(password, salt, 64, parameters);
  return timingSafeEqual(actual, Buffer.from(encoded, 'hex'));
}
