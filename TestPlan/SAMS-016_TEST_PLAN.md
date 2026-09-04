# SAMS-016 — Master Content Roll-Forward · TEST PLAN

**Author:** Cody (executor) · **This is the pre-implementation gate deliverable.**
**Reviewer:** Conan (owner) — approve to start implementation (per Edward ruling 2026-09-04).
**Spec:** Feature D, `docs/conan/CONAN_Phase4_Signature_Design.md` (frozen at gamified-plant d9f627e), D2.1–D2.4 + D3 negative paths. Card DoD items a–f.

---

## 0. What this plan proves (one line each)

| DoD item | Claim we prove | Mode |
|---|---|---|
| (a) | Publish vM from SAMS001 → tenant shows "update-available vN→vM" with a **correct** diff (1 added standard, 1 changed control, 1 removed mapping, plus the conflict entity) | function (HTTP) |
| (b) | Adopt → tenant content baseline = vM; client audits/findings/actions **row-identical** before/after (checksum probe) | function (HTTP + DB) |
| (c) | Removed-but-referenced content survives as **superseded, read-only**, link intact | function (DB) |
| (d) | Adoption **audit entry carries the diff**; client **notified** (in-app + banner until acknowledged); **export shows new version** | function (HTTP + DB) |
| (e) | Conflict: tenant-modified entity → **listed in diff AND flagged in audit entry**; master version applied | function (DB) |
| (f) | UI end-to-end: operator **publish → review diff → adopt**; client **banner → acknowledge** | browser-driven |

**Settled decisions being exercised:** D2.1 (versioned immutable ContentPack — no continuous sync), D2.2 (provider adopts + full diff + audit-logged with diff), D2.3 (client data never touched; superseded-not-deleted), D2.4 (tenant visibility: operator version, client notice+banner, export version).

---

## 1. Test seam (reuse the established harness)

Same shape as SAMS-014 (`scripts/mic-ritual/`) and SAMS-005 (`scripts/portal/`):

- **Migration:** additive + idempotent, applied to the **throwaway** DB via
  `npx tsx scripts/db/migrations/20260904_add_content_pack.ts` (run TWICE to prove idempotency; `db:parity` clean after).
- **DB:** throwaway Postgres at `DATABASE_URL` (the repo .env). `prisma generate` after the schema change.
- **Fixtures:** `scripts/content-rollforward/seed.ts` (idempotent self-cleanup, mirror of `mic-ritual/seed.ts`).
- **Server:** built (`npm run build`) then `npm start -p 3200` against the throwaway DB; `AUTH_URL/NEXTAUTH_URL=http://localhost:3200` (per `scripts/sso/start_test_server.sh`), local webhook receiver on :3999 for the notify assertion.
- **Run (single entry):** `scripts/content-rollforward/run.sh` — applies migration ×2, seeds, builds+starts server, drives `functional_test.mjs`, then `verify_step.ts`, then `ui_drive_test.mjs`; prints a PASS/FAIL matrix and the evidence commands used. (Guard: `next build` if `.next/BUILD_ID` missing — SAMS-015 reviewer P2 note.)

## 2. Fixture design (deterministic, thrown-away)

### 2.1 Master SAMS001 baseline — **v1** (content the tenant first adopts)
- Standards: `ST1`, `ST2`
- ProcessAreas: `PA1(ST1)`, `PA2(ST2)`
- Requirements: `R1(PA1)`, `R2(PA2)`
- Controls: `CT1(PA1)`, `CT2(PA2)`, `CT3(PA2)`
- Mappings: `MP1(CT1→R1)`, `MP2(CT2→R2)`, `MP3(CT3→R2)`
- Template checklists: `TMPL1` with 1 item linked to CT1.

`companyId = <SAMS001.id>` for all master rows (the existing bootstrap scoping).

### 2.2 Tenant `T` (companyID `RF001`) **bootstrapped at v1** via the existing `runBootstrap`
Tenant rows are the bootstrap's deterministic copies (stable cross-tenant key: `controlRef`/`name` for controls, `requirementId` for requirements, `pId`/name for PAs, `standard` for standards).

### 2.3 Client data on tenant `T` (the "sacred record" — must be untouched)
- Assessment `ASS_T`; Finding `F1` (references CT1 via ControlAssignment/Sample), Finding `F2` (references CT2), Finding `F3` (references CT3).
- Action `ACT_A1` on F1; AuditEvidence `EV1` on F1; a `RequirementConclusion` linking R1.
- Capture **full-row checksums** of Audits/Findings/Actions/Evidence/R1-conclusion + the `ControlAssignment` links BEFORE adopt → `before.checksum` (sorted-columns sha256 over all columns of every row in those tables for tenant `T`, EXCLUDING columns adoption writes — we assert none are written, i.e. checksum identical).

### 2.4 Master changes → **publish v2** (the "vM" under test)
1. **ADD** `Standard ST3` + `PA3(ST3)` + `Requirement R3(PA3)` + `Control CT4(PA3)` + `Mapping MP4(CT4→R3)`.
2. **CHANGE** `Control CT1` statement (master-side edit). Tenant CT1 untouched.
3. **CHANGE** `Control CT3` statement (master-side edit). **Tenant CT3 was ALSO modified** after bootstrap (fixture edits CT3.statement in step 2.3/2.5) → classic **changed-elsewhere conflict**.
4. **REMOVE** `Control CT2` (referenced by F2) **and** `Mapping MP2(CT2→R2)`.

**Expected diff v2 vs tenant-v1:** added `{standards:1, processAreas:1, requirements:1, controls:1, mappings:1}` · changed `[CT1]` · conflicts `[CT3]` · removed `[CT2→superseded, MP2]`.

### 2.5 Conflict setup (fixture, BEFORE publish)
After bootstrap, fixture edits tenant `CT3.statement = "TENANT-MODIFIED"` (and marks tenant's last-adopted baseline as v1). This is the only tenant-side content mutation in the fixture.

---

## 3. FUNCTION tests (HTTP + DB)

All use a logged-in **provider** session (operator console) and a logged-in **client monitor** session (portal), via the `functional_test.mjs` cookie jar (mirror `mic-ritual`).

### (a) publish vM → update-available with correct diff
- **Action:** POST `/api/operator/content/publish` (provider) with `{ fromVersion: 1 }` → master snapshot becomes `ContentPack v2`. GET `/api/operator/content` per client → for tenant `T` returns `{ currentVersion: 1, availableVersion: 2, updateAvailable: true, diff: { added, changed, conflicts, removed } }`.
- **Assert:** `updateAvailable === true`; diff counts EXACTLY the 2.4 sets — added `standards:1/processAreas:1/requirements:1/controls:1/mappings:1`; changed length 1 (CT1); conflicts length 1 (CT3); removed includes CT2 + MP2. `currentVersion === 1`, `availableVersion === 2`.
- **Negative:** a second publish of an identical snapshot must yield a **new** immutable `ContentPack v3` (no silent overwrite / no in-place mutate) — assert the v2 rows are byte-stable after v3 exists (immutability).

### (b) adopt → baseline = vM; client data row-identical
- **Action:** POST `/api/operator/content/adopt` (provider) `{ companyId: T, toVersion: 2, dryRun: false }`. Re-read tenant content baseline version.
- **Assert:** tenant `contentVersion === 2`; tenant content rows now equal pack-v2 for ADDED/CHANGED/REMOVED sets (CT1 statement updated, CT3 statement = master v2, ST3/PA3/R3/CT4/MP4 present, CT2 exists as superseded); **`before.checksum === after.checksum`** for the client-data tables (audits/findings/actions/evidence/conclusions/controlAssignments) — i.e. *zero* client-data rows changed.

### (c) superseded read-only, link intact
- **DB assert:** CT2 is NOT hard-deleted. It exists with a **superseded/read-only marker** (e.g. `supersededAt` set, and/or a new `ContentStatus=Superseded` column on Control/Requirement/Standard). Its FK from F2 (and any ControlAssignment/evidence) is **unchanged and intact** (join still resolves). All client-facing read surfaces (portal finding list, evidence, export) omit superseded rows from *editable* controls; the record still resolves by link.

### (d) audit entry carries diff; client notified; export shows version
- **Audit:** exactly one `CONTENT_PACK_ADOPT` ActivityLog row for tenant `T` whose payload includes the **full diff JSON** (added/changed/removed/conflicts) attached (SAMS-015-style content column / refRecord carries the pack version). Assert the stored payload deep-equals the diff the operator previewed.
- **Notify:** `CONTENT_UPDATE_AVAILABLE` (or `ContentPackAdopt`) in-app Notification row created for tenant `T` client monitors (recipientUserIds = client Admin/Assessor with T); `notificationDelivery`/webhook receiver on :3999 received the notice once. Client monitor portal shows the banner (asserted in (f)).
- **Export:** GET the client data export for `T` → the manifest includes `contentVersion: 2` (new `EXPORT_TABLES`/manifest field); superseded CT2 is excluded from the *active* control set but the export — where it references CT2 — keeps the link.

### (e) conflict: listed in diff + flagged in audit entry
- **DB assert:** the `CONTENT_PACK_ADOPT` audit payload's `conflicts` array names CT3 (changed-elsewhere); CT3's tenant row **was** updated to master-v2 (adoption applies the master version), and a per-entity conflict flag/note is recorded (e.g. `conflictReason: "changed-elsewhere"`). The diff preview in (a) that the operator saw ALSO listed CT3 under conflicts before adopting.

---

## 4. UI driven test (browser)

`scripts/content-rollforward/ui_drive_test.mjs` (Playwright-core + system Chromium, mirror `mic-ritual/ui_drive_test.mjs`; login helper).

### (f) publish → diff → adopt → client banner acknowledge
1. **Operator** (provider) login → `/operator` → tenant `T` row shows `Content v1 · update available v2` → click **Review diff** → page shows added/changed/conflicts/removed (CT1 changed, CT3 conflict, CT2 removed) → click **Adopt** → success toast + `Content v2`.
2. Persist a client monitor session.
3. **Client monitor** login → portal overview shows **banner "Content update v1→v2 available"** (until acknowledged) → click **Acknowledge** → banner dismisses (acknowledgment persisted; re-login → banner stays dismissed). Assert the notification record's acknowledgedAt is set.
4. `verify_step.ts` (DB lens) re-asserts (b)/(c)/(d)/(e) after the UI drive.
5. **UX audit (minimal):** the operator's per-client version + diff surfaces the change (present, not hunted); the client banner is served with a clear "what changed" link — satisfied by the same flow.

---

## 5. Migration + project gates (all must be green in the SAME run)

1. **Migration additive + idempotent** — apply `20260904_add_content_pack.ts` ×2 to a throwaway DB; second run no-ops (no error, no duplicate); `db:parity` clean. `prisma generate` succeeds; generated client committed.
2. `npm run tsc` — 0 errors.
3. `npm run build` — succeeds.
4. `npm run test:isolation` — pass (new content models must NOT drift the route/model isolation matrices; the ContentPack tables are company-scoped and must be added to the isolation matrix if company-scoped, or proven global like ActivityLog with the rationale documented).
5. `scripts/db_parity.sh` — no drift beyond the known deferred-KB FK note.
6. **Docs in same change:** `SAMS_APP_DESIGN.md` changelog (Feature D) + `docs/content-rollforward.md` (diff algorithm, stable-key correlation, superseded/superceded marker, conflict = changed-on-both-sides definition).

---

## 6. Evidence bundle (attached to review handoff)

`run.sh` prints, and the handoff `metadata` carries, the **exact command + tail of output** for each: migration ×2, tsc, build, db:parity, test:isolation, functional (a–e) `N/M`, verify_step `N/M`, ui_drive (f) `N/M`, plus `before.checksum`/`after.checksum` and the recorded diff JSON. No evidence → no review request (owner gate).

---

## 7. Explicit non-goals (must NOT be built — guard against creep)
Client-side content editing · auto-sync · hard-delete of referenced content · per-entity merge UI · changing client audits/findings/actions/evidence rows. Any of these appearing in the diff is a review FAIL.
