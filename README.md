# GC Management App

## Overview

GC Management App is a Gift Card Management System built with Node.js/Express backend and React/Vite frontend. It allows an administrator to manage multiple users who submit gift card (GC) records for tracking and payment reconciliation.

**Roles:**
- **Admin** — Full access to all users, all records, statistics, audit logs, and exports.
- **User** — Can submit their own GC records, view own data, and see own statistics.

**High-level workflow:**
1. Admin creates user accounts.
2. Users log in and submit gift card records (gift card number, PIN, amount, amount paid).
3. Admin reviews records across all users, marks records as paid back, and exports data.
4. All significant actions are recorded in audit logs.

**Production URLs:**
- Render: `https://gc-management-app.onrender.com`
- Custom domain: `https://giftcardmanager.duckdns.org`

---

## Features

### Authentication
- Email + password login for Admin and User roles.
- JWT-based authentication with 7-day token expiry.
- Token stored in `localStorage` and sent via `Authorization: Bearer <token>` header.
- Failed login attempts and successful logins are recorded in audit logs.
- Disabled accounts are blocked at login with a 403 response.
- Self-service password change (requires current password).

### Admin
- **Dashboard** — Overall statistics with per-user breakdown. Filterable by user and date range.
- **Records** — View, create, edit, delete, and mark records as paid back. Supports bulk selection and bulk "Mark as Paid Back". Searchable and filterable by status, user, and date range. Undo payment status.
- **Users** — Create, edit, disable/enable, reset password, and delete users. Each user card shows their GC statistics.
- **Audit** — View paginated audit history with action filtering. Sensitive fields (PINs, passwords) are redacted in the UI.
- **Exports** — Download GC records as CSV or Excel (.xlsx), respecting current filters.

### User
- **Dashboard** — Personal statistics (total cards, total amount, paid, pending, paid back).
- **Records** — Submit new GC records, edit, delete, and view own records. Searchable with status and date filters.
- **No payment actions** — Users cannot mark records as paid; only Admin can.

### GC Validation
- **Duplicate rule (per user):** For the same user, the combination of `giftCard` + `giftCardPin` must be unique. This is enforced both:
  - **Server-side** — Explicit `findOne()` check before create/update.
  - **Database-side** — Compound unique index `{ user: 1, giftCard: 1, giftCardPin: 1 }` on `GCRecord` collection.
- Different users may have the same gift card + PIN combination.
- Edit operations exclude the current record (`_id: { $ne: record._id }`) when checking for duplicates.

### Audit Logging
The following actions are logged to the `AuditLog` collection:
- `user_created`, `user_edited`, `user_deleted`, `user_disabled`, `user_enabled`, `password_reset`
- `record_created`, `record_edited`, `record_deleted`, `record_paid_back`, `bulk_paid_back`
- `login_success`, `login_failed`

**Sensitive data is never logged:**
- Gift Card PINs are excluded from audit metadata on edits.
- The audit UI redacts any keys matching `pin`, `password`, `secret`, `token`, `mongodb`, `apikey`, `api_key`.

---

## Architecture

```
Browser (React SPA)
  │
  ├── Vite dev server (proxy /api → :5000)
  │
  └── Production: Express serves built static files
        │
  Express API (/api/*)
        │
  ├── Auth middleware (JWT verification)
  ├── RBAC middleware (adminOnly / userOnly)
  ├── Rate limiting (general + auth-specific)
  ├── CORS (whitelist of origins)
  │
  └── MongoDB (Mongoose ODM)
        ├── User
        ├── GCRecord
        └── AuditLog
```

**Key technologies:**
- **Backend:** Node.js >= 18, Express 4, Mongoose 8, JWT (jsonwebtoken), bcryptjs
- **Frontend:** React 18, React Router 6, Vite 5, react-hot-toast, lucide-react
- **Database:** MongoDB (via Mongoose), database name: `gc_management`
- **Exports:** CSV (built-in), Excel via `xlsx` library
- **Testing:** Playwright (dev dependency)

---

## Project Structure

```
gc-management-app/
├── client/                     # React frontend (Vite)
│   ├── index.html              # HTML entry point
│   ├── dist/                   # Built frontend (production)
│   └── src/
│       ├── main.jsx            # React entry point
│       ├── App.jsx             # Routes + AuthProvider wrapper
│       ├── index.css           # All CSS (single file, ~34KB)
│       ├── context/
│       │   └── AuthContext.jsx # Auth state, login/logout, role helpers
│       ├── pages/
│       │   ├── Login.jsx       # Login page
│       │   ├── AdminDashboard.jsx  # Admin tabs: Dashboard, Records, Users, Audit
│       │   └── UserDashboard.jsx   # User dashboard + records
│       └── utils/
│           ├── api.js          # ApiClient class (fetch wrapper with JWT)
│           └── format.js       # Date/currency/status formatting utilities
├── models/
│   ├── User.js                 # User model (name, email, hashed password, role, active)
│   ├── GCRecord.js             # Gift card record model
│   └── AuditLog.js             # Audit log model
├── routes/
│   ├── auth.js                 # POST /login, GET /me, POST /change-password
│   ├── users.js                # CRUD users (admin only)
│   ├── gcRecords.js            # CRUD records + pay + bulk-pay + undo-pay
│   ├── stats.js                # GET /user, GET /admin (aggregated stats)
│   ├── audit.js                # GET audit logs (admin only)
│   └── export.js               # GET /csv, GET /excel (admin only)
├── middleware/
│   └── auth.js                 # JWT auth, adminOnly, userOnly middleware
├── utils/
│   └── audit.js                # logAction helper for AuditLog
├── scripts/
│   └── init-admin.js           # Script to create initial admin account
├── server.js                   # Express server, MongoDB connection, route mounting
├── package.json                # Dependencies and scripts
├── vite.config.js              # Vite config (root: client, proxy to :5000)
└── .gitignore
```

---

## Frontend

### Structure
- Single-page app with React Router.
- `AuthProvider` wraps the entire app, managing auth state via `localStorage`.
- Three pages: `Login`, `AdminDashboard`, `UserDashboard`.
- Admin dashboard uses tabs (Dashboard, Records, Users, Audit) within a single component.
- All CSS is in a single `client/src/index.css` file.

### API Calls
- All API calls go through `client/src/utils/api.js` — a custom `ApiClient` class.
- The client reads the JWT token from `localStorage` and attaches it as `Authorization: Bearer <token>`.
- In development, the base URL is `http://localhost:5000`. In production, it is empty (same origin).
- On 401 responses (except login), the client clears auth state and redirects to `/login`.
- File downloads use `api.downloadFile()` which returns a raw `Response` for blob handling.

### Formatting Utilities
- `formatCurrency(amount)` — Formats as INR currency (₹).
- `formatDate(date)` — DD Mon YYYY format.
- `formatDateTime(date)` — DD Mon YYYY, HH:MM AM/PM format.
- `getStatusColor(status)` / `getStatusLabel(status)` — Map `pending`/`paid_back` to CSS classes and labels.

### Authentication State
- On mount, `AuthContext` reads `token` and `user` from `localStorage`.
- `login()` calls the API, stores token + user, sets state.
- `logout()` clears localStorage and state.
- `isAdmin` / `isUser` are derived from `user.role`.

### Admin/User UI Separation
- `ProtectedRoute` component enforces role-based routing.
- Admin at `/admin/*`, User at `/user`. Redirect based on role on login.
- Admin header has tabs; User header does not.
- Users never see payment action buttons.

### CSS Architecture
- Single CSS file: `client/src/index.css` (~34KB).
- CSS custom properties (variables) for colors and spacing.
- Responsive design with mobile-specific classes (`.mobile-view`, `.mobile-record`, etc.).
- Desktop tables have mobile card equivalents.

---

## Backend

### Express Server (`server.js`)
- Listens on `process.env.PORT` (default 5000).
- In production: serves static files from `client/dist/` and handles SPA routing with `*` fallback.
- Trusts proxy in production for correct rate limiting behind Render.

### Middleware Stack
1. **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`.
2. **Rate limiting** — General: 200 req/15min on `/api/*`. Auth: 20 req/15min on `/api/auth/*`.
3. **Compression** — gzip responses.
4. **Body parsing** — JSON with 10MB limit.
5. **Cookie parser** — For optional cookie-based token.
6. **CORS** — Whitelist: `localhost:5173`, `localhost:3000`, `gc-management-app.onrender.com`, `giftcardmanager.duckdns.org`. Credentials enabled.

### API Routes

| Route Group | Auth Required | Admin Only | Description |
|---|---|---|---|
| `POST /api/auth/login` | No | No | Login, returns JWT |
| `GET /api/auth/me` | Yes | No | Current user info |
| `POST /api/auth/change-password` | Yes | No | Self password change |
| `GET /api/users` | Yes | Yes | List users with stats |
| `POST /api/users` | Yes | Yes | Create user |
| `PUT /api/users/:id` | Yes | Yes | Update user |
| `POST /api/users/:id/reset-password` | Yes | Yes | Reset user password |
| `DELETE /api/users/:id` | Yes | Yes | Delete user + their records |
| `GET /api/gc-records` | Yes | No* | List records (user sees own; admin sees all) |
| `GET /api/gc-records/:id` | Yes | No* | Single record (ownership enforced for users) |
| `POST /api/gc-records` | Yes | No | Create record (admin can assign to user) |
| `PUT /api/gc-records/:id` | Yes | No* | Update record (ownership enforced for users) |
| `DELETE /api/gc-records/:id` | Yes | No* | Delete record (ownership enforced for users) |
| `POST /api/gc-records/:id/pay` | Yes | Yes | Mark single record as paid back |
| `POST /api/gc-records/bulk-pay` | Yes | Yes | Bulk mark records as paid back |
| `POST /api/gc-records/:id/undo-pay` | Yes | Yes | Revert paid_back → pending |
| `GET /api/stats/user` | Yes | No (userOnly) | User's own aggregated stats |
| `GET /api/stats/admin` | Yes | Yes | Admin aggregated stats with per-user breakdown |
| `GET /api/audit` | Yes | Yes | Paginated audit logs |
| `GET /api/export/csv` | Yes | Yes | CSV export of filtered records |
| `GET /api/export/excel` | Yes | Yes | Excel export of filtered records |
| `GET /api/health` | No | No | Health check |

\* User role restriction is enforced in route handler logic, not middleware.

### Validation
- Required fields checked manually in route handlers (not a separate validation library).
- `paid` cannot exceed `giftCardAmount`.
- Amounts must be non-negative.
- Passwords must be at least 6 characters.
- Duplicate GC + PIN checked before create and update.

### Error Handling
- Global error handler catches unhandled errors and returns 500.
- Validation errors return 400 with descriptive messages.
- Duplicate key errors (MongoDB error code 11000) return 409 with `DUPLICATE_GC_PIN` code.
- Auth failures return 401/403 with appropriate messages.

---

## Database

### User Model (`models/User.js`)
| Field | Type | Details |
|---|---|---|
| `name` | String | Required, trimmed, max 100 chars |
| `email` | String | Required, unique, lowercase, trimmed, validated regex |
| `password` | String | Required, min 6 chars, hashed with bcrypt (12 rounds) on save |
| `role` | String | `admin` or `user`, default `user` |
| `active` | Boolean | Default `true`. Disabled accounts cannot log in |
| `lastLogin` | Date | Updated on successful login |
| `createdAt`/`updatedAt` | Date | Auto via `timestamps: true` |

**Indexes:** `{ role: 1 }`, `{ active: 1 }`

**Password handling:**
- Hashed automatically via Mongoose `pre('save')` hook.
- `comparePassword()` method for login verification.
- `toJSON()` strips the `password` field from output.

### GCRecord Model (`models/GCRecord.js`)
| Field | Type | Details |
|---|---|---|
| `user` | ObjectId (ref: User) | Required. The user who owns this record |
| `giftCard` | String | Required, trimmed |
| `giftCardPin` | String | Required, trimmed |
| `giftCardAmount` | Number | Required, min 0 |
| `paid` | Number | Required, min 0. Amount paid to the user |
| `paymentStatus` | String | `pending` (default) or `paid_back` |
| `paidBackAt` | Date | Set when status changes to `paid_back` |
| `notes` | String | Optional, max 500 chars |
| `adminNote` | String | Optional, max 500 chars. Admin-only field |
| `createdAt`/`updatedAt` | Date | Auto via `timestamps: true` |

**Indexes:**
- `{ user: 1 }`
- `{ paymentStatus: 1 }`
- `{ createdAt: -1 }`
- `{ user: 1, paymentStatus: 1 }`
- `{ user: 1, createdAt: -1 }`
- `{ user: 1, giftCard: 1, giftCardPin: 1 }` — **UNIQUE** (enforces duplicate rule per user)

### AuditLog Model (`models/AuditLog.js`)
| Field | Type | Details |
|---|---|---|
| `action` | String | Enum of 13 action types |
| `performedBy` | ObjectId (ref: User) | Required |
| `targetType` | String | `user` or `record` |
| `targetId` | ObjectId | Required |
| `metadata` | Mixed | Additional context (varies by action) |
| `ipAddress` | String | Client IP |
| `createdAt`/`updatedAt` | Date | Auto via `timestamps: true` |

**Indexes:** `{ performedBy: 1 }`, `{ action: 1 }`, `{ targetType: 1, targetId: 1 }`, `{ createdAt: -1 }`

---

## Authentication & Authorization

### Authentication Flow
1. User submits email + password to `POST /api/auth/login`.
2. Server validates credentials via `bcrypt.compare()`.
3. If valid, server creates JWT with `{ userId, role }` payload, 7-day expiry.
4. Token returned in JSON response; frontend stores in `localStorage`.
5. Subsequent requests include `Authorization: Bearer <token>` header.

### Authorization Rules
- **`auth` middleware** — Verifies JWT, loads user, checks `active` status.
- **`adminOnly` middleware** — Requires `user.role === 'admin'`. Returns 403 otherwise.
- **`userOnly` middleware** — Requires `user.role === 'user'`. Returns 403 otherwise.
- **Ownership checks** — In GC record routes, users can only access their own records (`record.user === req.userId`). Admin bypasses ownership.
- **Admin protection** — Admin users cannot be modified or deleted by other admins via the user management API.

### Password Security
- Hashed with bcrypt, 12 salt rounds.
- Stored password is never returned in API responses (stripped by `toJSON()`).
- Self-service password change requires current password verification.
- Admin can reset any user's password without knowing the current one.

---

## Environment Variables

| Variable | Purpose | Notes |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | Required. Database: `gc_management` |
| `JWT_SECRET` | Secret for signing JWT tokens | Has insecure fallback in code; set in production |
| `ADMIN_EMAIL` | Default admin email | Has fallback in code. Set in production. |
| `ADMIN_PASSWORD` | Default admin password | Has fallback in code. **Change in production.** |
| `ADMIN_NAME` | Default admin display name | Has fallback in code. |
| `PORT` | Server port | Default: 5000 |
| `NODE_ENV` | Environment mode | Set to `production` on Render |
| `RATE_LIMIT_MAX` | General rate limit per 15min | Default: 200 |
| `AUTH_RATE_LIMIT_MAX` | Auth rate limit per 15min | Default: 20 |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | Default includes localhost + production URLs |
| `GITHUB_TOKEN` | GitHub personal access token | For repository access |
| `GITHUB_USERNAME` | GitHub username | For repository identification |
| `RENDER_API_KEY` | Render deployment API key | For deployment management |

**NEVER commit actual secret values to the repository.** Configure these through your deployment platform (Render Dashboard) or `.env` file (local development only, gitignored).

---

## Local Development

### Prerequisites
- Node.js >= 18
- MongoDB instance (local or Atlas)

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd gc-management-app

# Install backend + frontend dependencies
npm install

# Set environment variables (create .env file)
# Required: MONGODB_URI, JWT_SECRET
# Optional: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, PORT

# Start the development server
# Backend runs on :5000, Vite dev server on :5173 with proxy
npm start          # Starts Express on :5000
# In a separate terminal, for frontend hot reload:
npx vite --config vite.config.js
```

### Build & Production

```bash
# Build the frontend
npm run build      # Outputs to client/dist/

# Start production server (serves API + static frontend)
NODE_ENV=production npm start
```

### Initialize Admin

```bash
# Create or verify the admin account
npm run init-admin
```

---

## Testing

### Playwright (E2E)
Playwright is a dev dependency. Test files exist in the project root as `*.mjs` scripts:
- `test-e2e.mjs` — End-to-end flow tests
- `verify-production.mjs` — Production environment verification
- `verify-fixes.mjs` — Regression verification
- `verify-mobile.mjs` — Mobile viewport testing
- `visual-audit.mjs` — Visual UI audit
- `comprehensive-audit.mjs` — Comprehensive testing
- `test-custom-domain.mjs` — Custom domain verification
- `measure-audit.mjs` — Performance/audit measurement
- `final-screenshots.mjs` — Screenshot capture

### Important Test Cases
- Login/logout flow for Admin and User.
- Admin can view all records; User can only view own records.
- GC record creation with duplicate GC + PIN rejection.
- GC record edit does not reject against itself (same record ID excluded from duplicate check).
- Payment status: single pay, bulk pay, undo pay.
- User management: create, edit, disable, enable, reset password, delete.
- Audit log generation for all tracked actions.
- Responsive layout at mobile and desktop viewports.
- Export CSV and Excel downloads.

### Recommended Viewports for Responsive Testing
```
Mobile:     360x800, 375x812, 390x844, 414x896
Tablet:     768x1024
Desktop:    1024x768, 1280x800, 1366x768, 1440x900, 1536x864, 1920x1080
```

---

## Deployment

### Infrastructure
```
GitHub (deployment-test branch)
  ↓ (auto-deploy on push)
Render (Node.js service)
  ↓
Express server serves API + static React frontend
  ↓
MongoDB Atlas (gc_management database)
```

### Render Configuration
- **Branch:** `deployment-test`
- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Node version:** >= 18
- **Auto-deploy:** Enabled from `deployment-test` branch

### Build Process
1. `npm install` installs backend + frontend dependencies.
2. `npm run build` runs `vite build` (root: `client/`, output: `client/dist/`).
3. `npm start` runs `node server.js`, which serves API routes and static frontend.

### Custom Domain
- **Custom domain:** `https://giftcardmanager.duckdns.org`
- **Render hostname:** `https://gc-management-app.onrender.com`
- The custom domain is a CNAME pointing to the Render service.
- Both domains are in the CORS `ALLOWED_ORIGINS` list.

---

## Security

### Measures Implemented
- **Password hashing** — bcrypt with 12 salt rounds.
- **JWT authentication** — 7-day expiry, verified on every protected request.
- **RBAC** — Admin-only middleware on sensitive routes.
- **Ownership checks** — Users can only access their own GC records.
- **Rate limiting** — 200 req/15min general, 20 req/15min for auth endpoints.
- **CORS** — Whitelist of specific origins. Credentials enabled.
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Input validation** — Required fields, non-negative amounts, paid ≤ amount, min password length.
- **Password stripping** — User model `toJSON()` removes password from all responses.
- **Audit logging** — All significant actions logged with user, target, and metadata.
- **Sensitive data redaction** — Audit UI filters out PIN/password-like keys from metadata display.
- **Gift Card PIN handling** — PINs are never exposed in audit log metadata on edits. Audit log records exclude `giftCardPin` from change details.

### Security Rules for Developers
- Never commit `.env`, tokens, API keys, or connection strings.
- Never log or expose Gift Card PINs in error responses or audit metadata.
- Never weaken ownership checks on GC records.
- Never bypass RBAC middleware.
- Keep CORS whitelist accurate — do not add `*` as an allowed origin.

---

## Important Business Rules

1. **Two roles:** Admin and User. No other roles exist.
2. **Users cannot access other users' records.** Ownership is enforced at the route level (`record.user === req.userId`).
3. **Admin can manage all users and all records.** Admin can create records on behalf of any user.
4. **Admin cannot modify or delete the admin user** via the user management API.
5. **Payment status** is `pending` or `paid_back`. Only Admin can change it.
6. **Bulk Mark as Paid** processes records sequentially, skips already-paid records, returns success/failed counts.
7. **Undo payment** reverts `paid_back` → `pending` and clears `paidBackAt`.
8. **GC + PIN uniqueness is scoped per user.** Same combination is rejected only for the same user. Different users may have identical combinations.
9. **Edit must not reject against itself.** When editing a record, the duplicate check excludes the current record's `_id`.
10. **Paid cannot exceed Gift Card Amount.** Enforced on create and update.
11. **Deleting a user deletes all their GC records** (cascade delete).
12. **Default admin is auto-created** on server startup if no admin exists.

---

## Troubleshooting

### MongoDB Connection Failure
- Verify `MONGODB_URI` is set correctly in your environment.
- Check that the MongoDB Atlas IP allowlist includes your server's IP.
- Verify network connectivity and DNS resolution.

### Authentication Failure
- Ensure `JWT_SECRET` is set. The code has a fallback, but it should not be used in production.
- Check that the token is being sent in the `Authorization` header.
- Tokens expire after 7 days.

### CORS Errors
- Verify the request origin is in `ALLOWED_ORIGINS`.
- Default allowed origins: `localhost:5173`, `localhost:3000`, `gc-management-app.onrender.com`, `giftcardmanager.duckdns.org`.
- CORS errors on Render may indicate the custom domain is not in the allowed list.

### Render Deployment Failure
- Verify build command: `npm install && npm run build`.
- Verify start command: `npm start`.
- Check Render build logs for npm or Vite errors.
- Ensure `MONGODB_URI` is set in Render environment variables.

### Frontend Build Failure
- Run `npm run build` locally to reproduce.
- Check for JSX syntax errors or missing imports.
- Ensure all dependencies are in `package.json`.

### API Unavailable
- In development, Vite proxies `/api` to `localhost:5000`. Ensure the Express server is running.
- In production, the Express server serves both API and static files. Check Render logs.

### Custom Domain Issues
- Verify DNS CNAME record points `giftcardmanager.duckdns.org` to `gc-management-app.onrender.com`.
- DNS propagation may take time.
- SSL certificate provisioning on Render may take a few minutes after domain verification.

### Date Input/Display Issues
- Date inputs use HTML5 `type="date"` which renders a native picker.
- Dates are displayed in `DD Mon YYYY` format (e.g., `09 Sep 2026`).
- Date-time uses `DD Mon YYYY, HH:MM AM/PM` format.

### Mobile Responsive Issues
- The app uses dual rendering: `.table-container` for desktop tables and `.mobile-view` for mobile card layouts.
- If a new table is added, a corresponding mobile view should also be added.
- Test at 375px width to verify mobile behavior.

---

## Development Guidelines

1. **Inspect existing code before changing it.** Understand the current implementation.
2. **Preserve existing functionality.** Do not rewrite working features.
3. **Keep frontend/backend separation.** Do not mix concerns.
4. **Maintain responsive behavior.** New tables need mobile card equivalents.
5. **Test both Admin and User perspectives.**
6. **Test at mobile and desktop viewports.**
7. **Never commit secrets** (`.env`, tokens, keys, connection strings).
8. **Run `npm run build` before pushing** to catch frontend build errors.
9. **Keep changes focused.** If the request is a CSS fix, do not modify the backend.
10. **Maintain accessibility** — proper labels, keyboard navigation, semantic HTML.
