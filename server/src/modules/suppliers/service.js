import { Supplier } from '../../database/models.js';
import { STATUSES } from '../../database/definitions.js';
import { HttpError } from '../shared/errors.js';
import { recordId } from '../inventory/service.js';

export function supplierInput(body, creating = false) {
  const limits = { name: 150, contactName: 100, phone: 30, email: 254, address: 250 };
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length
    || Object.keys(body).some((key) => ![...Object.keys(limits), 'status'].includes(key))) {
    throw new HttpError(400, 'Supply only the documented supplier fields.');
  }
  if (creating && body.name === undefined) throw new HttpError(400, 'Supplier name is required.');
  const input = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'string' || body[field].trim().length > limit || (field === 'name' && !body[field].trim())) {
      throw new HttpError(400, `${field} must contain ${field === 'name' ? '1' : '0'}–${limit} characters.`);
    }
    input[field] = body[field].trim();
  }
  if (input.email) {
    input.email = input.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new HttpError(400, 'Enter a valid supplier email.');
  }
  if (input.phone && (!/^\+?[\d\s().-]+$/.test(input.phone) || !/^[0-9]{7,15}$/.test(input.phone.replace(/\D/g, '')))) {
    throw new HttpError(400, 'Enter a supplier phone with 7–15 digits and optional +, spaces, parentheses, dots or hyphens.');
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Supplier status must be ACTIVE or INACTIVE.');
    input.status = body.status;
  }
  return input;
}

export async function getSuppliers(query = {}) {
  if (Object.keys(query).some((key) => !['search', 'status'].includes(key))) throw new HttpError(400, 'Unsupported supplier filter.');
  const filter = {};
  if (query.status !== undefined && query.status !== 'ALL') {
    if (!STATUSES.includes(query.status)) throw new HttpError(400, 'Supplier status must be ACTIVE, INACTIVE or ALL.');
    filter.status = query.status;
  }
  if (query.search !== undefined) {
    if (typeof query.search !== 'string' || query.search.length > 100) throw new HttpError(400, 'Supplier search must be at most 100 characters.');
    const search = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = ['name', 'contactName', 'email', 'phone'].map((field) => ({ [field]: search }));
  }
  return Supplier.find(filter).sort({ name: 1, _id: 1 }).lean();
}

export async function updateSupplier(id, input) {
  // Purchase creation touches this same document in its transaction, so a
  // concurrent status/contact change cannot leave a half-validated selection.
  const supplier = await Supplier.findByIdAndUpdate(recordId(id, 'supplierId'), { $set: input, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true });
  if (!supplier) throw new HttpError(404, 'Supplier not found.');
  return supplier;
}
