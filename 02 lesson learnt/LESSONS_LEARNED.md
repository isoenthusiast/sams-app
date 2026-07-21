# SAMS App — Lessons Learned

**Project:** SAMS App (sams-app)  
**Purpose:** Capture mistakes, fixes, and patterns discovered during development  
**Rule:** Each lesson includes: what failed, root cause, fix applied, preventive measure

---

## Session: Initial Build — July 21, 2026

### 1. next-auth has no stable v5 — must pin beta version explicitly
- **What failed**: `npm install next-auth@5` → `ETARGET No matching version found`
- **Fix**: `npm install next-auth@5.0.0-beta.31` (same as seam-app)
- **Preventive**: Check seam's package.json for exact version strings — don't assume semver majors exist.

### 2. Prisma 7.9.0 breaks Next.js build worker — pin to 7.8.0
- **What failed**: `npx prisma generate` pulled 7.9.0; `next build` crashed with `The "id" argument must be of type string`
- **Fix**: `npm install prisma@7.8.0 @prisma/client@7.8.0`
- **Preventive**: Pin Prisma to seam-app's version. Install prisma as a project dep before generating.

### 3. TypeScript 7.0.x is incompatible with Next.js type checking
- **What failed**: Fresh `npm install -D typescript` pulled TS 7.0.2 → build failures + dev loop
- **Fix**: `npm install -D typescript@5`
- **Preventive**: Always pin `typescript@5` for Next.js 16.

### 4. Copying auth from seam-app: don't forget the type augmentation file
- **What failed**: `auth.user.role` and `Property 'role' does not exist on type 'User'` errors
- **Fix**: Copied `src/types/next-auth.d.ts` with interface augmentation
- **Preventive**: When copying auth, grep for `*.d.ts` and `declare module` files.

### 5. npm partial install failure left package.json incomplete
- **What failed**: First `npm install` errored on next-auth ETARGET but persisted partial results
- **Fix**: Re-ran install with corrected version, verified with `npm ls`
- **Preventive**: Check `package.json` + `npm ls` after any npm error; don't assume success.

### 6. Prisma schema has relations without include-able sub-relations
- **What failed**: `AActControls` has `controlId` (String FK) but no `control` relation; `AActUsers` has `userId` but no `user` relation
- **Root cause**: The seam-assurance-app Prisma schema doesn't define explicit relations on these junction models — just raw FK columns
- **Fix**: Use `controls: true` (scalar) instead of `controls: { include: { control: true } }` (relation)
- **Preventive**: Read the schema before writing Prisma queries — not all FKs have matching `@relation` declarations.

### 7. AchievementBadge uses `badgeName` not `name`
- **What failed**: `ua.badge.name` → TypeScript error `Property 'name' does not exist`
- **Root cause**: The Prisma model has `badgeName` as the field, not `name`. seam-assurance-app's schema uses this naming convention.
- **Fix**: Changed to `ua.badge.badgeName`
- **Preventive**: When accessing relation fields, check the Prisma schema for actual field names — naming conventions vary per model.

### 8. Phase-by-phase build avoids context exhaustion
- **What worked**: Building 1-2 phases at a time, verifying with `next build` after each batch, then presenting status to the user
- **What failed previously**: Continuous build of all 10 phases hit context limits midway — intermediate work was lost
- **Pattern**: (1) Build a phase, (2) `next build` to verify, (3) commit/capture lessons, (4) ask user to continue
- **Lesson**: For projects with 100+ items, batch into phases of 5-15 items each. Verify each phase before starting next. Context is the limiting resource.

### 9. Copied API routes need their dependencies verified
- **What worked**: Copying 4 database API route files from seam-app (`backup`, `restore`, `export-controls`, `export-requirements`) with identical Prisma schema and auth helpers compiled first try
- **Verification**: `next build` confirmed all 4 routes resolve; `verify_parity.py` confirmed schema + auth identity
- **Pattern**: When sharing APIs across apps with the same database, copy the route files verbatim — no modification needed if the lib imports resolve to identical modules
- **Preventive**: Always run `next build` after copying routes to verify all imports resolve

### 10. Admin sub-views with searchParams avoid route explosion
- **What worked**: Single `/admin` page with `?view=dashboard|activity|users|templates` query param, conditional server-side data fetching, sub-nav tabs
- **Pattern**: For admin sections with similar layout, use searchParams sub-views instead of separate routes — reduces boilerplate and keeps navigation simple
- **Lesson**: Server components can read `searchParams` as a Promise in Next.js 16. Use `const sp = await searchParams` pattern.

### 11. Assessor test users may have different BCrypt passwords than admin
- **What failed**: Login as `megan` with admin password (`PaaP6ggFHqsr`) returned "Invalid username or password"
- **Root cause**: Each user's `passwordHash` is independently BCrypt-hashed. The shared DB has different hashes per user — assessor accounts may use different plaintext passwords set during seeding
- **Impact**: Smoke-testing assessor flows requires knowing each user's password. admin login works (verified)
- **Fix for testing**: Reset assessor passwords to known values via Prisma or the seam-app admin interface
- **Lesson**: When sharing a DB between apps, document test user credentials in the design docs. Passwords are per-user, not shared.

### 12. Railway deploy: 3 sequential fixes needed for first deploy
- **Attempt 1 (502)**: `output: "standalone"` in next.config.ts → removed. `next start` incompatible with standalone output in RAILPACK builder.
- **Attempt 2 (502)**: `next start -p 3100` hardcodes port → changed to `next start -p ${PORT:-3100}`. Railway sets PORT=8080.
- **Attempt 3 (redirect loop)**: `NEXTAUTH_URL="https://sams-app.railway.internal"` (internal domain) → changed to `https://sams-app-sams.up.railway.app` (public domain).
- **Lesson**: Railway deploys need: (1) no `output: standalone`, (2) port from `$PORT` env var, (3) `NEXTAUTH_URL` set to the public domain, not internal.

### 13. Railway env var changes trigger deploys of current code, not latest commit
- **What happened**: Changing `NEXTAUTH_URL` via `railway variables set` triggered a deploy of the code at the previous commit, not the latest pushed commit
- **Fix**: After env var changes, triggered a fresh `railway up` to deploy the latest commit with the new env vars
- **Lesson**: After any env var change, always run `railway up` to ensure the latest code is deployed with the new variables.

### 14. Global toast system: module-level setter avoids prop drilling
- **What worked**: `Toast.tsx` uses a `globalSetToasts` module-level variable that `showToast()` calls. Any component can call `showToast("message", "success")` without prop drilling or context.
- **Pattern**: `let globalSetter: ((updater) => void) | null = null` in the module scope; `useEffect` sets it on mount; exported `showToast()` function calls it.
- **Lesson**: For truly global UI elements (toasts, modals), module-level setters are simpler than React Context — no provider wrapping needed.

### 15. Keyboard drag-drop alternative: simple `<select>` onChange per control row
- **What worked**: Added a "Move to ▾" `<select>` dropdown in each control row that calls `handleDropControl` on change. The dropdown lists all other requirements in the PA.
- **Pattern**: `onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) handleDrop(ctrlId, Number(v)); }}` — resetting value to "" lets the user re-select the same option.
- **Lesson**: Providing a keyboard-accessible alternative to drag-and-drop takes ~5 lines of JSX — low effort, high accessibility value.

---

## Session: API Routes + Performance + Mobile — July 21, 2026

### 16. "100% checklist" ≠ fully functional — always audit API routes
- **What failed**: The checklist showed 100/100 (all [x]), but 7 API routes the frontend called were never ported from seam-app. Features silently broke with 404 errors at runtime: control assignment toggle, sample editing, assessment completion, requirement editing, KB creation, gamification awarding, control-requirement mapping.
- **Root cause**: The frontend was built to call `/api/admin/control-assignments`, `/api/admin/samples/[id]`, etc., but only the frontend code was written — the backend route handlers were never created. The checklist marked items "done" based on frontend code existing, not on end-to-end verification.
- **Fix**: Created 8 targeted API routes using raw SQL (avoids Prisma schema drift): control-assignments CRUD, samples PUT, Assessment PUT, MapControl2Requirement GET/POST/PUT, Requirement PUT, Knowledgebase POST, gamification/award POST.
- **Lesson**: A checklist item should only be marked done after verifying the full request-response cycle works. Frontend code that calls a non-existent API is NOT "done." Always audit: `grep -r "fetch(" src/` → cross-reference with `ls src/app/api/` → any unmatched routes are bugs.

### 17. Prisma schema ≠ DB schema — always check actual DB columns
- **What failed**: `prisma.user.findUnique()` crashed with `Column "position" does not exist` and `Column "companyId" does not exist`. The Prisma schema had columns that were never added to the actual PostgreSQL database. Similarly, `UserCompany` table didn't exist in the DB.
- **Root cause**: The Prisma schema was copied from seam-app and may have been ahead of the actual DB migration state. Prisma's `db push` or `migrate dev` was not run before querying.
- **Fix**: Used `information_schema.columns` to check actual DB columns. Wrote raw SQL INSERTs that only reference columns that actually exist. Avoided Prisma model methods for tables with schema drift.
- **Lesson**: Before writing any Prisma query against a shared/unknown DB, run `SELECT column_name FROM information_schema.columns WHERE table_name = 'X'`. Never assume the Prisma schema matches the actual DB.

### 18. Railway proxy vs local DB — use `railway run` for production ops
- **What failed**: Created assessor users locally → they appeared in local DB but login failed on deployed app. The local `.env` pointed to a Railway proxy URL that may route to a different instance.
- **Root cause**: `railway up` deploys code; database operations need `railway run "npx tsx script.ts"` to execute against the production DB.
- **Fix**: Ran `railway run "npx tsx create_assessors.ts"` to create users in production. Verified megan login on deployed URL.
- **Lesson**: Always use `railway run` for DB mutations against production. Local scripts may hit a different DB instance.

### 19. react-window v2+ uses `children` as component, not render function
- **What failed**: `import { FixedSizeList } from "react-window"` — `FixedSizeList` doesn't exist. Then `List` children as render function failed type check.
- **Root cause**: react-window v2+ renamed exports (`List` instead of `FixedSizeList`) and changed the children API from render-prop to component-prop.
- **Fix**: Used `import { List } from "react-window"`. The children API in v2 requires a component, not a render function — deferred full integration.
- **Lesson**: Check library exports at runtime (`require("pkg")`) before assuming API. Major version bumps often change core APIs.

### 20. PowerShell `$` in inline code breaks — use .ts files always
- **What failed**: Every `npx tsx -e "...prisma.$queryRawUnsafe..."` command failed with PowerShell interpreting `$queryRawUnsafe` as a variable.
- **Root cause**: PowerShell treats `$` as a variable prefix even inside single-quoted strings passed to Node.
- **Fix**: Always write a `.ts` file and run it with `npx tsx`. Never use `-e` for Prisma operations in PowerShell terminals.
- **Lesson**: This is lesson #22 from the user memory — confirmed again. Use .ts files for ALL database operations.

### 21. Shared DB may be missing tables — Prisma schema ≠ actual DB state
- **What failed**: Parity check discovered 13 tables missing from production DB: Standard, Requirement, MapControl2Requirement, Knowledgebase, Company, UserCompany, Attachment, AttachmentMapping, and more. The Prisma schema describes 40+ tables but only 22 exist in the shared Railway DB.
- **Root cause**: The Prisma schema was copied from seam-app which had migrations applied to its own DB. The shared Railway DB was set up independently and never received all migrations. seam-app may have used a different DB or the migrations were lost during Railway setup.
- **Impact**: Features depending on missing tables (Requirements editor, control-requirement mapping, knowledgebase, company scoping, attachments) will fail at runtime with "relation does not exist" errors. Read-only views of existing tables (User, Control, Assessment, ProcessArea) work fine.
- **Fix needed**: Run `npx prisma migrate deploy` against the shared DB to create missing tables. Or use `npx prisma db push` to sync schema to DB. This is a one-time operation.
- **Lesson**: After copying a Prisma schema to a new project, always verify `information_schema.tables` matches the expected model list. Run `prisma migrate deploy` as part of initial setup.

