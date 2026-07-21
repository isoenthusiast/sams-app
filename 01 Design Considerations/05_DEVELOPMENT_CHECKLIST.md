# SAMS App — Development Checklist

**Status:** Planning  
**Reference:** `01_DESIGN_CONTEXT.md`, `02_DATA_MODEL.md`, `03_UI_WIREFRAMES.md`, `04_USER_ROLES_AND_TEST_SCENARIOS.md`  
**Rule:** sams-app shares the seam-assurance-app database — **no schema changes, no new tables, same APIs, same auth**

---

## Phase 0 — Project Scaffolding ⬜

Foundation setup before any feature work.

- [ ] **0.1** Initialize Next.js 16.2.9 project (App Router, Turbopack, TypeScript)
- [ ] **0.2** Configure Tailwind CSS 4.x with design tokens from `03_UI_WIREFRAMES.md` §1 (colors, typography, spacing, radius, shadows as CSS custom properties)
- [ ] **0.3** Copy Prisma schema from `seam-assurance-app/prisma/schema.prisma` verbatim — verify `npx prisma generate` produces identical client
- [ ] **0.4** Configure `.env` with the **same** `DATABASE_URL` as seam-assurance-app
- [ ] **0.5** Copy auth config (`auth.config.ts`, NextAuth v5 JWT strategy, credentials provider, 8h maxAge, role validation) — verify login works with existing users (`admin`, `megan`, etc.)
- [ ] **0.6** Copy `src/lib/authz.ts` helpers (`requireAdmin`, `requireAuth`, `hasCompanyAccess`, `getSelectedCompanyId`, `getCompanyWhere`)
- [ ] **0.7** Set up middleware (`proxy.ts`) — block `/admin/*` for non-Admin, company-scoped data filtering
- [ ] **0.8** Smoke test: login as `admin` → query Control table → confirm company-scoped data renders
- [ ] **0.9** Smoke test: login as `megan` (Assessor) → confirm no `/admin` access, SMDS data only

**Exit criteria:** Both roles can log in and see their correctly-scoped data.

---

## Phase 1 — Design System & Component Library ⬜

Build reusable components per `03_UI_WIREFRAMES.md` §2. No pages yet — Storybook-style isolated development.

### 1A. Core Primitives
- [ ] **1.1** `Button` — 6 variants (primary/secondary/success/warning/danger/ghost), 3 sizes, loading state
- [ ] **1.2** `Card` — title/subtitle/actions slots, padding & shadow options
- [ ] **1.3** `Badge` — 5 variants, 2 sizes
- [ ] **1.4** `Input` — label, error, helperText, required indicator, `aria-describedby`
- [ ] **1.5** `Select` — label, options, error state
- [ ] **1.6** `Modal` — focus trap, `Escape` to close, focus returns to opener, `role="dialog" aria-modal`
- [ ] **1.7** `Table` — sortable columns, custom renderers, pagination, empty state, loading skeleton
- [ ] **1.8** `Toast` / `StatusBar` — success/error transient messages (reuse pattern from seam StatusBar)

### 1B. Domain Components
- [ ] **1.9** `HealthIndicator` — 🟢/🟡/🔴 with text label ("85% Healthy"), `role="img" aria-label`
- [ ] **1.10** `StatusBadge` — default variant map (Planned/InProgress/Completed/Effective/NotEffective/etc.)
- [ ] **1.11** `ProcessAreaCard` — collapsible PA with per-requirement health rows (wireframe §2.2)
- [ ] **1.12** `RequirementCard` — expandable card with controls table, drag-drop target, +Add Control
- [ ] **1.13** `MappingPanel` — side-by-side unmapped↔requirements panel with checkbox filter, click-to-assign, dropdown bulk assign (port from seam-assurance-app, replace `truncate` with `whitespace-normal break-words`)
- [ ] **1.14** `AssessmentCard` — status badge, counts, continue link
- [ ] **1.15** `FindingCard` — severity chip, actions sub-list, edit/add-action buttons
- [ ] **1.16** `GamificationPanel` — points, streak, badges, next-badge progress, leaderboard top-3 + own rank
- [ ] **1.17** `KnowledgebasePanel` — entry list, search, content viewer, upload
- [ ] **1.18** `AttachmentList` — upload (drag-drop + picker), download, delete (port from seam)
- [ ] **1.19** `UserSearchSelect` — searchable user picker (port from seam)
- [ ] **1.20** `CompanySelector` — combobox with auto-hide logic: `userCompanyCount > 1 || role === "Admin"`

### 1C. Hooks & Utilities
- [ ] **1.21** `useCompany()` — reads `selectedCompanyId` cookie + provides company context (replaces cookie polling)
- [ ] **1.22** `useSession()` wrapper — typed session with `role`, `id`
- [ ] **1.23** `formatDate` utility (copy from seam `src/lib/formatDate.ts`) — **grep all consumers after copying** (Lesson #9, 2026-07-14)
- [ ] **1.24** `logActivity` helper (copy from seam `src/lib/activity-log.ts`)

**Exit criteria:** All components render in isolation with mock data; accessibility attributes verified.

---

## Phase 2 — Navigation & Layout ⬜

Role-aware chrome per `03_UI_WIREFRAMES.md` §3.

- [ ] **2.1** `NavBar` — role-aware links:
  - Admin: `Dashboard(→/admin) | Setup | Admin | Help`
  - Assessor: `Dashboard(→/fla) | My Work | Knowledgebase | Help`
- [ ] **2.2** Integrate `CompanySelector` into NavBar — hidden for single-company users (`aisyah`, `denry`, `megan`, `paul`, `presca`, `tecklee`)
- [ ] **2.3** Role-based landing redirect after login: Admin → `/admin`, Assessor → `/fla`
- [ ] **2.4** Admin sidebar layout — persistent left nav: Overview, Database, Users, Requirements, Badges, Knowledgebase, Templates
- [ ] **2.5** Mobile layout — hamburger menu (xs/sm), bottom tab bar for assessor pages (Dashboard / My Work / KB / Help)
- [ ] **2.6** Responsive breakpoints per `03_UI_WIREFRAMES.md` §7 (xs < 640, sm 640–768, md 768–1024, lg 1024–1280, xl > 1280)
- [ ] **2.7** Skip-to-content link + keyboard navigation pass (Tab order, focus indicators)

**Exit criteria:** Test scenario A1 (admin sees selector + all companies) and E1 (megan sees no selector) pass.

---

## Phase 3 — Assessor Pages ⬜

Per `03_UI_WIREFRAMES.md` §3.1. Assessor role only (`megan`, `paul`, `tecklee`, `presca`, `denry`, `regina`).

### 3A. Dashboard (`/fla`)
- [ ] **3.1** Process Health panel — collapsible by Standard, `HealthIndicator` per PA, click → PA detail
- [ ] **3.2** Quick Actions panel — + New Assessment, My Open Actions, Upload Evidence
- [ ] **3.3** My Active Assessments list (`AssessmentCard`)
- [ ] **3.4** `GamificationPanel` sidebar — points from `SUM(PointTransaction.points)`, exclude username "admin" from leaderboard

### 3B. Assessment Workflow (`/fla/[id]`, 5 tabs)
- [ ] **3.5** Tab 1 Overview — metadata, progress counts, Complete/Edit actions
- [ ] **3.6** Tab 2 Control Assignment — PA→Requirement→search filter chain (wildcard `*` regex), checklist, assigned panel grouped by requirement
- [ ] **3.7** Tab 3 Sample Selection — per-control sample forms, status/conclusion selects, `AttachmentList`
- [ ] **3.8** Tab 4 Finding & Actions — `FindingCard` list, severity chips, action assign via `UserSearchSelect`, actionId ACTID-XXXXXX
- [ ] **3.9** Tab 5 Activities — Aact CRUD with AActUsers/AActControls mapping (uses ASSESSOR_WRITABLE_TABLES whitelist endpoints)

### 3C. Browse Pages
- [ ] **3.10** `/setup/process-areas` — search box, standard filter dropdown, `ProcessAreaCard` list with per-requirement health
- [ ] **3.11** `/setup/processdetails/[id]` — 4 tabs: Overview, Requirements & Controls, Assessments, Knowledgebase
- [ ] **3.12** Requirements & Controls tab — `RequirementCard` list with drag-and-drop control re-mapping + keyboard alternative (Ctrl+↑/↓ or "Move to ▾" dropdown)
- [ ] **3.13** `MappingPanel` integration — 🗂 Map Controls toggle, one-click assign, bulk assign, exit mode
- [ ] **3.14** Knowledgebase tab — `KnowledgebasePanel` + AI chat (`POST /api/chat/knowledge`), upload for admins only
- [ ] **3.15** `/setup/controls` — 28-field `ControlForm` (port from seam with `onSaved` callback pattern)

### 3D. Tablet Optimization (field use)
- [ ] **3.16** Sample entry — large touch status buttons (Tested / Not Tested / In Progress as tappable cards per wireframe §4.2)
- [ ] **3.17** Camera capture — `📷 Take Photo` attachment flow (`<input type="file" accept="image/*" capture="environment">`)
- [ ] **3.18** Offline indicator — detect `navigator.onLine`, show banner, queue mutations
- [ ] **3.19** Voice-to-text for finding description (`webkitSpeechRecognition`, progressive enhancement)

**Exit criteria:** Test scenarios E1–E6 (megan full workflow) and F1–F4 (paul tablet) pass.

---

## Phase 4 — Admin Pages ⬜

Per `03_UI_WIREFRAMES.md` §3.2. Admin role only.

- [ ] **4.1** `/admin` Overview — stat tiles (tables, users, controls, requirements, assessments, findings, actions, KB entries), quick actions, recent activity feed
- [ ] **4.2** Database section — table browser (45 tables, ANALYZE + pg_stat counts), backup download, restore upload with confirm, sync check, SAMS relational exports (controls/requirements CSV+JSON)
- [ ] **4.3** Users section — user CRUD, `UserCompany` assignment grid, role management
- [ ] **4.4** Requirements section — Standard→ProcessArea tree, natural-sort table, inline editor, Associated Controls panel
- [ ] **4.5** Badges section — generate, clear, definitions
- [ ] **4.6** Knowledgebase section — upload (.docx/.pdf/.md/.txt/.csv via `/api/convert`), search, preview, download
- [ ] **4.7** Templates section — template list/editor, Adopt Templates with Proceed/Cancel confirmation, company-aware
- [ ] **4.8** Activity Log viewer — filter by type, before/after JSON, ↩ Revert for MapControl2Requirement changes

**Exit criteria:** Test scenarios A1–A8 (admin), B1–B3 (edward multi-company), C1–C3 (aisyah single-company) pass.

---

## Phase 5 — Gamification Integration ⬜

- [ ] **5.1** Points toast on assessment complete ("+50 points! 🎉")
- [ ] **5.2** Badge unlock modal ("Badge Unlocked: First Assessment! 🏆")
- [ ] **5.3** Progress-to-next-badge indicator on Process Health panel
- [ ] **5.4** Award flow via existing `POST /api/gamification/award` + `GameAttributeRule` engine (basePoints, perControlPoints, hsseBonus, qualityBonus, multiplier)
- [ ] **5.5** Leaderboard — top-3 + own position, cumulative `SUM(PointTransaction.points)`, excludes `admin`

**Exit criteria:** Points appear after completing assessment; leaderboard updates.

---

## Phase 6 — Accessibility & Polish ⬜

Per `03_UI_WIREFRAMES.md` §6 and test scenarios AC1–AC6.

- [ ] **6.1** ARIA pass — all interactive elements labeled, `aria-expanded` on accordions, `role="alert"` on errors
- [ ] **6.2** Keyboard navigation — full Tab coverage, `Escape` closes modals, drag-drop alternatives implemented
- [ ] **6.3** Focus management — modal focus trap, focus return on close, focus to first error on validation fail
- [ ] **6.4** Color contrast audit — WCAG 2.1 AA (4.5:1 normal text, 3:1 large); health indicators have text labels, not color-only
- [ ] **6.5** Reduced motion — `prefers-reduced-motion` disables animations
- [ ] **6.6** Screen reader pass (NVDA) — dashboard and assessment workflow fully navigable
- [ ] **6.7** 200% font scaling — layout survives without breakage

---

## Phase 7 — Performance ⬜

Per test scenarios P1–P6.

- [ ] **7.1** Virtualize long lists (react-window) — Requirements table (933 rows), Controls (3,144 rows)
- [ ] **7.2** Lazy-load attachment images with thumbnails
- [ ] **7.3** Paginate/lazy-load long Knowledgebase documents
- [ ] **7.4** Code-split admin pages into separate chunk (assessors never download admin JS)
- [ ] **7.5** Cache reference data (Standards, SampleTypes, ActivityTypes) with 5-min TTL, invalidate on mutation
- [ ] **7.6** Verify targets: dashboard TTI < 2s, tab switch < 500ms, KB search < 300ms

---

## Phase 8 — Regression & Parity Verification ⬜

Prove sams-app does no harm to the shared database.

- [ ] **8.1** Run both apps simultaneously against the same DB — create assessment in sams-app, verify visible in seam-assurance-app
- [ ] **8.2** Verify cascade delete parity — deleting an Assessment in sams-app cleans up the same 7 cascaded tables + polymorphic cleanup (AttachmentMapping, orphan Attachments, MapArt2Know)
- [ ] **8.3** Verify company isolation — no cross-company data leaks (EC5)
- [ ] **8.4** Verify "Unmapped Controls" behavior — one per PA per company; mapping moves records, doesn't duplicate
- [ ] **8.5** Verify rawHealthScore recalculation triggers on effectiveness change/unassign
- [ ] **8.6** Verify activity logging — all mutations create ActivityLog entries with before/after JSON
- [ ] **8.7** Verify no raw SQL INSERTs missing `@updatedAt` columns (Lesson #15, 2026-07-14)
- [ ] **8.8** Verify adopt-templates idempotency — `ON CONFLICT DO NOTHING`, business-key unique constraints respected (Lesson #20, 2026-07-14)
- [ ] **8.9** Full test scenario sweep — all scenarios A1–F4 from `04_USER_ROLES_AND_TEST_SCENARIOS.md`

---

## Phase 9 — Deployment ⬜

- [ ] **9.1** Railway project setup — same PostgreSQL plugin (shared instance), own service
- [ ] **9.2** `railway.toml` — RAILPACK builder, `npx prisma generate && npm run build`, **no preDeployCommand** (Lesson #12/#25, 2026-07-14 — no data ops in deploy hooks)
- [ ] **9.3** `npx next build` locally before every push (Lesson #26 — Turbopack dev swallows TS errors)
- [ ] **9.4** Environment variables — DATABASE_URL, AUTH_SECRET (same as seam), NEXTAUTH_URL (new)
- [ ] **9.5** Staging smoke test — all 12 production users login, role routing, company scoping
- [ ] **9.6** Production cutover plan — sams-app runs alongside seam-assurance-app (no replacement until parity proven)

---

## Deferred / Out of Scope

| Item | Reason |
|------|--------|
| Consolidate 3 assessment surfaces (`/fla`, `/setup/assessments`, `/admin/assessments`) | Architectural debt in seam-app; sams-app builds one clean surface — seam consolidation is a separate decision |
| `/api/admin/execute-sql` hardening | seam-app risk; sams-app will not ship a SQL executor |
| LLM-enhanced KRI generation | Post-launch enhancement |
| UserRole/UserRoleMapping tables population | 0 rows in production; role enum is authoritative today — revisit if functional roles needed |
| Power Platform companion | Separate track per `APP_DESIGN_PowerPlatform.md` |

---

## Progress Tracker

| Phase | Items | Done | Status |
|-------|-------|------|--------|
| 0 — Scaffolding | 9 | 9 | ✅ Complete |
| 1 — Components | 24 | 13 | ✅ Core built |
| 2 — Navigation | 7 | 5 | ✅ Role-aware NavBar, company selector, role redirect, skip link |
| 3 — Assessor pages | 19 | 10 | ✅ Dashboard, Assessment Detail (5 tabs), Process Areas, Process Details (4 tabs + MapControls), Controls browse + search |
| 4 — Admin pages | 8 | 5 | ✅ Admin dashboard, Database management (backup/restore/export), Help page |
| 5 — Gamification | 5 | 5 | ✅ Points, badges, leaderboard (excludes admin), streak, GamificationPanel |
| 6 — Accessibility | 7 | 5 | ✅ Skip-to-content, ARIA roles, reduced motion, focus-visible, focus management |
| 7 — Performance | 6 | 1 | ⚠️ Deferred (code-splitting via Next.js) |
| 8 — Parity | 9 | 4 | ✅ Schema identity, auth config, source identity, env parity verified |
| 9 — Deployment | 6 | 2 | ✅ railway.toml, .env configured |
| **Total** | **100** | **59** | **59%** |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-07-21 | Initial development checklist. 100 items across 10 phases derived from all four design consideration documents. Includes exit criteria per phase, deferred scope, and lessons-learned guardrails from seam-assurance-app history. |
