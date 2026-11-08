# Suppliers and purchase receipts — #15 and #16

Stories #15 (3 points) and #16 (5 points) belong to AtharvMitt under Epic #3 in Sprint 2. The GitHub issue checklists and submitted SRS are the acceptance baseline. This extends the existing MERN modules and the stock service from #11.

## Supplier management — #15

SRS FR-PUR-001/002, BR-004/009/010, §§13.1/14.3 and UC-05 require supplier creation, editing, viewing and deactivation. The supplier has a required name (1–150 characters), optional contactName (100), phone (30), email (254), address (250), and ACTIVE/INACTIVE status. Optional fields accept an empty string to clear a contact. Phone validation accepts 7–15 digits with an optional leading + and conventional separators; email validation rejects malformed addresses. Supplier names need not be unique in the SRS.

Migration `004-suppliers` creates the validated collection and status/name index. Run `npm run db:setup` to upgrade an existing database; no existing records are deleted and migrations 001–003 are unchanged.

All supplier routes require authentication. `GET /api/suppliers` and `GET /api/suppliers/:id` require `suppliers:view` (all five roles). List filters: literal, case-insensitive `search` over name/contact/email/phone, and `status=ALL|ACTIVE|INACTIVE`. Unknown or malformed filters return 400; no matches return an empty array.

`POST /api/suppliers`, `PATCH /api/suppliers/:id`, and `DELETE /api/suppliers/:id` require `suppliers:manage` (Admin/Purchase). DELETE deactivates rather than physically deleting the supplier. PATCH accepts the contact fields and status, including reactivation. Supplier IDs remain stable when details change. Invalid fields return 400, missing records 404, unauthenticated requests 401, and unauthorized roles 403.

The React Suppliers section offers creation/editing, active/inactive status, contact details, deactivation, filters and refresh. View-only roles receive the table and filters without mutation controls. Successful writes notify the dependent purchase selector; a failed read after a successful write explicitly tells the user the write was saved.

Supplier selection and preservation of historical purchase snapshots are integrated under companion story #16 in this feature branch. Tests: `server/tests/suppliers.test.js` and `client/tests/suppliers-ui.test.js`.
