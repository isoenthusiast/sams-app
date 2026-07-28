# Test Plan — Org Chart Sort Order + Level Colors

**Feature:** Drag-and-drop sibling reorder in list view with depth-based color coding
**Date:** 2026-07-29

---

## Schema & Data

| ID | Action | Expected | Log |
|----|--------|----------|-----|
| T1 | `ALTER TABLE "User" ADD COLUMN "sortOrder" INTEGER DEFAULT 0` | Column added, all rows default to 0 | |
| T2 | Run backfill: `ROW_NUMBER() OVER (PARTITION BY "managerUsername" ORDER BY name)` | Each sibling group gets sequential 0,1,2... | |
| T3 | `prisma db push` after schema change | No errors, Prisma Client regenerated | |
| T4 | Query: `SELECT DISTINCT "managerUsername", COUNT(*) FROM "User" GROUP BY 1 ORDER BY 2 DESC LIMIT 5` | Largest sibling groups have sequential sortOrders | |

## API

| ID | Action | Expected | Log |
|----|--------|----------|-----|
| T5 | `PUT /api/admin/users/[id]/reorder { direction: "up" }` on middle sibling | sortOrder swaps with sibling above | |
| T6 | `PUT /api/admin/users/[id]/reorder { direction: "down" }` on middle sibling | sortOrder swaps with sibling below | |
| T7 | `PUT .../reorder { direction: "up" }` on first sibling (sortOrder=0) | No change, returns 200 (no-op) | |
| T8 | `PUT .../reorder { direction: "down" }` on last sibling | No change, returns 200 (no-op) | |
| T9 | Reorder a user with no siblings (sole report) | No change, returns 200 | |
| T10 | Reorder across manager boundaries (hack attempt) | No change — query restricts to same managerUsername | |

## Org Chart API

| ID | Action | Expected | Log |
|----|--------|----------|-----|
| T11 | `GET /api/admin/org-chart` after reorder | Siblings returned in sortOrder sequence | |
| T12 | Verify `depth` field present and correct | L0=Khajavi, L1=direct reports, etc. | |

## UI — List View

| ID | Action | Expected | Log |
|----|--------|----------|-----|
| T13 | Open org chart list view | Rows color-coded by depth (amber/blue/emerald/violet/slate) | |
| T14 | Check L0 badge on Khajavi | `L0` pill visible next to name | |
| T15 | Check L1 badges on direct reports | `L1` pills visible | |
| T16 | Drag a row and drop on sibling | Rows swap, API called, order persists after refresh | |
| T17 | Drag across manager boundary | Drop rejected, no swap | |
| T18 | Drag topmost sibling up | No-op, row returns to position | |
| T19 | Mobile/tablet view | Drag works on touch devices | |
| T20 | Refresh page after reorder | New order persists | |

## Build

| ID | Action | Expected | Log |
|----|--------|----------|-----|
| T21 | `npx next build` | 0 TypeScript errors, 50+ pages compiled | |
| T22 | `npx prisma generate` | Client regenerated with sortOrder field | |
