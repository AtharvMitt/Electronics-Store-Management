# Role permissions — issue #7

`server/src/modules/auth/permissions.js` turns the SRS §13.1 permission matrix into named permissions. Feature routes check a permission, never a role name:

```js
import { requireAuth } from '../auth/sessions.js';
import { requirePermission } from '../auth/permissions.js';

router.post('/', requireAuth, requirePermission('products:create'), createProduct);
```

`requireAuth` returns 401 when nobody is logged in. `requirePermission` returns 403 `You do not have permission to do this.` for operations outside the user's permissions (FR-AUTH-007, FR-AUTH-008). Misspelled permission names throw when the route is defined, so a typo can't silently open or close a route. Roles are read from the database on every request, so a role change applies immediately.

The client receives the same list as `user.permissions` from `/api/auth/me` and uses it only to hide actions. The server check is what enforces access (SEC-003, SEC-004).

## Matrix

| Permission | Admin | Inventory | Purchase | Sales | Manager | SRS §13.1 row |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| `users:view` | ✓ | | | | ✓ | User/Role Management |
| `users:manage` | ✓ | | | | | User/Role Management (C/U/D) |
| `products:view` | ✓ | ✓ | ✓ | ✓ | ✓ | Product/Category |
| `products:create`, `products:update` | ✓ | ✓ | | | | Product/Category (C/U) |
| `products:deactivate` | ✓ | | | | | Product/Category (D) |
| `inventory:view` | ✓ | ✓ | ✓ | ✓ | ✓ | Inventory View |
| `inventory:adjust` | ✓ | ✓ | | | — | Inventory Adjustment |
| `suppliers:view` | ✓ | ✓ | ✓ | ✓ | ✓ | Supplier Management |
| `suppliers:manage` | ✓ | | ✓ | | | Supplier Management (C/U/D) |
| `purchases:view` | ✓ | ✓ | ✓ | ✓ | ✓ | Purchase Orders |
| `purchases:manage`, `purchases:receive` | ✓ | | ✓ | | | Purchase Orders (C/U/Receive) |
| `sales:view` | ✓ | ✓ | ✓ | ✓ | ✓ | Sales |
| `sales:create` | ✓ | | | ✓ | | Sales (Create) |
| `reports:inventory` | ✓ | ✓ | | | ✓ | Reports |
| `reports:purchases` | ✓ | | ✓ | | ✓ | Reports |
| `reports:sales` | ✓ | | | ✓ | ✓ | Reports |

**Open decision:** the SRS lists Manager inventory adjustment as "Policy" without defining it. Manager is denied `inventory:adjust` until the team agrees otherwise; changing it means editing one line and its test.

Changing the matrix means updating `permissions.js`, this table, and the matrix test in `server/tests/permissions.test.js` together.
