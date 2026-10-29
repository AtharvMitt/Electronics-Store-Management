import mongoose from 'mongoose';
import { User, Category, Product, Inventory, InventoryTransaction } from './models.js';
import { hashPassword } from '../modules/shared/passwords.js';
import { applySchema } from './setup.js';

export async function seedDevelopment({ password, environment = process.env.NODE_ENV }) {
  if (environment === 'production') throw new Error('Development seeding is disabled in production.');
  // Fail before any database writes if a secret was not supplied by the caller.
  const passwordHash = await hashPassword(password);
  await applySchema(mongoose.connection.db);
  const accounts = [
    ['admin', 'Administrator', 'ADMIN', 'ACTIVE'],
    ['inventory', 'Inventory Staff', 'INVENTORY', 'ACTIVE'],
    ['purchase', 'Purchase Staff', 'PURCHASE', 'ACTIVE'],
    ['sales', 'Sales Staff', 'SALES', 'ACTIVE'],
    ['manager', 'Store Manager', 'MANAGER', 'ACTIVE'],
    ['inactive', 'Inactive Staff', 'SALES', 'INACTIVE'],
  ];
  const fixtures = [
    ['TZ-MOUSE-001', 'Wireless Mouse', 'Accessories', 129900, 5, 25, 'ACTIVE'],
    ['TZ-USB-001', 'USB Flash Drive 64GB', 'Storage', 49900, 5, 2, 'ACTIVE'],
    ['TZ-AUDIO-001', 'Over-Ear Headphones', 'Audio', 249900, 5, 5, 'ACTIVE'],
    ['TZ-CABLE-001', 'USB-C Cable', 'Accessories', 29900, 3, 0, 'ACTIVE'],
    ['TZ-LEGACY-001', 'Legacy Audio Adapter', 'Audio', 50000, 2, 4, 'INACTIVE'],
  ];
  await mongoose.connection.transaction(async (session) => {
    let admin;
    for (const [login, name, role, status] of accounts) {
      const email = `${login}@techzone.example.test`;
      const user = await User.findOneAndUpdate({ email }, { $setOnInsert: { email, name, role, status, passwordHash } }, { session, upsert: true, returnDocument: 'after', runValidators: true });
      if (role === 'ADMIN') admin = user;
    }
    for (const [sku, name, categoryName, sellingPriceMinor, minimumStock, availableQty, status] of fixtures) {
      const category = await Category.findOneAndUpdate({ name: categoryName }, { $setOnInsert: { name: categoryName } }, { session, upsert: true, returnDocument: 'after', runValidators: true });
      const product = await Product.findOneAndUpdate({ sku }, { $setOnInsert: { sku, name, categoryId: category._id, sellingPriceMinor, minimumStock, status } }, { session, upsert: true, returnDocument: 'after' });
      if (!await Inventory.exists({ productId: product._id }).session(session)) {
        await Inventory.create([{ productId: product._id, availableQty }], { session });
        if (availableQty > 0) {
          const eventId = new mongoose.Types.ObjectId();
          await InventoryTransaction.create([{
            _id: eventId, productId: product._id, changeQty: availableQty, sourceType: 'ADJUSTMENT',
            sourceId: eventId, createdBy: admin._id, reason: 'Development opening balance',
          }], { session });
        }
      }
    }
  });
  return { accounts: accounts.length, products: fixtures.length };
}
