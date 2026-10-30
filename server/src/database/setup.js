import { definitions, sessionDefinitions } from './definitions.js';

// Applied in order. Never edit or remove an applied migration; add a new one instead.
const migrations = [
  { id: '001-initial-inventory-foundation', collections: definitions },
  { id: '002-authentication-sessions', collections: sessionDefinitions },
];

async function applyCollections(db, collections) {
  for (const [name, { validator, indexes }] of Object.entries(collections)) {
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
}

export async function applySchema(db) {
  const records = db.collection('_schemaMigrations');
  const appliedIds = [];
  for (const { id, collections } of migrations) {
    if (await records.findOne({ _id: id })) continue;
    await applyCollections(db, collections);
    await records.updateOne({ _id: id }, { $setOnInsert: { appliedAt: new Date() } }, { upsert: true });
    appliedIds.push(id);
  }
  return { applied: appliedIds.length > 0, appliedIds, migrationId: migrations.at(-1).id };
}
