import { readConfig } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { seedDevelopment } from '../src/database/seed.js';

try {
  await connectDatabase(readConfig().mongodbUri);
  const result = await seedDevelopment({ password: process.env.SEED_PASSWORD });
  console.log(`Development seed complete (${result.accounts} account definitions, ${result.products} product definitions). Existing records and passwords were preserved.`);
} catch (error) {
  console.error(`Development seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
