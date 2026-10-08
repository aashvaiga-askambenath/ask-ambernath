# Ask Ambernath

Ask Ambernath is a mobile-first local marketplace for discovering and requesting services from independent Ambernath businesses. The app includes public discovery and search, Supabase Auth, business onboarding and owner tools, orders, reviews, saved businesses, support, and a role-protected admin dashboard.

The production data source is Supabase Postgres. The former local JSON store and generated demo accounts have been removed; no demo credentials or fake marketplace records are created.

## Architecture

- **Web app:** React 19, Vite, React Router, existing purple ASK AMBERNATH design language.
- **API:** Node.js 20+, Express 5 REST API. In production it also serves the Vite build.
- **Authentication:** Supabase Auth in the browser using the official Supabase client. API bearer tokens are verified with Supabase Auth on every protected request; current profile role and active state are read from Postgres.
- **Database/files:** Supabase Postgres with checked-in SQL/RLS, Supabase Storage for public business media and private verification documents.
- **Hosting:** One Render Node web service for the app/API and Supabase for auth, database, and storage.

The service-role key is used only in the Express process. Browser requests use the publishable/anon key and the user session. Prices and order totals are calculated inside the `create_order` Postgres transaction.

## Requirements

- Node.js 20.19+ (or a supported current Node LTS) and npm.
- A Supabase project for authenticated/database-backed use.
- A Render account for the recommended production deployment.

## Local setup

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Copy `.env.example` to `.env` and fill in the Supabase Project URL, publishable/anon key, and server-only service-role key. Keep `.env` private.
3. Apply the SQL migration in `supabase/migrations/202610090001_initial_marketplace.sql` using Supabase Dashboard → SQL Editor, or use the Supabase CLI from a linked project:

   ```sh
   npx supabase db push
   ```

4. In Supabase Dashboard → Authentication → URL Configuration, set the local Site URL to `http://localhost:5173` and add `http://localhost:5173/auth` to the redirect URLs.
5. Run the app:

   ```sh
   npm run dev
   ```

   The Vite app runs at `http://localhost:5173`; the API runs at `http://localhost:4000`. `GET /api/health` remains available without Supabase configuration, but marketplace and account requests correctly return a configuration error until valid project credentials and the migration are applied.

## Supabase project setup

1. Create a Supabase project and choose a strong database password. Do not put the database password or service-role key in source control.
2. Apply the checked-in migration. It creates the normalized schema, indexes, RLS policies, two storage buckets, transaction functions, initial service categories, and zero-fee defaults. It does not create people, businesses, orders, or admin accounts. To use the Supabase CLI, initialize its local config once with `npx supabase init`, then run `npx supabase login`, `npx supabase link --project-ref YOUR_PROJECT_REF`, and `npx supabase db push` from the project root.
3. In Authentication settings, configure the desired email provider and email verification policy. Set the Site URL and allowlisted redirect URLs for local development and the final HTTPS app domain. Password recovery returns to `/auth?mode=update-password`.
4. The migration configures:
   - `business-media`: public read for approved marketplace imagery; owner uploads must be under that owner's business UUID.
   - `verification-documents`: private PDF bucket; business owners can upload/read their own documents and administrators receive short-lived signed read URLs.
5. Review the generated policies in the Supabase dashboard before launch. RLS is enabled on all application tables. Admins can manage platform and delivery fees from the dashboard; fee changes apply to new orders only. The API also validates bearer sessions, roles, ownership, and input. Never expose the service-role key to a client.

### First super administrator

There is no public admin signup and no default admin password. First create a real account through the normal sign-up page, verify its email, then run this statement in the Supabase SQL Editor as the project owner. Replace the email with the trusted operator’s exact verified email:

```sql
update public.profiles as profile
set role = 'super_admin', updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id
  and lower(auth_user.email) = lower('trusted-admin@example.com')
  and auth_user.email_confirmed_at is not null;
```

Confirm exactly one row was updated. This operation is intentionally unavailable to normal application users. Protect the Supabase owner account and keep a second, separately protected recovery path.

## Environment variables

Copy `.env.example`; use Render’s environment settings for production:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Production | Set to `production` on Render. |
| `PORT` | Hosting-provided | Express listens on this port and binds to `0.0.0.0`. |
| `APP_URL` | Yes | Canonical public HTTPS origin used in sitemap URLs and auth setup. |
| `CLIENT_ORIGIN` | Yes | Exact browser origin allowlist; comma-separated only for explicitly trusted origins. |
| `SUPABASE_URL` | Yes | Project URL, server-side. |
| `SUPABASE_ANON_KEY` | Yes | Project publishable/anon key for server-created, user-token-scoped RPC clients. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only privileged API operations. Never prefix this with `VITE_`. |
| `VITE_SUPABASE_URL` | Build time | Public Supabase URL used by browser Auth and Storage. |
| `VITE_SUPABASE_ANON_KEY` | Build time | Public/publishable key used by the browser. |
| `VITE_API_URL` | Optional | API prefix override; the default is same-origin `/api`. |
| `VITE_GA_MEASUREMENT_ID` | Optional | Enables production page-view events; unset to disable. No order/customer data is sent. |
| `SUPPORT_EMAIL` | Optional | Public support contact returned by `/api/public-config`. |
| `SUPPORT_PHONE` | Optional | Public support contact returned by `/api/public-config`. |
| `SUPPORT_WHATSAPP` | Optional | Public support contact returned by `/api/public-config`. |
| `LOG_LEVEL` | Optional | Reserved for deployment log filtering; defaults to `info`. |

The `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, and `CLIENT_ORIGIN` are checked at production startup. The service-role key is never bundled into Vite assets. The local `.env` file may contain stale values from the former prototype; the current app does not read its old JWT or MongoDB settings.

## Running and quality checks

```sh
npm run dev
npm run lint
npm test
npm run smoke
npm run build
npm start
```

The API's health endpoint is `GET /api/health`. With a completed production build, Express serves the SPA and fingerprinted static assets. Browser auth and data features require a configured Supabase project.

## Legacy JSON data

`data/db.json` was the old prototype store and contained only generated demo accounts and fictional sample businesses. It is removed and is not read by the app. Those demo users, password hashes, and businesses are deliberately not imported. Bcrypt hashes from the old app cannot be turned into Supabase Auth users by copying rows; a real-user migration would require a separately approved identity migration and verified email recovery. Do not import the former demo accounts into production.

The initial migration inserts only category/configuration rows. There is no automatic production seed and no fake order, customer, business, or rating data.

## Render deployment

1. Push the repository to the private/public Git host used by your team, with `.env` excluded.
2. Create a Render Blueprint from `render.yaml` or create a Node web service with:
   - Build: `npm ci && npm run build`
   - Start: `npm start`
   - Health check: `/api/health`
3. Enter the environment values from the table in Render. Set `APP_URL` to the final HTTPS origin and `CLIENT_ORIGIN` to that exact browser origin. Add both `VITE_SUPABASE_*` values before the build so Vite can compile the public browser configuration.
4. Apply the Supabase migration, enable/configure Auth email delivery, and add both the final app URL and `https://your-domain.example/auth` to Supabase redirect allowlists.
5. Create/promote the first super admin using the protected SQL procedure above.
6. Verify `/api/health`, sign-up, email verification, login, password reset, owner application, moderation, and a real test order with the configured project before announcing the service.
7. To use a custom domain, attach it in Render, complete the DNS records Render provides, wait for HTTPS provisioning, then update `APP_URL`, `CLIENT_ORIGIN`, and Supabase Auth URL allowlists to the final domain.

Render injects `PORT`; do not commit or hard-code production secrets in `render.yaml`.

## Security and data behavior

- Supabase Auth sessions are managed by the official client; no custom JWT secret or hand-written persistent token store exists.
- Protected API requests validate the live Supabase user, then enforce the current profile role and active status server-side.
- Public listing queries require active, verified, online businesses. Owners cannot set verification state or publish an unverified listing.
- The order creation RPC locks and rechecks the eligible business and available service records, validates each quantity, calculates totals from database prices/settings, snapshots line items/address, creates the status event, and notifies the owner in one transaction. The request idempotency key is unique per customer.
- The order transition RPC rechecks the actor, ownership, current status, and legal next status while holding an order row lock.
- Supabase Storage validates allowed MIME types and bucket size ceilings; the API validates MIME/size again and uses generated UUID paths, not user-provided filenames.
- The API uses Helmet, an explicit production CORS allowlist, JSON size limit, global/auth rate limits, Zod validation, UUID validation on protected resource paths, and safe generic server errors. Bearer-token authorization is used rather than authentication cookies, so cross-site form CSRF does not attach an ambient session credential; CORS is still restricted.
- API logs include startup metadata and sanitized request path/error codes only, never credentials, tokens, passwords, addresses, or order contents.

## SEO, PWA, legal text, and analytics

The app includes a mobile manifest and icon, robots rules, a dynamic sitemap with active approved business routes, default social metadata, and route-aware page titles/canonicals. As a client-rendered SPA, per-business Open Graph metadata is not guaranteed to be visible to crawlers that do not execute JavaScript; use server rendering/prerendering if social previews for each business are a launch requirement. A service worker/offline cache is intentionally not enabled, so private API/auth responses are never cached.

The starter Terms, Privacy, and Cancellation pages are generic, clearly marked for legal review, and do not invent a business entity or registration details. Before launch, replace/review them with the real operating entity, privacy contact, retention and consumer cancellation/refund terms. Add real support contact details through environment variables. No analytics runs without an explicit measurement ID.

## Backups, rollback, troubleshooting

- Configure Supabase’s appropriate backup/PITR plan for the selected production tier and test a restore procedure before accepting live orders.
- Apply schema changes through reviewed, versioned migrations. Take a backup before destructive schema changes; rollback by applying a forward corrective migration rather than editing production data manually.
- If the API says `DATABASE_NOT_CONFIGURED`, verify all three server Supabase variables and restart the service.
- If the browser says auth is not configured, verify both `VITE_SUPABASE_*` variables were present during the last Render build, then redeploy.
- If email verification or recovery links fail, update the Site URL, allowed redirect URLs, and email templates in Supabase Auth.
- If public businesses are missing, verify they are active, verified, online, in an active category, and have available services.
- If storage uploads fail, verify the migration created the expected bucket, the authenticated owner owns the business, MIME type/size is allowed, and the browser has a valid Supabase session.
- If Render reports a health failure, inspect its sanitized logs and confirm the service binds to Render's injected port. `/api/health` reports whether Supabase keys are configured; it does not expose keys or perform a database query.

## Launch checklist

- [ ] Set verified production domain and HTTPS; match Render origin and Supabase redirect allowlists.
- [ ] Apply and review the migration/RLS policies in the production Supabase project.
- [ ] Configure verified-email auth, recovery emails, and deliverability.
- [ ] Promote the trusted first super admin securely and protect account recovery.
- [ ] Enter only real support contacts and legal entity details; have legal copy reviewed.
- [ ] Replace the brand icon if the final approved artwork differs.
- [ ] Have real Ambernath providers submit their listings and verify each business and document before publication.
- [ ] Test a complete real-data customer/owner/admin workflow and confirm no online payment is represented as paid.
- [ ] Configure backups, monitoring, rate-limit expectations, and incident contacts.
- [ ] Decide the applicable privacy/analytics consent policy before enabling third-party analytics.
