import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  await connection.openUri(`mongodb://127.0.0.1:${port}/admin?directConnection=true`, { serverSelectionTimeoutMS: 1000 });
}

function ownsDatabase(options) {
  const actual = path.resolve(options.parsed.storage.dbPath);
  return process.platform === 'win32' ? actual.toLowerCase() === directory.toLowerCase() : actual === directory;
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
      if (!ownsDatabase(options)) throw new Error('Refusing to stop an instance outside this project.');
      try { await connection.db.admin().command({ shutdown: 1 }); } catch (error) {
        if (!['MongoNetworkError', 'MongoServerSelectionError'].includes(error.name)) throw error;
      }
      console.log('Project MongoDB shutdown requested.');
    }
  } else {
    if (!running) {
      // Node manages the detached process and PID file on all three platforms.
      // mongod --fork is Unix-only; shell/background operators also differ.
      const child = spawn('mongod', ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', replicaSet, '--logpath', path.join(directory, 'mongod.log'), '--logappend'], { detached: true, stdio: 'ignore', windowsHide: true });
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', () => reject(new Error('mongod could not start. Install MongoDB Community Server and add its bin directory to PATH.')));
      });
      writeFileSync(pidfile, String(child.pid));
      child.unref();
    }
    let connected = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try { await connect(); connected = true; break; }
      catch { await connection.close(); await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    if (!connected) throw new Error('MongoDB did not start. Inspect .local/mongodb/mongod.log; check PATH and port conflicts.');
    const options = await connection.db.admin().command({ getCmdLineOpts: 1 });
    if (!ownsDatabase(options)) throw new Error('This port belongs to a different MongoDB instance.');
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
