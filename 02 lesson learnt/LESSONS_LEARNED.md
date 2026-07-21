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


