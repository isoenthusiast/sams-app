# SAMS Isolation Model

**Version:** 1.0.0 · **Status:** Client-shareable invariant · **Part of:** Data Trust Gate (SAMS-003, Phase 1 — signability)

This document states the **tenant-isolation invariant** that every SAMS deployment
must uphold, and how it is **provable** (an executable suite, not prose). An
external client (and their auditor) may reference this document and the runnable
proof to confirm that one company's data cannot leak to or from another.

> The authoritative, executable proof is the **tenant isolation test suite**:
> `npm run test:isolation` (see [Running the proof](#running-the-proof)). This
> document describes the invariant that suite enforces.

---

## 1. The invariant

For the SAMS multi-tenant model, the invariant is:

> **Every company-scoped table carries a `companyId` (or is reached exclusively
> through a declared relation to a row that does). No code path reads or writes a
> company-scoped row without first resolving the operating company, and that
> resolution always reaches one specific company — never "all" in a client context.**

The invariant is enforced at two layers:

| Layer | What it guarantees |
|---|---|
| **Application layer** | `src/lib/authz.ts` resolves the operating company from `?companyId=` (primary) with a cookie fallback (`selectedCompanyId`), then every company-scoped query is filtered by that company's id. |
| **Data layer** | Company-scoped tables carry a `companyId` FK/column; models without a direct column are scoped **by relation traversal** (documented in §3) so a query can never join across tenants. |

## 2. How company context is resolved

The operating company is resolved in this order (primary → fallback):

1. **`?companyId=` URL query param** (primary) — the company selectors navigate with
   `?companyId=<id>`; the value is validated against the current user's membership
   before it is trusted and persisted.
2. **`selectedCompanyId` cookie** (fallback) — a fallback for a fresh load that
   carries no param. It is **server-set** on every company-context switch and
   validated server-side (`hasCompanyAccess`) — it is never trusted blindly.

`getCompanyWhere()` returns a Prisma `where` clause scoped to the resolved
company; an authenticated user with **no** resolved company receives an empty
result set (never a cross-tenant fallback), except Admins in global admin views.

**Authorization** (`hasCompanyAccess`): an `Admin` passes for any company; any
other role must have a `UserCompany` mapping row to that company (or a matching
`User.companyId`).

## 3. Company-scoped tables & their proof path

Every company-scoped Prisma model is enumerated — with the scoping path (`direct`
`companyId` column, or `traverse` through a declared relation) — in the suite's
**model matrix** (`scripts/isolation/model_matrix.json`). A model missing from the
matrix, or a new company-scoped model added without an entry, **fails the suite**
(coverage by construction).

Representative scoping paths:

| Table / model | Scoping path |
|---|---|
| `Standard`, `ProcessArea`, `SubProcess`, `Control`, `Assessment`, `Requirement`, `Document`, `Knowledgebase`, `Tag`, `Department`, `User`, `Attachment`, `BacklogItem`, `AuditChecklistTemplate`, `GamificationStage` | direct `companyId` column |
| `Finding` | `assessment.companyId` |
| `Action` | `finding.assessment.companyId` |
| `Sample`, `ControlAssignment`, `AssessmentAssessor`, `RequirementConclusion` | `assessment.companyId` |
| `MapControl2Requirement`, `ControlSubProcess` | `control.companyId` |
| `Position` | `department.companyId` |
| `Risk`, `RiskCategory` | `processAreaId` (process-area subquery) |
| `RiskMetrics` | `risk.processAreaId` (process-area subquery) |

The **route matrix** (`scripts/isolation/route_matrix.json`) enumerates every
isolation-relevant API route (every `src/app/api/admin/**` route except the
documented global/infra exemptions e.g. whole-DB backup/restore, auth, health,
webhooks, operator). A new company-scoped route that ships without a matrix entry
**fails the suite**.

## 4. The provider plane (read-only, audited)

Provider staff (`session.user.providerRole` = `ProviderAdmin` | `ProviderConsultant`)
operate on a **read-only** plane (Phase 0, SAMS-002):

- **Per-company iteration** — the operator `portfolio` reads each company's data by
  iterating company ids; there is no cross-tenant aggregate query that would mix
  companies in a client context.
- **Audit-logged context switches** — every provider company-context switch writes a
  `PROVIDER_CONTEXT_SWITCH` `ActivityLog` row (before = old company, after = new
  company). The suite asserts this reference row exists.

## 5. The SAMS001 shared-master-data exception

The **SAMS001** company is the canonical master-data library (Standards, Process
Areas, Requirements, Controls). Newly onboarded companies adopt a **copy** of that
master data via the admin *Bootstrap* flow (`/api/admin/company/[id]/bootstrap`),
which **copies** (never shares pointers) master rows into the new company's
`companyId` namespace. After onboarding, a company's master data is its **own**
scoped copy — the invariant holds. The exception is documented so it is never
mistaken for a leak: bootstrap is a deliberate, audited **copy-from**, and it is
the **only** path that reads from SAMS001 to populate another tenant.

## 6. The client-data export (no credential material)

The client export (`GET /api/admin/companies/[id]/export`) produces a **per-company**
ZIP of CSVs + `manifest.json`. It **never** reuses the whole-DB backup route (which
spans tenants). A hard-coded **exclusion list** (`EXCLUSION_COLUMNS`) strips password
hashes, token/session/secret columns, and `ActivityLog` `beforeData`/`afterData` raw
payloads — and the suite's export scan asserts **zero** credential material and
**zero** other-tenant rows in a company-A export.

## 7. Retention & deletion

Companies follow **archive → 30-day safety net → confirmed hard delete** (`archive`
→ `schedule-delete` → `reinstate`). An archived company is hidden from selectors and
its users cannot log in; its data is fully retained and exportable. Hard delete is a
**manual** script (`scripts/db/company_hard_delete.ts`) that refuses unless the
safety net has expired and a fresh export (verified by manifest) exists — there is
**no** automated/cron deletion path.

---

## Running the proof

Prereqs: a `DATABASE_URL` pointing at a **throwaway** Postgres database (the suite
seeds its own two-company fixtures and never touches real companies).

```bash
# build the throwaway schema (never `prisma db push` on the shared prod DB)
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script | psql "$DATABASE_URL"
# apply the additive migrations
npx tsx scripts/db/migrations/20260903_add_user_provider_role.ts
npx tsx scripts/db/migrations/20260904_add_company_archive_columns.ts
# run the proof
npm run test:isolation
```

A green run asserts: no route/model matrix drift; every cross-tenant read is
rejected (A-scope returns zero B rows); provider-plane per-company iteration +
audit reference; and a zero-credential / zero-other-tenant export.
