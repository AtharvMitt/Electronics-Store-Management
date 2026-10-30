import mongoose from 'mongoose';

export async function assertReference(modelName, id, session = null) {
  if (!mongoose.isObjectIdOrHexString(id)) throw new Error(`Invalid ${modelName} reference.`);
  if (!await mongoose.model(modelName).exists({ _id: id }).session(session)) {
    throw new Error(`${modelName} reference does not exist.`);
  }
}

export function referenceChecks(schema, references) {
  schema.pre('validate', async function () {
    for (const [field, modelName] of Object.entries(references)) {
      if (this.get(field) == null) continue; // required validators handle missing values
      try { await assertReference(modelName, this.get(field), this.$session()); }
      catch (error) { this.invalidate(field, error.message); }
    }
  });
  for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace']) {
    schema.pre(operation, async function () {
      const update = this.getUpdate();
      if (Array.isArray(update)) throw new Error('Pipeline updates are not supported by the shared model contract.');
      this.setOptions({ runValidators: true });
      for (const [field, modelName] of Object.entries(references)) {
        const value = update?.$set?.[field] ?? update?.$setOnInsert?.[field] ?? update?.[field];
        if (value != null) await assertReference(modelName, value, this.getOptions().session);
      }
    });
  }
  // insertMany and bulkWrite bypass document save hooks. Require reviewed service writes.
  schema.pre('insertMany', function () { throw new Error('Use create/save with reference validation instead of insertMany.'); });
  schema.pre('bulkWrite', function () { throw new Error('Use validated service writes instead of bulkWrite.'); });
}

export function preserveReferencedRecords(schema, dependencies) {
  for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(operation, { query: true, document: false }, async function () {
      const session = this.getOptions().session;
      const records = await this.model.find(this.getFilter()).select('_id').session(session || null);
      const ids = records.map(({ _id }) => _id);
      for (const [modelName, field] of dependencies) {
        if (await mongoose.model(modelName).exists({ [field]: { $in: ids } }).session(session || null)) {
          throw new Error('Referenced records cannot be deleted; deactivate them instead.');
        }
      }
    });
  }
  schema.pre('deleteOne', { document: true, query: false }, function () {
    throw new Error('Use reviewed model/service deletion with reference protection.');
  });
}
