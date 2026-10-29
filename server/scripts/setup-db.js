import mongoose from 'mongoose';
import { readConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { applySchema } from '../src/database/setup.js';

try {
  await connectDatabase(readConfig().mongodbUri);
  const result = await applySchema(mongoose.connection.db);
  console.log(`${result.applied ? 'Applied' : 'Already applied'} ${result.migrationId}.`);
} catch (error) {
  console.error(`Schema setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
