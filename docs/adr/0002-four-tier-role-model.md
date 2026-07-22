# ADR-0002: Four-Tier Role Model for API Authorization

**Date:** 2026-07-22  
**Status:** Accepted  
**Replaces:** ADR-0001 (partial — adds Superuser role to existing 3-tier model)

## Context

The SAMS app originally had 3 roles: Admin, Assessor, Interviewee. All authenticated users could perform any mutation (create/edit/delete assessments, findings, samples, actions). This created a security gap — an Interviewee could technically delete findings or modify assessments.

We needed to:
1. Restrict destructive mutations to authorized roles
2. Separate "can manage system" (Admin) from "can manage assessment data" (Superuser)
3. Allow Assessors to create findings and actions but not delete or modify assessment structure
4. Log all key mutations for auditability

## Decision

### Four-tier role model

| Role | API Access | Rationale |
|------|-----------|-----------|
| **Admin** | All APIs (system config: users, backlog, database, backfill) | Full system control |
| **Superuser** | Assessment mutation APIs (create/edit/delete assessments, samples, activities, control assignments) | Can manage assessment data but not system config |
| **Assessor** | Read assessment data + create findings/actions + complete assessments they're linked to | Can do their job but can't delete or restructure |
| **Interviewee** | `/api/my/interviews` only | Least privilege — only sees their assigned interviews |

### Per-route auth enforcement

Auth is enforced via wrapper functions in `src/lib/authz.ts`:
- `requireAdmin()` — Admin only
- `requireSuperuser()` — Admin or Superuser
- `requireAssessor()` — Admin, Superuser, or Assessor
- `requireAuth()` — Any authenticated user

Each route.ts calls the appropriate wrapper at the top of every handler. No middleware — this keeps auth logic co-located with the route it protects and avoids edge runtime restrictions.

### Activity logging

All key mutations write to the existing `ActivityLog` table via `logActivity()` helper:
- Assessment creation
- Finding creation
- Action creation
- User creation/deletion

The ActivityLog model already existed in the schema; this ADR standardizes its usage.

## Consequences

- **Positive:** Clear role boundaries. Interviewees can no longer mutate data. Audit trail exists for all key operations.
- **Positive:** Per-route wrappers make auth easy to audit — looking at a route file immediately tells you the required role.
- **Negative:** New routes must remember to add the wrapper. Mitigated by code review and the fact that omitting auth now throws a build error (no more `import { auth }` available in most route files).

## Alternatives Considered

- **Middleware-based auth:** Rejected because edge runtime limitations prevent Prisma usage, making company-scoped access checks impossible in middleware.
- **Role-based access in schema:** Rejected because Prisma doesn't support row-level security. Auth must be enforced at the application layer.
