import mongoose from 'mongoose';
import { ROLES, SOURCE_TYPES, STATUSES } from './definitions.js';
import { referenceChecks, preserveReferencedRecords } from '../modules/shared/references.js';

const { Schema } = mongoose;
const options = { timestamps: true, strict: 'throw', autoIndex: false, autoCreate: false };
const text = (maxlength) => ({ type: String, required: true, trim: true, minlength: 1, maxlength });
const integer = (min = 0) => ({ type: Number, required: true, min, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger });
const reference = (ref) => ({ type: Schema.Types.ObjectId, ref, required: true });
const status = { type: String, enum: STATUSES, default: 'ACTIVE', required: true };

const userSchema = new Schema({
  name: text(100),
  email: { ...text(254), lowercase: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  passwordHash: { type: String, required: true, select: false, match: /^scrypt\$/ },
  role: { type: String, required: true, enum: ROLES }, status,
}, options);
preserveReferencedRecords(userSchema, [['InventoryTransaction', 'createdBy']]);
userSchema.set('toJSON', { transform: (_document, result) => { delete result.passwordHash; return result; } });

const categorySchema = new Schema({ name: text(80) }, options);
preserveReferencedRecords(categorySchema, [['Product', 'categoryId']]);

const productSchema = new Schema({
  sku: { ...text(40), uppercase: true }, name: text(150), categoryId: reference('Category'),
  sellingPriceMinor: integer(), minimumStock: integer(), status,
}, options);
referenceChecks(productSchema, { categoryId: 'Category' });
preserveReferencedRecords(productSchema, [['Inventory', 'productId'], ['InventoryTransaction', 'productId']]);

const inventorySchema = new Schema({ productId: reference('Product'), availableQty: integer() }, options);
referenceChecks(inventorySchema, { productId: 'Product' });

const historySchema = new Schema({
  productId: reference('Product'), changeQty: integer(-Number.MAX_SAFE_INTEGER),
  sourceType: { type: String, required: true, enum: SOURCE_TYPES },
  sourceId: { type: Schema.Types.ObjectId, required: true },
  createdBy: reference('User'), reason: { type: String, trim: true, maxlength: 250 },
}, { ...options, timestamps: { createdAt: true, updatedAt: false } });
referenceChecks(historySchema, { productId: 'Product', createdBy: 'User' });
historySchema.pre('validate', async function () {
  if (this.sourceType === 'ADJUSTMENT') {
    if (!this.reason?.trim()) this.invalidate('reason', 'Adjustments require a reason.');
    if (!this.sourceId?.equals(this._id)) this.invalidate('sourceId', 'An adjustment references its own event ID.');
  } else if (['PURCHASE', 'SALE'].includes(this.sourceType) && this.sourceId) {
    const collection = this.sourceType === 'PURCHASE' ? 'purchases' : 'sales';
    const source = await mongoose.connection.db.collection(collection).findOne({ _id: this.sourceId }, { session: this.$session() });
    if (!source) this.invalidate('sourceId', 'Source transaction does not exist.');
  }
});
historySchema.pre('save', function () {
  if (!this.isNew) throw new Error('Inventory history is append-only.');
});
historySchema.pre('deleteOne', { document: true, query: false }, function () {
  throw new Error('Inventory history is append-only.');
});
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  historySchema.pre(operation, function () { throw new Error('Inventory history is append-only.'); });
}

export const User = mongoose.model('User', userSchema, 'users');
export const Category = mongoose.model('Category', categorySchema, 'categories');
export const Product = mongoose.model('Product', productSchema, 'products');
export const Inventory = mongoose.model('Inventory', inventorySchema, 'inventory');
export const InventoryTransaction = mongoose.model('InventoryTransaction', historySchema, 'inventoryTransactions');
