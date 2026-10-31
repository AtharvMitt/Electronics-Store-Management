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
