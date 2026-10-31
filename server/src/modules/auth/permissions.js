import { HttpError } from '../shared/errors.js';

// SRS §13.1 permission matrix. Feature routes check these names, never role names,
// so a matrix change only touches this file. See docs/permissions.md.
export const PERMISSIONS = {
  ADMIN: [
    'users:view', 'users:manage',
    'products:view', 'products:create', 'products:update', 'products:deactivate',
    'inventory:view', 'inventory:adjust',
    'suppliers:view', 'suppliers:manage',
    'purchases:view', 'purchases:manage', 'purchases:receive',
    'sales:view', 'sales:create',
    'reports:inventory', 'reports:purchases', 'reports:sales',
  ],
  INVENTORY: [
    'products:view', 'products:create', 'products:update',
    'inventory:view', 'inventory:adjust',
    'suppliers:view', 'purchases:view', 'sales:view',
    'reports:inventory',
  ],
  PURCHASE: [
    'products:view', 'inventory:view',
    'suppliers:view', 'suppliers:manage',
    'purchases:view', 'purchases:manage', 'purchases:receive',
    'sales:view',
    'reports:purchases',
  ],
  SALES: [
    'products:view', 'inventory:view',
    'suppliers:view', 'purchases:view',
    'sales:view', 'sales:create',
    'reports:sales',
  ],
  // The SRS marks Manager inventory adjustment as "Policy"; it is denied until the team decides otherwise.
  MANAGER: [
    'users:view', 'products:view', 'inventory:view',
    'suppliers:view', 'purchases:view', 'sales:view',
    'reports:inventory', 'reports:purchases', 'reports:sales',
  ],
};

export const permissionsFor = (role) => PERMISSIONS[role] ?? [];
export const can = (user, permission) => permissionsFor(user?.role).includes(permission);

// Use after requireAuth. Responds 403 for operations outside the user's permissions (FR-AUTH-007, FR-AUTH-008).
export function requirePermission(permission) {
  if (!Object.values(PERMISSIONS).some((list) => list.includes(permission))) {
    throw new Error(`Unknown permission "${permission}".`);
  }
  return (req, _res, next) => {
    if (!can(req.user, permission)) throw new HttpError(403, 'You do not have permission to do this.');
    next();
  };
}
