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
- Persistent browser session: the logged-in user profile is stored in `localStorage` and restored on reload.
- Authenticated API requests send `x-user-id` and `x-user-email` headers (no JWT or token expiry).
- The session lasts until the user clicks **Logout**; 401/403 responses do not auto-log-out.
- Failed login attempts and successful logins are recorded in audit logs.
- Disabled accounts are blocked at login with a 403 response.
- Self-service password change (requires current password).

### Admin
- **Dashboard** — Overall statistics with per-user breakdown. Filterable by user and date range.
- **Records** — View, create, edit, delete, and mark records as paid back. Supports bulk selection and bulk "Mark as Paid Back". Searchable and filterable by status, user, and date range. Undo payment status. The admin table includes a configurable Gift Card PIN column.
- **Users** — Create, edit, disable/enable, reset password, and delete users. Each user card shows their GC statistics.
- **Downtime** — Start maintenance instantly, or schedule future windows with start/end date-time. Edit/reschedule or cancel scheduled windows, and start or end them manually. While maintenance is active, new gift card submissions are blocked but existing records remain readable. Administrators always retain access.
- **Audit** — View paginated audit history with action filtering. Sensitive fields (PINs, passwords) are redacted in the UI.
- **Exports** — Download GC records as CSV or Excel (.xlsx), respecting current filters and visible column preferences. Excel includes the Gift Card PIN column when it is selected; CSV never includes PINs.

### User
- **Dashboard** — Personal statistics (total records, total GC amount, total paid, total paid back, pending records/amounts).
- **Payment summary** — Paid-back history grouped by the recorded `paidBackAt` date, with per-day record counts and totals, date-range/search/sort filters, expandable daily groups, responsive daily/weekly/monthly trend charts with exact-value details, and pending-payment visibility. Dates use the browser's local time zone; only recorded payment dates are shown and no future payment dates are estimated.
- **Records** — Submit new GC records, edit, delete, and view own records. Searchable with status and date filters, plus sorting by submission date, GC amount, or paid-back date.
- **No payment actions** — Users cannot mark records as paid; only Admin can.
- **Downtime notices** — A maintenance ribbon shows the current state or upcoming date/time. During maintenance, users can still sign in and view existing records, while new gift card submissions are disabled in the UI and blocked by the API.

### GC Validation
- **Duplicate rule (per user):** For the same user, the combination of `giftCard` + `giftCardPin` must be unique. This is enforced both:
  - **Server-side** — Explicit `findOne()` check before create/update.
  - **Database-side** — Compound unique index `{ user: 1, giftCard: 1, giftCardPin: 1 }` on `GCRecord` collection.
- Different users may have the same gift card + PIN combination.
- Edit operations exclude the current record (`_id: { $ne: record._id }`) when checking for duplicates.

### Maintenance & Scheduled Downtime
- Administrators manage maintenance from the **Downtime** tab with one contextual primary action, a compact schedule form, live countdowns, and a **Manage** menu for editing or cancelling scheduled windows.
- Maintenance can be started immediately, scheduled with a start/end date-time, edited/rescheduled, cancelled, started early, or ended early.
- Maintenance mode is persisted as a downtime entry in MongoDB, so it survives server restarts. Ending it marks the entry completed.
- While maintenance is active, login, record viewing, stats, providers, exports, and audit access remain available. Only creation of new gift card records is blocked.
- `POST /api/gc-records` returns `503` with code `DOWNTIME_ACTIVE` while maintenance is active, for every role. The user and admin record forms also disable the create action.
- Scheduled windows require both a start and end time. Times are entered and displayed in the browser's local time zone, stored as UTC, and compared consistently on the server.
- A server-side scheduler reconciles stored statuses at startup and every 30 seconds, so activation and completion still happen after a restart or a missed boundary. Request-time evaluation using the same window rules keeps behavior correct between ticks; no frontend timer is required.
- Overlapping scheduled windows are rejected (HTTP 409), including overlaps with open-ended active maintenance. Active or scheduled entries cannot be deleted until stopped or cancelled.
- The public `GET /api/downtime/status` endpoint powers the login/dashboard ribbon and is refreshed every 5 seconds and when the window regains focus.

### Audit Logging
The following actions are logged to the `AuditLog` collection:
- `user_created`, `user_edited`, `user_deleted`, `user_disabled`, `user_enabled`, `password_reset`
- `record_created`, `record_edited`, `record_deleted`, `record_paid_back`, `bulk_paid_back`
- `login_success`, `login_failed`
- `downtime_scheduled`, `downtime_started`, `downtime_rescheduled`, `downtime_stopped`, `downtime_cancelled`, `downtime_deleted`

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
  ├── Auth middleware (persistent session headers)
  ├── RBAC middleware (adminOnly / userOnly)
  ├── CORS (whitelist of origins)
  │
  └── MongoDB (Mongoose ODM)
        ├── User
        ├── GCRecord
        ├── Downtime
        └── AuditLog
```

**Key technologies:**
- **Backend:** Node.js >= 18, Express 4, Mongoose 8, bcryptjs
- **Authentication:** persistent `localStorage` session with user headers (no JWT)
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
│       │   ├── AuthContext.jsx # Auth state, login/logout, role helpers
│       │   └── DowntimeContext.jsx # Polls downtime status; active/upcoming state
│       ├── components/
│       │   ├── DowntimeRibbon.jsx  # Upcoming/active maintenance ribbon
│       │   └── ...             # Theme toggle, paid amount, etc.
│       ├── pages/
│       │   ├── Login.jsx       # Login page
│       │   ├── AdminDashboard.jsx  # Admin tabs: Dashboard, Records, Users, Downtime, Audit
│       │   └── UserDashboard.jsx   # User dashboard + records
│       └── utils/
│           ├── api.js          # ApiClient class (fetch wrapper with session headers)
│           └── format.js       # Date/currency/status formatting utilities
├── models/
│   ├── User.js                 # User model (name, email, hashed password, role, active)
│   ├── GCRecord.js             # Gift card record model
│   ├── Downtime.js             # Scheduled downtime model
│   └── AuditLog.js             # Audit log model
├── routes/
│   ├── auth.js                 # POST /login, GET /me, POST /change-password
│   ├── users.js                # CRUD users (admin only)
│   ├── gcRecords.js            # CRUD records + pay + bulk-pay + undo-pay
│   ├── stats.js                # GET /user, GET /admin (aggregated stats)
│   ├── audit.js                # GET audit logs (admin only)
│   ├── downtime.js             # Public status + admin schedule/start/stop/cancel
│   └── export.js               # GET /csv, GET /excel (admin only)
├── middleware/
│   └── auth.js                 # Session auth, adminOnly, userOnly middleware
├── utils/
│   ├── audit.js                # logAction helper for AuditLog
│   └── downtime.js             # Time-window status, overlap, and serialization helpers
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
- Three pages/views: `Login`, `AdminDashboard`, and `UserDashboard`.
- Admin dashboard uses tabs (Dashboard, Records, Users, Downtime, Audit) within a single component.
- `DowntimeProvider` polls `/api/downtime/status` every 5 seconds; a 503 `DOWNTIME_ACTIVE` response or window focus also refreshes it immediately. The server scheduler reconciles stored statuses at startup and every 30 seconds.
- The admin downtime tab shows live countdowns, inline validation, status badges, and a compact manage menu.
- All CSS is in a single `client/src/index.css` file.

### API Calls
- All API calls go through `client/src/utils/api.js` — a custom `ApiClient` class.
- The client reads the saved user profile from `localStorage` and sends `x-user-id` / `x-user-email` headers.
- In development, the base URL is `http://localhost:5000`. In production, it is empty (same origin).
- On 401/403 responses, the client reports the error but keeps the session; logout only happens when the user clicks **Logout**.
- On 503 `DOWNTIME_ACTIVE`, the client emits a browser event that immediately shows the maintenance banner and disables create actions.
- File downloads use `api.downloadFile()` which sends the same session headers and returns a raw `Response` for blob handling.

### Formatting Utilities
- `formatCurrency(amount)` — Formats as INR currency (₹).
- `formatDate(date)` — DD Mon YYYY format.
- `formatDateTime(date)` — DD Mon YYYY, HH:MM AM/PM format.
- `getStatusColor(status)` / `getStatusLabel(status)` — Map `pending`/`paid_back` to CSS classes and labels.

### Authentication State
- On mount, `AuthContext` reads `user` from `localStorage` and removes any legacy `token` value.
- `login()` calls the API, stores the user profile, and sets state.
- `logout()` clears the saved user (and any legacy token) and state.
- `isAdmin` / `isUser` are derived from `user.role`.
- The session is persistent until explicit logout; expiring/invalid sessions are not auto-cleared.

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

### Middleware Stack
1. **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`.
2. **Compression** — gzip responses.
3. **Body parsing** — JSON with 10MB limit.
4. **Cookie parser** — Parses cookies (not used for authentication).
5. **CORS** — Whitelist: `localhost:5173`, `localhost:3000`, `gc-management-app.onrender.com`, `giftcardmanager.duckdns.org`. Credentials enabled.

### API Routes

| Route Group | Auth Required | Admin Only | Description |
|---|---|---|---|
| `POST /api/auth/login` | No | No | Login, returns user profile |
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
| `GET /api/downtime/status` | No | No | Public current/upcoming maintenance status |
| `GET /api/downtime` | Yes | Yes | List downtime entries with current/upcoming summary |
| `PUT /api/downtime` | Yes | Yes | Enable/disable maintenance mode (`{ enabled: true/false }`) |
| `POST /api/downtime/toggle` | Yes | Yes | Alias for the maintenance mode toggle |
| `POST /api/downtime` | Yes | Yes | Schedule a future window or start one immediately |
| `PUT /api/downtime/:id` | Yes | Yes | Edit or reschedule a future scheduled window |
| `POST /api/downtime/:id/start` | Yes | Yes | Start a future scheduled window now |
| `POST /api/downtime/:id/stop` | Yes | Yes | Stop active downtime early |
| `POST /api/downtime/:id/cancel` | Yes | Yes | Cancel future scheduled downtime |
| `DELETE /api/downtime/:id` | Yes | Yes | Delete completed/cancelled entry |
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
| `action` | String | Enum of supported action types |
| `performedBy` | ObjectId (ref: User) | Required |
| `targetType` | String | `user`, `record`, `provider`, or `downtime` |
| `targetId` | ObjectId | Required |
| `metadata` | Mixed | Additional context (varies by action) |
| `ipAddress` | String | Client IP |
| `createdAt`/`updatedAt` | Date | Auto via `timestamps: true` |

**Indexes:** `{ performedBy: 1 }`, `{ action: 1 }`, `{ targetType: 1, targetId: 1 }`, `{ createdAt: -1 }`

### Downtime Model (`models/Downtime.js`)
| Field | Type | Details |
|---|---|---|
| `title` | String | Optional, max 120 chars |
| `message` | String | Optional user-facing message, max 500 chars |
| `startAt` | Date | Required, stored as UTC |
| `endAt` | Date | Optional; `null` means indefinite maintenance until disabled. Scheduled windows must be after `startAt` and in the future at creation |
| `status` | String | `scheduled`, `active`, `completed`, or `cancelled` |
| `startedAt` / `stoppedAt` / `cancelledAt` | Date | Administrative action timestamps |
| `stoppedBy` / `cancelledBy` / `createdBy` | ObjectId (ref: User) | Audit references |
| `createdAt`/`updatedAt` | Date | Auto via `timestamps: true` |

**Indexes:** `{ status: 1 }`, `{ startAt: 1, endAt: 1 }`, `{ status: 1, startAt: 1 }`

**Effective status:** open windows (`scheduled`/`active`) are evaluated against the current server time. A window becomes active at `startAt` and completed at `endAt` even if the stored status has not been refreshed. An entry with no `endAt` stays active until an administrator disables maintenance mode.

---

## Authentication & Authorization

### Authentication Flow
1. User submits email + password to `POST /api/auth/login`.
2. Server validates credentials via `bcrypt.compare()`.
3. If valid, the server returns the user profile (`id`, `name`, `email`, `role`). No JWT is issued.
4. Frontend stores the profile in `localStorage`; it is restored on page reload.
5. Subsequent requests send `x-user-id` and `x-user-email` headers.
6. The session remains active until the user clicks **Logout**. A 401/403 does not clear it automatically.

### Authorization Rules
- **`auth` middleware** — Resolves the user from the validated `x-user-id` / `x-user-email` session headers and checks `active` status. It does not block reads during maintenance.
- **`blockDuringDowntime` middleware** — Applied to the GC record creation endpoint. Returns `503 DOWNTIME_ACTIVE` while maintenance is active; login and read-only endpoints are unaffected.
- **`adminOnly` middleware** — Requires `user.role === 'admin'`. Returns 403 otherwise.
- **`userOnly` middleware** — Requires `user.role === 'user'`. Returns 403 otherwise.
- **Ownership checks** — In GC record routes, users can only access their own records (`record.user === req.userId`). Admin bypasses ownership.
- **Admin protection** — Admin users cannot be modified or deleted by other admins via the user management API.
- **Downtime management** — Only administrators can enable/disable maintenance or manage scheduled downtime. Record creation is blocked for every role while maintenance is active.

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
| `ADMIN_EMAIL` | Default admin email | Has fallback in code. Set in production. |
| `ADMIN_PASSWORD` | Default admin password | Has fallback in code. **Change in production.** |
| `ADMIN_NAME` | Default admin display name | Has fallback in code. |
| `PORT` | Server port | Default: 5000 |
| `NODE_ENV` | Environment mode | Set to `production` on Render |
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
# Required: MONGODB_URI
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

Tests are split into unit, API integration, and Playwright end-to-end coverage for the downtime feature. The existing `tests/api-test.js` and `tests/playwright-check.js` remain local-only.

### Commands
```bash
# Unit tests (no server or database required)
npm run test:downtime:unit
npm run test:payments:unit
npm run test:payments:trend

# Payment summary integration tests (against a running server + isolated test DB)
TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
API_BASE=http://localhost:5001 npm run test:payments:api

# Payment summary Playwright end-to-end tests
TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
UI_BASE=http://localhost:5001 npm run test:payments:e2e

# Scheduler/restart tests (require MONGODB_URI; use isolated test databases)
MONGODB_URI=... npm run test:downtime:scheduler
MONGODB_URI=... npm run test:downtime:restart

# Integration tests against a running server (default http://localhost:5001)
TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
API_BASE=http://localhost:5001 npm run test:downtime:api

# Playwright end-to-end tests
TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
UI_BASE=http://localhost:5001 npm run test:downtime:e2e
```

### Payment Summary Coverage
- Date grouping, per-day record counts and paid-back totals, effective (adjusted) paid amounts, empty and large datasets.
- Time-zone boundary grouping, missing/invalid payment dates, inclusive date-range filters, search, sorting, and pending summaries.
- All-time summary parity with `/api/stats/user`, strict user-level isolation, admin/unauthorized access rejection, and no PIN exposure.
- Desktop and mobile dashboard rendering, expandable day groups, trend granularities, and unchanged admin dashboard.

### Downtime Coverage
- Time-window, countdown, indefinite-maintenance, and validation logic (unit).
- Startup/interval reconciliation, missed start/end boundaries, terminal statuses, and simulated server restarts (scheduler).
- Real process restart recovery for start/end boundaries missed while the server was offline.
- Maintenance toggle persistence, idempotency, and administrator-only authorization.
- Login and read-only APIs remain available during maintenance.
- Gift card record creation is blocked for users and administrators while maintenance is active, then succeeds automatically when the window ends.
- Admin UI schedule, edit/reschedule, cancel, manual start/end, live countdowns, user banner, disabled create controls, and mobile rendering.
- Scheduled-window create/edit overlap checks, invalid ranges, timezone normalization, and audit logging.

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
- **Persistent sessions** — The saved user profile identifies the session until explicit logout.
- **RBAC** — Admin-only middleware on sensitive routes.
- **Ownership checks** — Users can only access their own GC records.
- **CORS** — Whitelist of specific origins. Credentials enabled.
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Input validation** — Required fields, non-negative amounts, paid ≤ amount, min password length.
- **Password stripping** — User model `toJSON()` removes password from all responses.
- **Audit logging** — All significant actions logged with user, target, and metadata.
- **Sensitive data redaction** — Audit UI filters out PIN/password-like keys from metadata display.
- **Gift Card PIN handling** — PINs are returned only to the record owner and to administrators; regular users cannot access another user's PIN or any export endpoint. PINs are never exposed in audit log metadata on edits, and audit log records exclude `giftCardPin` from change details.

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
- Check that the saved `user` profile exists in `localStorage` and that requests include `x-user-id` / `x-user-email` headers.
- If the saved profile is stale, click **Logout** and sign in again.
- Sessions are persistent until explicit logout; 401/403 responses do not clear local storage.

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
