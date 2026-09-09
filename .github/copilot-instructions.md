# GC Management App — AI Coding Instructions

> These instructions are for AI coding agents (Copilot, OpenCode, Cursor, etc.).
> Read this file before making ANY changes to the codebase.

## Project Context

This is an **existing production application**. It is live and serving real users.

- **Production URL:** `https://gc-management-app.onrender.com`
- **Custom domain:** `https://giftcardmanager.duckdns.org`
- **Git branch:** `deployment-test` (production branch)
- **Auto-deploys** from `deployment-test` to Render on push.

**Do not rebuild this application.** Do not create a new repository, service, or database.
Do not delete or modify production data. Do not expose secrets.

## Golden Rules

1. **Inspect existing code before changing it.** Read the relevant files first.
2. **Preserve existing functionality.** Do not rewrite working features.
3. **Do not rebuild working features** — improve, fix, or extend them.
4. **Do not create duplicate implementations.** One way to do each thing.
5. **Do not create new repositories, Render services, or MongoDB databases.**
6. **Do not delete production data.**
7. **Do not expose secrets** — not in code, logs, comments, or documentation.
8. **Do not commit credentials, tokens, or connection strings.**
9. **Test changes before finishing.** Run `npm run build` at minimum.
10. **Keep changes focused.** If the task is a CSS fix, do not touch the backend.

## Architecture

```
client/src/                  React frontend (Vite, React 18)
  ├── App.jsx                Routes + AuthProvider
  ├── context/AuthContext.jsx Auth state management
  ├── pages/Login.jsx        Login page
  ├── pages/AdminDashboard.jsx  Admin: Dashboard, Records, Users, Audit tabs
  ├── pages/UserDashboard.jsx   User: Dashboard + Records
  ├── utils/api.js           ApiClient class (fetch wrapper with JWT)
  └── utils/format.js        Date/currency/status formatting

server.js                    Express entry point, MongoDB connection
models/                      Mongoose models
  ├── User.js                User model (admin/user roles)
  ├── GCRecord.js            Gift card record model
  └── AuditLog.js            Audit log model
routes/                      Express route handlers
  ├── auth.js                Login, /me, change-password
  ├── users.js               User CRUD (admin only)
  ├── gcRecords.js           GC record CRUD + pay + bulk-pay + undo-pay
  ├── stats.js               Aggregated statistics
  ├── audit.js               Audit log listing (admin only)
  └── export.js              CSV + Excel export (admin only)
middleware/auth.js           JWT auth, adminOnly, userOnly
utils/audit.js               logAction helper
scripts/init-admin.js        Create initial admin account
```

**Key files that contain most logic:**
- `server.js` — Server setup, middleware, MongoDB connection
- `routes/gcRecords.js` — GC record CRUD, duplicate validation, payment actions
- `routes/users.js` — User management
- `client/src/pages/AdminDashboard.jsx` — All admin UI (945 lines, single file)
- `client/src/pages/UserDashboard.jsx` — All user UI (322 lines, single file)
- `client/src/index.css` — All styles (single CSS file, ~34KB)

## Authentication Rules

- JWT tokens expire after **7 days**.
- Token is stored in `localStorage` (key: `token`).
- Sent as `Authorization: Bearer <token>` header.
- On 401 (non-login), frontend clears auth and redirects to `/login`.
- Passwords hashed with bcrypt (12 rounds). Never stored in plain text.
- The `User` model `toJSON()` strips the password field from all responses.

### Role-Based Access
- **Admin** — Access to all routes, all users, all records.
- **User** — Access only to own GC records and own stats.
- `adminOnly` middleware blocks non-admin users.
- `userOnly` middleware blocks non-user users.
- Ownership checks in GC routes: `record.user === req.userId`.

## Data Ownership Rules

> **CRITICAL:** A USER must only access their own GC records.

- `GET /api/gc-records` — User sees only their records (`filter.user = req.userId`).
- `GET /api/gc-records/:id` — User gets 403 if record belongs to another user.
- `PUT /api/gc-records/:id` — User gets 403 if record belongs to another user.
- `DELETE /api/gc-records/:id` — User gets 403 if record belongs to another user.
- Admin can access all records. No ownership restriction for admin.

**Do not weaken ownership checks.** Do not allow users to access other users' data.

## GC Record Rules

### Required Fields
- `giftCard` (string) — Gift card number
- `giftCardPin` (string) — Gift card PIN
- `giftCardAmount` (number) — Total gift card value
- `paid` (number) — Amount paid to the user

### Validation
- `paid` cannot exceed `giftCardAmount`.
- Both amounts must be non-negative.
- Duplicate GC + PIN is rejected with HTTP 409 and code `DUPLICATE_GC_PIN`.

### Duplicate Gift Card + PIN Rule

> **SAME USER + SAME GIFT CARD + SAME PIN = DUPLICATE → REJECTED**

- The uniqueness constraint is scoped **per user**.
- Different users **may** have the same gift card + PIN combination.
- Enforced by:
  1. **Application-level:** `findOne()` check before create/update.
  2. **Database-level:** Compound unique index `{ user: 1, giftCard: 1, giftCardPin: 1 }`.

### Edit Must Not Reject Against Itself
When editing a record, the duplicate check must exclude the current record:
```js
const existing = await GCRecord.findOne({
  _id: { $ne: record._id },  // EXCLUDE self
  user: record.user,
  giftCard: finalGiftCard,
  giftCardPin: finalGiftCardPin
});
```

### Payment Status
- `pending` (default) — Not yet paid back.
- `paid_back` — Admin has marked this as paid.
- Only Admin can change payment status.
- Undo: `paid_back` → `pending`, clears `paidBackAt`.

### Bulk Pay
- `POST /api/gc-records/bulk-pay` with `{ recordIds: [...] }`.
- Processes sequentially. Skips already-paid records.
- Returns `{ success: [...], failed: [...], skipped: N }`.

## Sensitive Data

### NEVER expose, log, or store in documentation:
- Gift Card PINs (`giftCardPin`)
- Passwords
- JWT secrets
- API tokens (GitHub, Render)
- MongoDB connection strings
- Environment variable values

### Where NOT to place secrets:
- Source code (use environment variables)
- README or documentation files
- Console logs
- Audit log metadata
- Error responses to clients
- Git commits

### Audit Log Sensitive Data Handling
- On record edit, `giftCardPin` is removed from metadata before logging.
- The audit UI calls `redactSensitive()` which filters keys matching `/pin|password|secret|token|mongodb|apikey|api_key/i`.

## Frontend Guidelines

### File Organization
- **One CSS file:** `client/src/index.css` — All styles live here.
- **Three pages:** `Login.jsx`, `AdminDashboard.jsx`, `UserDashboard.jsx`.
- **Two utilities:** `api.js` (API client), `format.js` (formatting helpers).
- **One context:** `AuthContext.jsx` (auth state).

### API Calls
- Use the `api` object from `../utils/api`.
- Methods: `api.get(path)`, `api.post(path, body)`, `api.put(path, body)`, `api.delete(path)`.
- For file downloads: `api.downloadFile(path)` returns a `Response` object.
- In development, API calls go to `http://localhost:5000`. In production, same origin.

### Authentication State
- Access via `useAuth()` hook from `AuthContext`.
- Returns: `{ user, login, logout, loading, isAdmin, isUser }`.
- `user` object has: `{ id, name, email, role }`.

### Admin/User Separation
- Admin UI: `AdminDashboard.jsx` with tabs (Dashboard, Records, Users, Audit).
- User UI: `UserDashboard.jsx` (dashboard + records only).
- Routing enforced by `ProtectedRoute` component in `App.jsx`.
- Admin at `/admin/*`, User at `/user`.

### CSS Conventions
- CSS custom properties for colors (defined in `:root`).
- Utility classes: `.text-muted`, `.text-xs`, `.text-center`, `.text-nowrap`.
- Color classes: `.text-success`, `.text-warning`, `.text-primary`, `.text-danger`.
- Component classes: `.btn`, `.btn-primary`, `.btn-outline`, `.btn-danger`, `.btn-success`, `.btn-sm`.
- Form classes: `.form-group`, `.form-label`, `.form-input`, `.form-select`, `.form-textarea`.
- Layout: `.app`, `.header`, `.main-content`, `.card`, `.modal-overlay`, `.modal`.

### Responsive Design
- Desktop: `.table-container` with `<table>` elements.
- Mobile: `.mobile-view` with card-based layouts.
- **Every table must have a corresponding mobile card view.**
- Toggle visibility: `.table-container` hidden on mobile, `.mobile-view` hidden on desktop.

## UI Guidelines

- Preserve the existing design system.
- Do not introduce new CSS frameworks or component libraries.
- Keep Admin and User UI visually consistent.
- Buttons: `.btn-primary` for primary actions, `.btn-outline` for secondary, `.btn-danger` for destructive, `.btn-success` for payment actions.
- Status badges: `.badge-pending`, `.badge-paid`, `.badge-active`, `.badge-disabled`.
- Modals use `.modal-overlay` > `.modal` pattern.
- Toast notifications via `react-hot-toast` (`toast.success()`, `toast.error()`).
- Empty states use `.empty-state` with icon + text.
- Loading states use `.loading` > `.spinner`.

## Responsive Requirements

Test at these viewport sizes:
```
360x800   (small mobile)
375x812   (iPhone standard)
390x844   (iPhone Pro)
414x896   (large mobile)
768x1024  (tablet)
1024x768  (small desktop)
1280x800  (laptop)
1366x768  (common laptop)
1440x900  (desktop)
1536x864  (high-DPI laptop)
1920x1080 (full HD)
```

## API Guidelines

- Inspect existing routes before adding new ones.
- Reuse existing API patterns (error responses, pagination, filtering).
- All protected routes use `auth` middleware.
- Admin routes use `adminOnly` middleware after `auth`.
- Error responses: `{ error: "message" }` with appropriate HTTP status.
- Pagination: `{ records: [...], pagination: { total, page, pages, limit } }`.
- Do not bypass RBAC. Do not add unauthenticated endpoints (except `/api/health` and `/api/auth/login`).

### Rate Limiting
- General API: 200 requests per 15 minutes per IP.
- Auth endpoints: 20 requests per 15 minutes per IP.
- Behind Render proxy, `trust proxy` is enabled in production.

## Database Guidelines

- Use Mongoose for all database operations.
- Models are in `models/` directory.
- Indexes are defined in model schemas.
- The `GCRecord` model has a **compound unique index** on `{ user, giftCard, giftCardPin }`.
- **Do not drop or recreate indexes casually.**
- Handle MongoDB error code `11000` (duplicate key) gracefully.
- Do not run destructive migrations without explicit user request.
- Do not reset the production database.
- The database name is `gc_management`.

## Testing Requirements

After making changes, test:

### Authentication
- Login with valid credentials (admin and user).
- Login with invalid credentials (should fail).
- Login with disabled account (should get 403).
- Token expiry / invalid token handling.

### Authorization
- Admin can access `/api/users`, `/api/audit`, `/api/export/*`.
- User cannot access admin-only endpoints (should get 403).
- User cannot access other users' records (should get 403).

### GC Records
- Create record with valid data.
- Create record with duplicate GC + PIN for same user (should get 409).
- Create record with same GC + PIN for different user (should succeed).
- Edit record (should not reject against itself).
- Delete record.
- Mark as paid back / undo payment.
- Bulk pay with mixed status records.

### Statistics
- User stats reflect own records only.
- Admin stats reflect all records.
- Per-user breakdown is accurate.

### Audit Logs
- Actions are logged correctly.
- Sensitive data is not in metadata.

### Responsive
- Test at 375px width (mobile).
- Test at 1440px width (desktop).
- Verify tables have mobile card equivalents.

### Build
- Run `npm run build` — must succeed with no errors.

## Deployment Guidelines

- **Branch:** `deployment-test` is the production branch.
- **Render auto-deploys** from `deployment-test` on push.
- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- Do not create another Render service.
- Do not create another repository.
- Do not replace production infrastructure.
- Verify build passes before pushing.

## Git Guidelines

Before committing:
```bash
git status          # See what changed
git diff            # Review all changes
npm run build       # Verify frontend builds
```

- Use meaningful commit messages.
- Do not commit `.env`, credentials, tokens, or temporary files.
- Do not commit `node_modules/`, `client/dist/`, or build artifacts.

## Change Discipline

- If the user asks for a CSS fix, do not rewrite the backend.
- If the user asks for a backend validation fix, do not redesign the frontend.
- Make the **smallest safe change** that fully solves the issue.
- If unsure about the scope, ask for clarification.

## Completion Criteria

An AI agent should NOT claim completion until:
1. The implementation is done.
2. `npm run build` passes.
3. No obvious regression exists.
4. The `git diff` has been reviewed.
5. Sensitive data (PINs, secrets) is not exposed in any changed file.

## Do Not Assume

- Do not assume the previous conversation exists.
- The repository documentation (README.md and this file) is the source of project context.
- Before modifying an existing feature, inspect its implementation.
- Do not invent APIs, models, environment variables, or infrastructure.
- Do not claim something was tested if it was not actually tested.
- Do not stop after making a superficial change.
