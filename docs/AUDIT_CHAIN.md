# Audit Chain (SAMS-015, Phase 4 Feature C)

**Status:** Implemented (Cody, 2026-09-04) · **Owner:** Conan (design authority) · **Feature:** Tamper-Evident Audit Trail — per-company hash chain + client-held weekly anchors.

---

## 1. What it is

The ActivityLog is a **global** audit log by design (`docs/ISOLATION_MODEL.md`) — it is not part of the client-data export and is deliberately company-agnostic at the read surface. To make the *trust story* survive a skeptical auditor or a hostile operator, SAMS-015 adds a **per-company cryptographic hash chain** over the ActivityLog plus a **client-held weekly anchor**:

```
chainHash(row) = sha256(prevChainHash ‖ canonical(row))
```

where `canonical(row)` is a pinned, deterministic serialization of the row's fields. If any stored row is edited or deleted, the recomputed chain breaks at exactly that row — so a company can **prove** its trail was not silently rewritten by the operator. The weekly digest webhook post appends the current chain-head hash (`auditAnchor`), so the **client holds an independent copy** that the operator cannot recompute silently.

## 2. Per-company discriminator vs a "global log"

The ActivityLog **remains a global log** — no read surface changes. The chain only needs a per-company discriminator so company A can verify its own trail without touching company B's rows. So the schema adds **two nullable columns**:

| Column | Kind | Meaning |
|---|---|---|
| `ActivityLog.companyId` | `String?` (indexed) | The owning company. `null` = **chainless** (global / provider-side operator event, or a row whose `refTable`/`refRecord` no longer resolves to a company). |
| `ActivityLog.chainHash` | `String?` (indexed) | `sha256(prevChainHash ‖ canonical(row))`. `null` for chainless rows. |

Company attribution is resolved from the row's `refTable` → `refRecord` to its owning company (Assessment→companyId, User→companyId-or-first-userCompany, Finding→assessment.companyId, Action→finding.assessment.companyId, EvidenceRequest→companyId, ApiKey→companyId, Control→companyId, Company→self). Rows that resolve to no company are **chainless** (excluded from every chain). **Note:** `ActivityLog` was added to `scripts/isolation/model_matrix.json` (`scope: direct/companyId`) because the isolation suite's drift detector flags any model that declares a `companyId` column but has no matrix entry — this is a matrix bookkeeping entry, **not** a change to the read model: the log stays global by design.

## 3. Pinned canonical form + ordering (Conan condition #2/#3)

These are **binding** — the writer, the backfill, the verify CLI and the anchor ALL use the same helpers in `src/lib/audit-chain.ts`:

- **Canonical field set** (in this order, joined with U+2016 `‖`):
  `id, timestamp, description, activityType, username, refTable, refRecord, beforeData, afterData, companyId`
  - `timestamp` is the column value, serialized as ISO‑8601 UTC.
  - `beforeData`/`afterData` are canonicalized with a **sorted-key stable stringify** (`stableStringify`): object keys are sorted recursively, arrays preserve order, `null`/`undefined` → `"null"`. This makes the serialization independent of JSON key insertion order.
  - `null` scalars (`refTable`, `refRecord`, `companyId`) serialize as `""`.
- **Ordering:** `(createdAt, id)` ascending — identical in writer, backfill, verifier.
- **Hash:** `chainHash = sha256(prevChainHash ‖ canonical)`, first row of a chain has `prevChainHash = ""`.

## 4. Concurrency (Conan condition #4)

A chain write runs inside a **single transaction** that:
1. Takes a per-company Postgres advisory **xact lock** — `SELECT pg_advisory_xact_lock(hashtext(companyId))` — which serializes all concurrent writes to the same company's chain. This also covers the **empty-chain first write** (when no head row exists yet, `FOR UPDATE` locks nothing, so the advisory lock is what prevents two rows both claiming `prevChainHash=""`). It releases automatically at commit/rollback.
2. Reads the current head row `FOR UPDATE` (`ORDER BY createdAt DESC, id DESC LIMIT 1`).
3. Computes the new `chainHash` and inserts the row in the same transaction.

The `$executeRawUnsafe` is used for the advisory lock (not `$queryRaw`) because `pg_advisory_xact_lock` returns `void`, which Prisma cannot deserialize as a row set.

## 5. Verify CLI

```
npx tsx scripts/verify-audit-chain.ts <companyId>
```

Auditor-facing. Recomputes the company's chain from scratch (same canonicalization + ordering) and:
- **exit 0** + `OK — <name> (<id>) audit chain verifies (N row(s))` when every link verifies;
- **exit 1** + `FAIL — first broken link at ActivityLog row id '<id>'` on the **first** broken row;
- **exit 2** + a usage/error message for **no argument** or an **unknown companyId**.

It reads only `WHERE companyId = <input>` rows, so company A's verify never touches company B's rows (per-company scope by construction). A company with no chain rows (all its rows global/chainless) verifies as `ok=true, count=0`.

## 6. Weekly anchor (client-held copy)

`runWeeklyDigest()` in `src/lib/notifications-outbound.ts` computes the company's current chain-head hash (`getChainHeadHash(companyId)`) and appends it to the digest webhook post as `auditAnchor`:

```
POST <company.webhookUrl>   { "text": "<digest card>", "auditAnchor": "<sha256 hex>" }
```

- `postCompanyWebhook` gained an optional `extra` payload field (`{ text, ...extra }`) so the anchor rides the existing SAMS-009 transport without affecting the other webhook posts (evidence-request/comment/sweep/test — those pass no `extra`).
- `auditAnchor` is **per-company** — company A's post carries only A's chain-head hash; the client holds an independent copy that a DB-adversary cannot silently recompute after rewriting a row (the client's anchor won't match a tampered chain).
- A delivery audit row (`NotificationDelivery`) is recorded as before.
- `auditAnchor` is `null` when the company's chain is empty. This never appears in API responses, exports, or in-app notifications — it is only in the outbound webhook body.

## 7. Write-path surface

Every ActivityLog write routes through `createChainedActivityLog` in `src/lib/audit-chain.ts`:

| Write path | Route / helper | Chain behaviour |
|---|---|---|
| `logActivity` (`src/lib/activity-log.ts`) | used by evidence-requests, api-keys, retention, export, management-response, operator, findings | resolved from `refTable`/`refRecord` → chained when resolvable |
| `logActivity` (`src/lib/authz.ts`, raw-INSERT predecessor) | used by admin/assessments, findings, users, actions, evidence-extraction, evidence-confirm | mapped to entry shape → chained when resolvable |
| `admin/reset-health` (`src/app/api/admin/reset-health/route.ts`) | direct create predecessor | `refTable=Control`, no `refRecord` → **chainless** (global reset, `companyId null`, `chainHash null`) |

Logging is fire-and-record — it never throws (returns `null` on failure) so a failed audit write can never fail an upstream request.

## 8. Backfill migration + resolution stats

`scripts/db/migrations/20260904_add_audit_chain.ts` (additive, idempotent, **no `prisma db push`**):
1. Adds the two columns + indexes (`ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`).
2. Backfills `companyId` for every row still `companyId IS NULL`, in **keyset batches** (cursor by `(createdAt, id)`, resumable — re-running skips already-assigned rows). Per-refTable company resolution is batched into `IN` queries.
3. Computes the per-company chain in `(createdAt, id)` order.
4. Emits **per-refTable resolved / unresolved resolution stats** plus the total unresolved share. An unresolved row is a **global / non-resolvable** event and stays chainless. If the unresolved share on prod data is large enough to matter, it is surfaced in the review handoff (this reopens the "chainless rows" design decision).

Idempotence is proven ×2 (both runs exit 0) and the chain recompute is deterministic — the same inputs always produce the same `chainHash`.

## 9. Layout

| File | Purpose |
|---|---|
| `scripts/db/migrations/20260904_add_audit_chain.ts` | Additive schema + backfill + resolution stats |
| `src/lib/audit-chain.ts` | Shared chain engine (canonicalize / compute / resolve / chained write / verify / head) |
| `scripts/verify-audit-chain.ts` | Auditor-facing verify CLI |
| `src/lib/activity-log.ts`, `src/lib/authz.ts`, `src/app/api/admin/reset-health/route.ts` | Write paths routed through the chained insert |
| `src/lib/notifications.ts`, `src/lib/notifications-outbound.ts` | `extra` payload + `auditAnchor` in the weekly digest |
| `scripts/audit-chain/{seed.ts, functional_test.mts, webhook_receiver.mjs, start_test_server.sh}` | Harness (owner DoD a–f) |
| `scripts/isolation/model_matrix.json` | `ActivityLog` matrix entry (bookkeeping, not a read-model change) |
