import { definitions } from './definitions.js';

const migrationId = '001-initial-inventory-foundation';

export async function applySchema(db) {
  const migrations = db.collection('_schemaMigrations');
  if (await migrations.findOne({ _id: migrationId })) return { applied: false, migrationId };
  for (const [name, { validator, indexes }] of Object.entries(definitions)) {
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
    if (exists) {
      const invalid = await db.collection(name).countDocuments({ $nor: [validator] }, { limit: 1 });
      if (invalid) throw new Error(`Existing ${name} data violates the schema. Review it before migration; no data was deleted.`);
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    }
    if (indexes.length) await db.collection(name).createIndexes(indexes);
  }
  await migrations.updateOne({ _id: migrationId }, { $setOnInsert: { appliedAt: new Date() } }, { upsert: true });
  return { applied: true, migrationId };
}
