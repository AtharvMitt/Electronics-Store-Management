import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required. Copy .env.example to .env and configure it.');
  return {
    port,
    host: env.HOST || '127.0.0.1',
    mongodbUri: env.MONGODB_URI,
    clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
  };
}
