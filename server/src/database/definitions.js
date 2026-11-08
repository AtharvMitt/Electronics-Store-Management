export const STATUSES = ['ACTIVE', 'INACTIVE'];
export const ROLES = ['ADMIN', 'INVENTORY', 'PURCHASE', 'SALES', 'MANAGER'];
export const SOURCE_TYPES = ['PURCHASE', 'SALE', 'ADJUSTMENT'];
const maximum = Number.MAX_SAFE_INTEGER;
const text = (maxLength) => ({ bsonType: 'string', minLength: 1, maxLength, pattern: '\\S' });
const integer = (minimum = 0) => ({ bsonType: ['int', 'long', 'double'], minimum, maximum, multipleOf: 1 });
const reference = { bsonType: 'objectId' };
const status = { enum: STATUSES };

function definition(properties, required, indexes = [], { history = false } = {}) {
  return {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        additionalProperties: false,
        required: ['_id', ...required, 'createdAt', ...(history ? [] : ['updatedAt'])],
        properties: {
          _id: reference,
          __v: integer(),
          createdAt: { bsonType: 'date' },
          ...(history ? {} : { updatedAt: { bsonType: 'date' } }),
          ...properties,
        },
      },
    },
    indexes,
  };
}

export const definitions = {
  users: definition({
    name: text(100), email: text(254), passwordHash: { bsonType: 'string', pattern: '^scrypt\\$' },
    role: { enum: ROLES }, status,
  }, ['name', 'email', 'passwordHash', 'role', 'status'], [
    { key: { email: 1 }, name: 'user_email_unique', unique: true },
  ]),
  categories: definition({ name: text(80) }, ['name'], [
    { key: { name: 1 }, name: 'category_name_unique', unique: true },
  ]),
  products: definition({
    sku: text(40), name: text(150), categoryId: reference,
    sellingPriceMinor: integer(), minimumStock: integer(), status,
  }, ['sku', 'name', 'categoryId', 'sellingPriceMinor', 'minimumStock', 'status'], [
    { key: { sku: 1 }, name: 'product_sku_unique', unique: true },
    { key: { categoryId: 1, status: 1 }, name: 'product_category_status' },
    { key: { name: 1 }, name: 'product_name' },
  ]),
  inventory: definition({ productId: reference, availableQty: integer() }, ['productId', 'availableQty'], [
    { key: { productId: 1 }, name: 'inventory_product_unique', unique: true },
  ]),
  inventoryTransactions: definition({
    productId: reference, changeQty: integer(-maximum), sourceType: { enum: SOURCE_TYPES },
    sourceId: reference, createdBy: reference, reason: text(250),
  }, ['productId', 'changeQty', 'sourceType', 'sourceId', 'createdBy'], [
    { key: { productId: 1, createdAt: -1 }, name: 'history_product_date' },
    { key: { sourceType: 1, sourceId: 1 }, name: 'history_source' },
    { key: { createdBy: 1 }, name: 'history_actor' },
  ], { history: true }),
};

export const salesDefinitions = {
  sales: definition({
    transactionNumber: text(40), requestId: text(100), saleDate: { bsonType: 'date' }, createdBy: reference,
    totalMinor: integer(), items: {
      bsonType: 'array', minItems: 1, maxItems: 100, items: {
        bsonType: 'object', additionalProperties: false,
        required: ['productId', 'sku', 'name', 'quantity', 'unitPriceMinor', 'lineTotalMinor'],
        properties: {
          productId: reference, sku: text(40), name: text(150), quantity: integer(1),
          unitPriceMinor: integer(), lineTotalMinor: integer(),
        },
      },
    },
  }, ['transactionNumber', 'requestId', 'saleDate', 'createdBy', 'totalMinor', 'items'], [
    { key: { transactionNumber: 1 }, name: 'sale_number_unique', unique: true },
    { key: { requestId: 1 }, name: 'sale_request_unique', unique: true },
    { key: { saleDate: -1, _id: -1 }, name: 'sale_date' },
    { key: { createdBy: 1 }, name: 'sale_actor' },
  ]),
};

// Migration 004: supplier contact details are optional in SRS §14.3.
export const supplierDefinitions = {
  suppliers: definition({
    name: text(150), contactName: { bsonType: 'string', maxLength: 100 },
    phone: { bsonType: 'string', maxLength: 30 }, email: { bsonType: 'string', maxLength: 254 },
    address: { bsonType: 'string', maxLength: 250 }, status,
  }, ['name', 'status'], [
    { key: { status: 1, name: 1 }, name: 'supplier_status_name' },
  ]),
};

export const PURCHASE_STATUSES = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'];
const requestFingerprint = { bsonType: 'string', pattern: '^[a-f0-9]{64}$' };
const purchaseLines = {
  bsonType: 'array', minItems: 1, maxItems: 100, items: {
    bsonType: 'object', additionalProperties: false,
    required: ['_id', 'productId', 'sku', 'name', 'orderedQty', 'receivedQty', 'unitCostMinor', 'lineTotalMinor'],
    properties: {
      _id: reference, productId: reference, sku: text(40), name: text(150),
      orderedQty: integer(1), receivedQty: integer(), unitCostMinor: integer(), lineTotalMinor: integer(),
    },
  },
};

// Migration 005: orders do not change stock; receipts and stock commit together.
export const purchaseDefinitions = {
  purchases: definition({
    orderNumber: text(40), requestId: text(100), requestFingerprint, supplierId: reference,
    supplierSnapshot: { bsonType: 'object', additionalProperties: false, required: ['name'], properties: {
      name: text(150), contactName: { bsonType: 'string', maxLength: 100 }, phone: { bsonType: 'string', maxLength: 30 },
      email: { bsonType: 'string', maxLength: 254 }, address: { bsonType: 'string', maxLength: 250 },
    } },
    orderDate: { bsonType: 'date' }, status: { enum: PURCHASE_STATUSES }, createdBy: reference,
    totalMinor: integer(), items: purchaseLines,
  }, ['orderNumber', 'requestId', 'requestFingerprint', 'supplierId', 'supplierSnapshot', 'orderDate', 'status', 'createdBy', 'totalMinor', 'items'], [
    { key: { orderNumber: 1 }, name: 'purchase_number_unique', unique: true },
    { key: { requestId: 1 }, name: 'purchase_request_unique', unique: true },
    { key: { supplierId: 1, orderDate: -1 }, name: 'purchase_supplier_date' },
    { key: { orderDate: -1, _id: -1 }, name: 'purchase_date' },
  ]),
  purchaseReceipts: definition({
    requestId: text(100), requestFingerprint, purchaseId: reference, receivedBy: reference, receivedAt: { bsonType: 'date' },
    items: { bsonType: 'array', minItems: 1, maxItems: 100, items: {
      bsonType: 'object', additionalProperties: false, required: ['productId', 'quantity'],
      properties: { productId: reference, quantity: integer(1) },
    } },
    inventoryTransactionIds: { bsonType: 'array', minItems: 1, maxItems: 100, items: reference },
  }, ['requestId', 'requestFingerprint', 'purchaseId', 'receivedBy', 'receivedAt', 'items', 'inventoryTransactionIds'], [
    { key: { requestId: 1 }, name: 'receipt_request_unique', unique: true },
    { key: { purchaseId: 1, receivedAt: -1 }, name: 'receipt_purchase_date' },
    { key: { inventoryTransactionIds: 1 }, name: 'receipt_history_unique', unique: true },
  ], { history: true }),
};

purchaseDefinitions.purchases.validator = { $and: [purchaseDefinitions.purchases.validator, { $expr: { $and: [
  { $eq: ['$totalMinor', { $sum: '$items.lineTotalMinor' }] },
  { $eq: [{ $size: '$items' }, { $size: { $setUnion: ['$items.productId', []] } }] },
  { $allElementsTrue: { $map: { input: '$items', as: 'line', in: { $and: [
    { $lte: ['$$line.receivedQty', '$$line.orderedQty'] },
    { $eq: ['$$line.lineTotalMinor', { $multiply: ['$$line.orderedQty', '$$line.unitCostMinor'] }] },
  ] } } } },
  { $switch: { branches: [
    { case: { $in: ['$status', ['DRAFT', 'ORDERED', 'CANCELLED']] }, then: { $eq: [{ $sum: '$items.receivedQty' }, 0] } },
    { case: { $eq: ['$status', 'RECEIVED'] }, then: { $allElementsTrue: { $map: { input: '$items', as: 'line', in: { $eq: ['$$line.receivedQty', '$$line.orderedQty'] } } } } },
    { case: { $eq: ['$status', 'PARTIAL'] }, then: { $and: [
      { $gt: [{ $sum: '$items.receivedQty' }, 0] },
      { $anyElementTrue: { $map: { input: '$items', as: 'line', in: { $lt: ['$$line.receivedQty', '$$line.orderedQty'] } } } },
    ] } },
  ], default: false } },
] } }] };

purchaseDefinitions.purchaseReceipts.validator = { $and: [purchaseDefinitions.purchaseReceipts.validator, { $expr: { $and: [
  { $eq: [{ $size: '$items' }, { $size: { $setUnion: ['$items.productId', []] } }] },
  { $eq: [{ $size: '$items' }, { $size: '$inventoryTransactionIds' }] },
  { $eq: [{ $size: '$inventoryTransactionIds' }, { $size: { $setUnion: ['$inventoryTransactionIds', []] } }] },
] } }] };

// Migration 002: server-side login sessions. Only a SHA-256 hash of the token is stored;
// the TTL index lets MongoDB remove expired sessions.
export const sessionDefinitions = {
  sessions: definition({
    tokenHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' }, userId: reference, expiresAt: { bsonType: 'date' },
  }, ['tokenHash', 'userId', 'expiresAt'], [
    { key: { tokenHash: 1 }, name: 'session_token_unique', unique: true },
    { key: { userId: 1 }, name: 'session_user' },
    { key: { expiresAt: 1 }, name: 'session_expiry_ttl', expireAfterSeconds: 0 },
  ], { history: true }),
};

// Adjustments reference their own history event and must record a reason.
definitions.inventoryTransactions.validator = {
  $and: [
    definitions.inventoryTransactions.validator,
    { $or: [
      { sourceType: { $ne: 'ADJUSTMENT' } },
      { reason: { $type: 'string', $regex: '\\S' }, $expr: { $eq: ['$sourceId', '$_id'] } },
    ] },
  ],
};
