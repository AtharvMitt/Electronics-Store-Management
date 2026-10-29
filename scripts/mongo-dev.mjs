import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import '../server/src/config/env.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.local', 'mongodb');
const port = Number(process.env.DEV_MONGODB_PORT || 27018);
const replicaSet = 'techzone-dev';
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('DEV_MONGODB_PORT must be between 1024 and 65535.');
const connection = mongoose.createConnection();

async function connect() {
  await connection.openUri(`mongodb://127.0.0.1:${port}/admin?directConnection=true`, { serverSelectionTimeoutMS: 2000 });
}

try {
  const action = process.argv[2];
  if (!['start', 'stop'].includes(action)) throw new Error('Usage: npm run db:start or npm run db:stop');
  mkdirSync(directory, { recursive: true });
  const pidfile = path.join(directory, 'mongod.pid');
  let running = false;
  if (existsSync(pidfile)) {
    const pid = Number(readFileSync(pidfile, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); running = true; } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
  if (action === 'stop') {
    if (!running) console.log('Project MongoDB is already stopped.');
    else {
      await connect();
      const options = await connection.db.admin().command({ getCmdLineOpts: 1 });
      if (options.parsed.storage.dbPath !== directory) throw new Error('Refusing to stop an instance outside this project.');
      try { await connection.db.admin().command({ shutdown: 1 }); } catch (error) {
        if (!['MongoNetworkError', 'MongoServerSelectionError'].includes(error.name)) throw error;
      }
      console.log('Project MongoDB shutdown requested.');
    }
  } else {
    if (!running) {
      const result = spawnSync('mongod', ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', replicaSet, '--logpath', path.join(directory, 'mongod.log'), '--pidfilepath', pidfile, '--fork'], { stdio: 'inherit' });
      if (result.error) throw new Error('mongod was not found. Install MongoDB Community Server and add it to PATH.');
      if (result.status !== 0) throw new Error('MongoDB did not start. Inspect .local/mongodb/mongod.log; check for a port conflict.');
    }
    await connect();
    const options = await connection.db.admin().command({ getCmdLineOpts: 1 });
    if (options.parsed.storage.dbPath !== directory) throw new Error('This port belongs to a different MongoDB instance.');
    const admin = connection.db.admin();
    const hello = await admin.command({ hello: 1 });
    if (!hello.setName) await admin.command({ replSetInitiate: { _id: replicaSet, members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    else if (hello.setName !== replicaSet) throw new Error('Unexpected replica-set name.');
    let writable = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await admin.command({ hello: 1 })).isWritablePrimary) { writable = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!writable) throw new Error('Replica set did not elect a primary. Inspect .local/mongodb/mongod.log.');
    console.log(`Project MongoDB ready on 127.0.0.1:${port} (${replicaSet}). Data: .local/mongodb`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await connection.close();
}
