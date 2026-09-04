# Master Content Roll-Forward (SAMS-016)

**Feature:** Phase 4, Feature D — versioned content packs + the provider adopting on
the client's behalf. Only the **content baseline** moves; the client's own record
(assessments/findings/actions/evidence/conclusions/controlAssignments) is never
touched.

- **Design spec source:** `docs/conan/CONAN_Phase4_Signature_Design.md` (Feature D,
  frozen at gamified-plant d9f627e).
- **Owner test plan:** `TestPlan/SAMS-016_TEST_PLAN.md` (approved by Conan, 2026-09-04).

---

## What this adds

| Surface | Behaviour |
|---|---|
| **Master publish** | `POST /api/operator/content/publish` snapshots the SAMS001 master content into an **immutable** `ContentPack` (next version). A publish NEVER mutates a prior pack. |
| **Operator content status** | `GET /api/operator/content` returns each client's `currentVersion`, `availableVersion`, `updateAvailable` and the **diff** (added / changed / conflicts / removed) they preview before adopting. |
| **Operator adopt** | `POST /api/operator/content/adopt` applies the diff to the tenant's **content** tables by stable key (never wipe-and-reload), marks removed-but-referenced content Superseded, audits the adoption **with the diff attached**, and notifies the client (in-app + portal banner until acknowledged). Rejects `toVersion !== availableVersion` (400) so **preview = applied = audited**. |
| **Client banner** | `GET /api/portal/content/banner` + `POST /api/portal/content/acknowledge` — a notice of the APPLIED baseline change, dismissible and persisted across re-login. |
| **Export** | The client-data export manifest now carries `contentVersion` (the tenant's adopted baseline). |

---

## The stable cross-tenant keys (the correlation)

`runBootstrap` re-ids tenant content (row ids / rIds are remapped), so the ONLY
identity that survives master→tenant is the **stable key**. The diff and the
selective apply both correlate on these:

| Entity | Stable key | Notes |
|---|---|---|
| Standard | `Standard.standard` | `@@unique([standard, companyId])`. |
| ProcessArea | master `name` | The tenant row is the bootstrap-prefixed copy `[<companyID>] <name>`, so the **tenant key** is the name with the `[<…>] ` prefix stripped. |
| Requirement | `requirementId` | `@@unique([requirementId, processAreaId, companyId])`; keyed `<paKey>:<requirementId>` to disambiguate across process areas. |
| Control | `controlRef` | When null, fall back to `<paKey>:<name>`. |
| Mapping | `<controlKey>:<requirementKey>` | Junction resolved via control + requirement joins. |

The pack snapshot normalizes every entity to this key; `readTenantContent` builds
the same maps on the tenant side, so master↔tenant correlate exactly.

## Diff algorithm

For each entity type, three maps are compared: **new pack (vM)**, **prior pack (the
version the tenant last adopted)**, and the **tenant's live content**.

1. **Added** — in the new pack, not in the prior pack. Adopt creates it (selective
   apply by stable key).
2. **Changed** — in BOTH packs but content differs, AND the tenant row still equals
   the prior pack value (the client did not edit it). Adopt applies the new value
   silently.
3. **Conflict (changed-elsewhere)** — in both packs, content differs, AND the tenant
   row differs from the prior pack value (the client edited it). Adopt applies the
   **master** value and flags the entity in the audit entry with
   `conflictReason: "changed-elsewhere"`.
4. **Removed** — in the prior pack, not the new pack. If the tenant still holds the
   row, it is **Superseded** (read-only), never hard-deleted.

The diff is **content-only**: it compares the fields `runBootstrap` actually copies
(so a control's `pId`/`standard` and a process area's `name`/`standard`/`pId` are
excluded from the comparison — they are identity/not-copied, not content). This
prevents false "changed"/"conflict" on every row.

## Superseded content

The adopt path marks removed-but-referenced content `contentStatus = Superseded` +
sets `supersededAt`. Superseded rows:
- are **never hard-deleted** (client's FK links keep resolving),
- are **excluded from the editable/active content sets** — every control library,
  new-assignment picker, setup page and template-adopt target query spreads the
  shared `ACTIVE_CONTENT_WHERE = { contentStatus: "Active" }` filter
  (`src/lib/content-rollforward.ts`), so dead content can never be assigned to
  NEW work,
- still resolve by link (e.g. a finding's control assignment; the existing-data
  display paths stay deliberately UNFILTERED so the FK link never breaks).

Additive columns on `Standard` / `ProcessArea` / `Requirement` / `Control`
(`contentStatus`, `supersededAt`) are delivered in the SAME additive migration.
Junction rows (mappings/templates) are content links, not client data, so removed
ones may be dropped; the removed-mapping handler deletes ONLY the specific stale
link (never a blanket wipe).

## Client-data guarantee (the sacred record)

Adoption writes ONLY to the content tables + `CompanyContentState` + `ActivityLog`
(audit) + `Notification`/`NotificationDelivery` (notice). It NEVER writes an
Assessment, Finding, Action, Attachment (evidence), RequirementConclusion or
ControlAssignment row. The functional test's `before.checksum === after.checksum`
proves it empirically (full-row canonical checksum over those six tables).

## Isolation / scoping decision

- **`ContentPack`** is **MASTER-PLANE** — only SAMS001 publishes one; `companyId` is
  the master publisher and behaves like a global/master model (not tenant-scoped).
  Adopting a pack copies its snapshot INTO a tenant's own content tables; it is not
  readable/writable through a tenant context. Documented in the isolation
  `model_matrix.json` as `scope: direct companyId` with a master-plane label.
- **`CompanyContentState`** is **TENANT-scoped** — one row per company (unique
  `companyId`), tracking the adopted `contentVersion` + the banner acknowledgment.

## Non-goals (guard against creep)

Client-side content editing · auto-sync · hard-delete of referenced content ·
per-entity merge UI · mutating client audits/findings/actions/evidence.
