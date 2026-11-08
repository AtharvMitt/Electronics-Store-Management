import mongoose from 'mongoose';
import { ROLES, SOURCE_TYPES, STATUSES, PURCHASE_STATUSES } from './definitions.js';
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
preserveReferencedRecords(userSchema, [['InventoryTransaction', 'createdBy'], ['Purchase', 'createdBy'], ['PurchaseReceipt', 'receivedBy']]);
userSchema.set('toJSON', { transform: (_document, result) => { delete result.passwordHash; return result; } });

const categorySchema = new Schema({ name: text(80) }, options);
preserveReferencedRecords(categorySchema, [['Product', 'categoryId']]);

const optionalText = (maxlength) => ({ type: String, trim: true, maxlength, default: '' });
const supplierSchema = new Schema({
  name: text(150), contactName: optionalText(100), address: optionalText(250), status,
  phone: { ...optionalText(30), validate: (value) => !value || (/^\+?[\d\s().-]+$/.test(value) && /^[0-9]{7,15}$/.test(value.replace(/\D/g, ''))) },
  email: { ...optionalText(254), lowercase: true, validate: (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) },
}, options);
preserveReferencedRecords(supplierSchema, [['Purchase', 'supplierId']]);

const productSchema = new Schema({
  sku: { ...text(40), uppercase: true }, name: text(150), categoryId: reference('Category'),
  sellingPriceMinor: integer(), minimumStock: integer(), status,
}, options);
referenceChecks(productSchema, { categoryId: 'Category' });
preserveReferencedRecords(productSchema, [['Inventory', 'productId'], ['InventoryTransaction', 'productId'], ['Purchase', 'items.productId']]);

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

const sessionSchema = new Schema({
  tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  userId: reference('User'), expiresAt: { type: Date, required: true },
}, { ...options, timestamps: { createdAt: true, updatedAt: false } });
referenceChecks(sessionSchema, { userId: 'User' });

const saleItemSchema = new Schema({
  productId: reference('Product'), sku: text(40), name: text(150), quantity: integer(1),
  unitPriceMinor: integer(), lineTotalMinor: integer(),
}, { _id: false, strict: 'throw' });
const saleSchema = new Schema({
  transactionNumber: { ...text(40), unique: true }, requestId: { ...text(100), unique: true }, saleDate: { type: Date, required: true },
  createdBy: reference('User'), totalMinor: integer(), items: { type: [saleItemSchema], required: true,
    validate: { validator: (items) => Array.isArray(items) && items.length > 0 && items.length <= 100, message: 'Sales require between 1 and 100 items.' } },
}, options);
referenceChecks(saleSchema, { createdBy: 'User' });
saleSchema.pre('validate', async function () {
  const ids = this.items.map((item) => item.productId);
  if (new Set(ids.map(String)).size !== ids.length) this.invalidate('items', 'A product may appear only once in a sale.');
  const computedTotal = this.items.reduce((total, item) => {
    const lineTotal = item.quantity * item.unitPriceMinor;
    if (!Number.isSafeInteger(lineTotal) || lineTotal !== item.lineTotalMinor || !Number.isSafeInteger(total + lineTotal)) {
      this.invalidate('items', 'Sale lines must have exact safe-integer totals.');
      return total;
    }
    return total + lineTotal;
  }, 0);
  if (computedTotal !== this.totalMinor) this.invalidate('totalMinor', 'Sale total must equal the exact sum of its lines.');
  const count = await Product.countDocuments({ _id: { $in: ids } }).session(this.$session());
  if (count !== ids.length) this.invalidate('items', 'Sale products must exist.');
});

export const User = mongoose.model('User', userSchema, 'users');
export const Session = mongoose.model('Session', sessionSchema, 'sessions');
export const Category = mongoose.model('Category', categorySchema, 'categories');
export const Supplier = mongoose.model('Supplier', supplierSchema, 'suppliers');
export const Product = mongoose.model('Product', productSchema, 'products');
export const Inventory = mongoose.model('Inventory', inventorySchema, 'inventory');
export const InventoryTransaction = mongoose.model('InventoryTransaction', historySchema, 'inventoryTransactions');
export const Sale = mongoose.model('Sale', saleSchema, 'sales');

const supplierSnapshotSchema = new Schema({
  name: text(150), contactName: optionalText(100), phone: optionalText(30), email: optionalText(254), address: optionalText(250),
}, { _id: false, versionKey: false, strict: 'throw' });
const purchaseItemSchema = new Schema({
  productId: reference('Product'), sku: text(40), name: text(150), orderedQty: integer(1), receivedQty: integer(),
  unitCostMinor: integer(), lineTotalMinor: integer(),
}, { versionKey: false, strict: 'throw' });
const fingerprint = { type: String, required: true, match: /^[a-f0-9]{64}$/ };
const validLines = { validator: (items) => Array.isArray(items) && items.length > 0 && items.length <= 100, message: 'Provide between 1 and 100 items.' };
const purchaseSchema = new Schema({
  orderNumber: text(40), requestId: text(100), requestFingerprint: fingerprint, supplierId: reference('Supplier'),
  supplierSnapshot: { type: supplierSnapshotSchema, required: true }, orderDate: { type: Date, required: true },
  status: { type: String, enum: PURCHASE_STATUSES, required: true }, createdBy: reference('User'), totalMinor: integer(),
  items: { type: [purchaseItemSchema], required: true, validate: validLines },
}, { ...options, optimisticConcurrency: true });
referenceChecks(purchaseSchema, { supplierId: 'Supplier', createdBy: 'User' });
preserveReferencedRecords(purchaseSchema, [['PurchaseReceipt', 'purchaseId'], ['InventoryTransaction', 'sourceId']]);
purchaseSchema.pre('validate', async function () {
  const items = this.items || [], ids = items.map((item) => item.productId);
  if (new Set(ids.map(String)).size !== ids.length) this.invalidate('items', 'A product may appear only once in a purchase.');
  let total = 0;
  for (const item of items) {
    const lineTotal = item.orderedQty * item.unitCostMinor;
    if (item.receivedQty > item.orderedQty || !Number.isSafeInteger(lineTotal) || lineTotal !== item.lineTotalMinor || !Number.isSafeInteger(total + lineTotal)) {
      this.invalidate('items', 'Purchase quantities and totals must be exact and within their limits.');
    }
    total += lineTotal;
  }
  if (total !== this.totalMinor) this.invalidate('totalMinor', 'Purchase total must equal its stored line totals.');
  const received = items.some((item) => item.receivedQty > 0), complete = items.length > 0 && items.every((item) => item.receivedQty === item.orderedQty);
  if ((['DRAFT', 'ORDERED', 'CANCELLED'].includes(this.status) && received)
    || (this.status === 'PARTIAL' && (!received || complete)) || (this.status === 'RECEIVED' && !complete)) this.invalidate('status', 'Purchase status must match received quantities.');
  if (await Product.countDocuments({ _id: { $in: ids } }).session(this.$session()) !== ids.length) this.invalidate('items', 'Purchase products must exist.');
});

const receiptItemSchema = new Schema({ productId: reference('Product'), quantity: integer(1) }, { _id: false, versionKey: false, strict: 'throw' });
const receiptSchema = new Schema({
  requestId: text(100), requestFingerprint: fingerprint, purchaseId: reference('Purchase'), receivedBy: reference('User'),
  receivedAt: { type: Date, required: true }, items: { type: [receiptItemSchema], required: true, validate: validLines },
  inventoryTransactionIds: { type: [Schema.Types.ObjectId], required: true, validate: validLines },
}, { ...options, timestamps: { createdAt: true, updatedAt: false } });
referenceChecks(receiptSchema, { purchaseId: 'Purchase', receivedBy: 'User' });
receiptSchema.pre('validate', async function () {
  const items = this.items || [], ids = this.inventoryTransactionIds || [];
  if (new Set(items.map((item) => String(item.productId))).size !== items.length || ids.length !== items.length || new Set(ids.map(String)).size !== ids.length) {
    this.invalidate('items', 'Receipt products and inventory events must be distinct and correspond one-to-one.');
  }
  const events = await InventoryTransaction.find({ _id: { $in: ids }, sourceType: 'PURCHASE', sourceId: this.purchaseId, createdBy: this.receivedBy }).session(this.$session()).lean();
  if (events.length !== ids.length || items.some((item) => !events.some((event) => String(event.productId) === String(item.productId) && event.changeQty === item.quantity))) {
    this.invalidate('inventoryTransactionIds', 'Receipt quantities must match their purchase inventory events.');
  }
});
receiptSchema.pre('save', function () { if (!this.isNew) throw new Error('Purchase receipts are append-only.'); });
receiptSchema.pre('deleteOne', { document: true, query: false }, function () { throw new Error('Purchase receipts are append-only.'); });
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  receiptSchema.pre(operation, function () { throw new Error('Purchase receipts are append-only.'); });
}

export const Purchase = mongoose.model('Purchase', purchaseSchema, 'purchases');
export const PurchaseReceipt = mongoose.model('PurchaseReceipt', receiptSchema, 'purchaseReceipts');
