# Contributing to GC Management App

## Development Workflow

1. Ensure you are on the `deployment-test` branch.
2. Create a feature branch if working on a non-trivial change.
3. Make changes following the guidelines below.
4. Test your changes locally.
5. Run `npm run build` to verify the frontend builds.
6. Commit with a meaningful message.
7. Push and verify the Render deployment succeeds.

## Setup

```bash
git clone <repo-url>
cd gc-management-app
npm install
```

Create a `.env` file with:
- `MONGODB_URI` — Your MongoDB connection string
- `JWT_SECRET` — A secure random string
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — Optional admin defaults

Start the backend: `npm start`
Start the frontend dev server: `npx vite --config vite.config.js`

## Testing

- Verify login/logout for both Admin and User roles.
- Test GC record CRUD operations.
- Test duplicate GC + PIN rejection (same user) and acceptance (different users).
- Test payment actions (single pay, bulk pay, undo).
- Test responsive layout at mobile (375px) and desktop (1440px) viewports.
- Run `npm run build` to ensure no build errors.

## Branch Workflow

- `deployment-test` — Production branch. Auto-deploys to Render.
- Feature branches — For non-trivial changes. Merge into `deployment-test` when ready.

## Commit Expectations

- Write clear, descriptive commit messages.
- Reference the type of change (e.g., "Fix:", "Add:", "Update:", "Refactor:").
- Do not commit `.env`, credentials, tokens, or temporary files.
- Review `git diff` before committing.

## Security Rules

- Never commit secrets (`.env`, API keys, tokens, connection strings).
- Never expose Gift Card PINs in logs or documentation.
- Never weaken authentication or authorization checks.
- Never bypass rate limiting or CORS restrictions.

## Deployment

- Push to `deployment-test` triggers automatic Render deployment.
- Build: `npm install && npm run build`
- Start: `npm start`
- Monitor deployment at Render dashboard.
- The application must remain functional after deployment.

## Code Standards

- Follow existing code patterns and conventions.
- Keep frontend and backend separation clean.
- Add responsive mobile views for any new tables.
- Use existing CSS classes and design system.
- Handle errors gracefully with appropriate HTTP status codes.
- Log significant actions to the audit system.
