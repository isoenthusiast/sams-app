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


