import { createApp } from './app.js';
import { readConfig } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

let server;
try {
  const config = readConfig();
  await connectDatabase(config.mongodbUri);
  server = createApp(config).listen(config.port, config.host, () => {
    console.log(`TechZone API listening on http://${config.host}:${config.port}`);
  });
  server.on('error', async () => {
    console.error('API could not listen on the configured host/port.');
    await disconnectDatabase();
    process.exitCode = 1;
  });
} catch {
  console.error('Startup failed. Check .env, start MongoDB, and confirm the configured port is available.');
  await disconnectDatabase();
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    if (!server) return;
    server.close(async () => {
      await disconnectDatabase();
      clearTimeout(deadline);
    });
  });
}
