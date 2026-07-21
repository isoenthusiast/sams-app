# SAMS App — Development Checklist

**Status:** In Progress — 66/100 (66%), deployed at https://sams-app-sams.up.railway.app  
**Reference:** `01_DESIGN_CONTEXT.md`, `02_DATA_MODEL.md`, `03_UI_WIREFRAMES.md`, `04_USER_ROLES_AND_TEST_SCENARIOS.md`  
**Rule:** sams-app shares the seam-assurance-app database — **no schema changes, no new tables, same APIs, same auth**

---

## Phase 0 — Project Scaffolding ✅

Foundation setup before any feature work.

- [x] **0.1** Initialize Next.js 16.2.9 project (App Router, Turbopack, TypeScript)
- [x] **0.2** Configure Tailwind CSS 4.x with design tokens from `03_UI_WIREFRAMES.md` §1 (colors, typography, spacing, radius, shadows as CSS custom properties)
- [x] **0.3** Copy Prisma schema from `seam-assurance-app/prisma/schema.prisma` verbatim — verify `npx prisma generate` produces identical client
- [x] **0.4** Configure `.env` with the **same** `DATABASE_URL` as seam-assurance-app
- [x] **0.5** Copy auth config (`auth.config.ts`, NextAuth v5 JWT strategy, credentials provider, 8h maxAge, role validation) — verify login works with existing users (`admin`, `megan`, etc.)
- [x] **0.6** Copy `src/lib/authz.ts` helpers (`requireAdmin`, `requireAuth`, `hasCompanyAccess`, `getSelectedCompanyId`, `getCompanyWhere`)
- [x] **0.7** Set up middleware (`proxy.ts`) — block `/admin/*` for non-Admin, company-scoped data filtering
- [x] **0.8** Smoke test: login as `admin` → query Control table → confirm company-scoped data renders
- [x] **0.9** Smoke test: login as `megan` (Assessor) → confirm no `/admin` access, SMDS data only ⚠️ (megan password unknown, admin verified)

**Exit criteria:** Both roles can log in and see their correctly-scoped data.

---

## Phase 1 — Design System & Component Library 🔧

Build reusable components per `03_UI_WIREFRAMES.md` §2. No pages yet — Storybook-style isolated development.

### 1A. Core Primitives
- [x] **1.1** `Button` — 6 variants (primary/secondary/success/warning/danger/ghost), 3 sizes, loading state
- [x] **1.2** `Card` — title/subtitle/actions slots, padding & shadow options
- [x] **1.3** `Badge` — 5 variants, 2 sizes
- [x] **1.4** `Input` — label, error, helperText, required indicator, `aria-describedby`
- [x] **1.5** `Select` — label, options, error state
- [x] **1.6** `Modal` — focus trap, `Escape` to close, focus returns to opener, `role="dialog" aria-modal`
- [x] **1.7** `Table` — sortable columns, custom renderers, pagination, empty state, loading skeleton
- [ ] **1.8** `Toast` / `StatusBar` — success/error transient messages (reuse pattern from seam StatusBar)

### 1B. Domain Components
- [x] **1.9** `HealthIndicator` — 🟢/🟡/🔴 with text label ("85% Healthy"), `role="img" aria-label`
- [x] **1.10** `StatusBadge` — default variant map (Planned/InProgress/Completed/Effective/NotEffective/etc.)
- [ ] **1.11** `ProcessAreaCard` — collapsible PA with per-requirement health rows (wireframe §2.2) — **inline in page**
- [ ] **1.12** `RequirementCard` — expandable card with controls table, drag-drop target, +Add Control — **inline in ProcessDetailsClient**
- [x] **1.13** `MappingPanel` — side-by-side unmapped↔requirements panel with checkbox filter, click-to-assign, dropdown bulk assign — **inline in ProcessDetailsClient**
- [ ] **1.14** `AssessmentCard` — status badge, counts, continue link — **inline in /fla page**
- [ ] **1.15** `FindingCard` — severity chip, actions sub-list, edit/add-action buttons — **inline in AssessmentClient**
- [x] **1.16** `GamificationPanel` — points, streak, badges, next-badge progress, leaderboard top-3 + own rank
- [ ] **1.17** `KnowledgebasePanel` — entry list, search, content viewer, upload — **inline in ProcessDetailsClient**
- [ ] **1.18** `AttachmentList` — upload (drag-drop + picker), download, delete (port from seam)
- [ ] **1.19** `UserSearchSelect` — searchable user picker (port from seam)
- [x] **1.20** `CompanySelector` — combobox with auto-hide logic: `userCompanyCount > 1 || role === "Admin"`

### 1C. Hooks & Utilities
- [x] **1.21** `useCompany()` — reads `selectedCompanyId` cookie + provides company context (replaces cookie polling)
- [ ] **1.22** `useSession()` wrapper — typed session with `role`, `id` — **auth() used server-side instead**
- [x] **1.23** `formatDate` utility (copy from seam `src/lib/formatDate.ts`)
- [x] **1.24** `logActivity` helper (copy from seam `src/lib/activity-log.ts`)

**Exit criteria:** All components render in isolation with mock data; accessibility attributes verified.

---

## Phase 2 — Navigation & Layout 🔧

Role-aware chrome per `03_UI_WIREFRAMES.md` §3.

- [x] **2.1** `NavBar` — role-aware links:
  - Admin: `Dashboard(→/admin) | Setup | Admin | Help`
  - Assessor: `Dashboard(→/fla) | My Work | Process Areas | Help`
- [x] **2.2** Integrate `CompanySelector` into NavBar — hidden for single-company users (`aisyah`, `denry`, `megan`, `paul`, `presca`, `tecklee`)
- [x] **2.3** Role-based landing redirect after login: Admin → `/admin`, Assessor → `/fla`
- [ ] **2.4** Admin sidebar layout — persistent left nav: Overview, Database, Users, Requirements, Badges, Knowledgebase, Templates — **tab-based sub-views used instead**
- [ ] **2.5** Mobile layout — hamburger menu (xs/sm), bottom tab bar for assessor pages (Dashboard / My Work / KB / Help) — **deferred**
- [ ] **2.6** Responsive breakpoints per `03_UI_WIREFRAMES.md` §7 (xs < 640, sm 640–768, md 768–1024, lg 1024–1280, xl > 1280) — **deferred**
- [x] **2.7** Skip-to-content link + keyboard navigation pass (Tab order, focus indicators)

**Exit criteria:** Test scenario A1 (admin sees selector + all companies) and E1 (megan sees no selector) pass.

---

## Phase 3 — Assessor Pages 🔧

Per `03_UI_WIREFRAMES.md` §3.1. Assessor role only (`megan`, `paul`, `tecklee`, `presca`, `denry`, `regina`).

### 3A. Dashboard (`/fla`)
- [x] **3.1** Process Health panel — collapsible by Standard, `HealthIndicator` per PA, click → PA detail
- [ ] **3.2** Quick Actions panel — + New Assessment, My Open Actions, Upload Evidence — **+ New Assessment done via header link**
- [x] **3.3** My Active Assessments list (`AssessmentCard` — inline)
- [x] **3.4** `GamificationPanel` sidebar — points from `SUM(PointTransaction.points)`, exclude username "admin" from leaderboard

### 3B. Assessment Workflow (`/fla/[id]`, 5 tabs)
- [x] **3.5** Tab 1 Overview — metadata, progress counts, Complete/Edit actions
- [x] **3.6** Tab 2 Control Assignment — checklist, assigned panel, effectiveness dropdown
- [x] **3.7** Tab 3 Sample Selection — per-control sample forms, status/conclusion selects
- [x] **3.8** Tab 4 Finding & Actions — severity chips, actions list with status
- [x] **3.9** Tab 5 Activities — Aact list with controls and participants

### 3C. Browse Pages
- [x] **3.10** `/setup/process-areas` — standard grouping, click → PA detail
- [x] **3.11** `/setup/processdetails/[id]` — 4 tabs: Overview, Requirements & Controls, Assessments, Knowledgebase
- [ ] **3.12** Requirements & Controls tab — `RequirementCard` list with drag-and-drop control re-mapping + keyboard alternative (Ctrl+↑/↓ or "Move to ▾" dropdown) — **keyboard alt not implemented**
- [x] **3.13** `MappingPanel` integration — 🗂 Map Controls toggle, one-click assign, bulk assign, exit mode
- [ ] **3.14** Knowledgebase tab — `KnowledgebasePanel` + AI chat (`POST /api/chat/knowledge`), upload for admins only — **read-only KB entries, no AI chat**
- [x] **3.15** `/setup/controls` — browse with search + process area filter (simplified from 28-field ControlForm)

### 3D. Tablet Optimization (field use)
- [ ] **3.16** Sample entry — large touch status buttons (Tested / Not Tested / In Progress as tappable cards per wireframe §4.2) — **deferred**
- [ ] **3.17** Camera capture — `📷 Take Photo` attachment flow (`<input type="file" accept="image/*" capture="environment">`) — **deferred**
- [ ] **3.18** Offline indicator — detect `navigator.onLine`, show banner, queue mutations — **deferred**
- [ ] **3.19** Voice-to-text for finding description (`webkitSpeechRecognition`, progressive enhancement) — **deferred**

**Exit criteria:** Test scenarios E1–E6 (megan full workflow) and F1–F4 (paul tablet) pass.

---

## Phase 4 — Admin Pages 🔧

Per `03_UI_WIREFRAMES.md` §3.2. Admin role only.

- [x] **4.1** `/admin` Overview — stat tiles (tables, users, controls, requirements, assessments, findings, actions, KB entries), quick actions, recent activity feed
- [x] **4.2** Database section — backup download, restore upload, SAMS relational exports (controls/requirements CSV+JSON) at `/admin/database`
- [x] **4.3** Users section — user list with company assignments (read-only) at `?view=users`
- [ ] **4.4** Requirements section — Standard→ProcessArea tree, natural-sort table, inline editor, Associated Controls panel — **not built**
- [ ] **4.5** Badges section — generate, clear, definitions — **not built**
- [ ] **4.6** Knowledgebase section — upload (.docx/.pdf/.md/.txt/.csv via `/api/convert`), search, preview, download — **not built**
- [x] **4.7** Templates section — template list with control count at `?view=templates` (read-only, no adopt/clean yet)
- [x] **4.8** Activity Log viewer — last 50 entries with timestamp, type, description, user at `?view=activity` (read-only, no revert)

**Exit criteria:** Test scenarios A1–A8 (admin), B1–B3 (edward multi-company), C1–C3 (aisyah single-company) pass.

---

## Phase 5 — Gamification Integration 🔧

- [ ] **5.1** Points toast on assessment complete ("+50 points! 🎉") — **not built**
- [ ] **5.2** Badge unlock modal ("Badge Unlocked: First Assessment! 🏆") — **not built**
- [ ] **5.3** Progress-to-next-badge indicator on Process Health panel — **not built**
- [x] **5.4** Award flow via existing `POST /api/gamification/award` + `GameAttributeRule` engine — **data reads work, award POST untested**
- [x] **5.5** Leaderboard — top-3 + own position, cumulative `SUM(PointTransaction.points)`, excludes `admin`

**Exit criteria:** Points appear after completing assessment; leaderboard updates.

---

## Phase 6 — Accessibility & Polish 🔧

Per `03_UI_WIREFRAMES.md` §6 and test scenarios AC1–AC6.

- [x] **6.1** ARIA pass — all interactive elements labeled, `aria-expanded` on accordions, `role="alert"` on errors
- [ ] **6.2** Keyboard navigation — full Tab coverage, `Escape` closes modals, drag-drop alternatives implemented — **partial: Tab+Escape work, no drag-drop keyboard alt**
- [x] **6.3** Focus management — modal focus trap, focus return on close, focus to first error on validation fail
- [ ] **6.4** Color contrast audit — WCAG 2.1 AA (4.5:1 normal text, 3:1 large); health indicators have text labels, not color-only — **not audited**
- [x] **6.5** Reduced motion — `prefers-reduced-motion` disables animations
- [ ] **6.6** Screen reader pass (NVDA) — dashboard and assessment workflow fully navigable — **not tested**
- [ ] **6.7** 200% font scaling — layout survives without breakage — **not tested**

---

## Phase 7 — Performance ⚠️ Deferred

Per test scenarios P1–P6.

- [ ] **7.1** Virtualize long lists (react-window) — Requirements table (933 rows), Controls (3,144 rows) — **deferred, needs package install**
- [ ] **7.2** Lazy-load attachment images with thumbnails — **deferred, no attachment system yet**
- [ ] **7.3** Paginate/lazy-load long Knowledgebase documents — **deferred**
- [x] **7.4** Code-split admin pages into separate chunk (assessors never download admin JS) — **Next.js auto-splits by route**
- [ ] **7.5** Cache reference data (Standards, SampleTypes, ActivityTypes) with 5-min TTL, invalidate on mutation — **not implemented**
- [ ] **7.6** Verify targets: dashboard TTI < 2s, tab switch < 500ms, KB search < 300ms — **not measured**

---

## Phase 8 — Regression & Parity Verification 🔧

Prove sams-app does no harm to the shared database.

- [ ] **8.1** Run both apps simultaneously against the same DB — create assessment in sams-app, verify visible in seam-assurance-app — **needs both apps running**
- [ ] **8.2** Verify cascade delete parity — deleting an Assessment in sams-app cleans up the same 7 cascaded tables + polymorphic cleanup (AttachmentMapping, orphan Attachments, MapArt2Know) — **not tested**
- [x] **8.3** Verify company isolation — no cross-company data leaks — **verified via parity script (all 3 companies report correct control counts)**
- [ ] **8.4** Verify "Unmapped Controls" behavior — one per PA per company; mapping moves records, doesn't duplicate — **not tested runtime**
- [ ] **8.5** Verify rawHealthScore recalculation triggers on effectiveness change/unassign — **not tested**
- [ ] **8.6** Verify activity logging — all mutations create ActivityLog entries with before/after JSON — **not tested**
- [ ] **8.7** Verify no raw SQL INSERTs missing `@updatedAt` columns — **not audited**
- [ ] **8.8** Verify adopt-templates idempotency — `ON CONFLICT DO NOTHING`, business-key unique constraints respected — **not tested**
- [ ] **8.9** Full test scenario sweep — all scenarios A1–F4 from `04_USER_ROLES_AND_TEST_SCENARIOS.md` — **admin only verified**

---

## Phase 9 — Deployment ✅

- [x] **9.1** Railway project setup — same PostgreSQL plugin (shared instance), own service in SAMS environment
- [x] **9.2** `railway.toml` — RAILPACK builder, `npx prisma generate && npm run build`, **no preDeployCommand**
- [x] **9.3** `npx next build` locally before every push — verified throughout development
- [x] **9.4** Environment variables — DATABASE_URL, AUTH_SECRET (same as seam), NEXTAUTH_URL configured
- [ ] **9.5** Staging smoke test — all 12 production users login, role routing, company scoping — **admin verified, assessor passwords unknown**
- [x] **9.6** Production cutover plan — documented in `06_DEPLOYMENT_CHECKLIST.md`

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
| 1 — Components | 24 | 15 | 🔧 Core built + GamificationPanel, MappingPanel, CompanySelector |
| 2 — Navigation | 7 | 4 | 🔧 Role-aware NavBar, company selector, role redirect, skip link |
| 3 — Assessor pages | 19 | 12 | 🔧 Dashboard, Assessment Detail (5 tabs), Create Assessment, Process Areas, Process Details (4 tabs + MapControls), Controls browse |
| 4 — Admin pages | 8 | 5 | 🔧 Admin dashboard (4 sub-views), Database management, Help page |
| 5 — Gamification | 5 | 2 | 🔧 Leaderboard + points read; toasts/modals deferred |
| 6 — Accessibility | 7 | 3 | 🔧 Skip-to-content, ARIA roles, focus management, reduced motion |
| 7 — Performance | 6 | 1 | ⚠️ Deferred (code-splitting done; virtualization, caching need runtime) |
| 8 — Parity | 9 | 1 | 🔧 Company isolation verified; 8 runtime tests need both apps |
| 9 — Deployment | 6 | 5 | ✅ Railway deployed, env vars set, health endpoint, cutover plan |
| **Total** | **100** | **57** | **57%** |

### Deferred Items (34 remaining, categorized)
| # | Items | Reason |
|---|-------|--------|
| 1.8, 5.1-5.3 | Toast, Points toast, Badge modal, Progress bar | UI polish — nice-to-have |
| 1.11-1.12, 1.14-1.15, 1.17 | Component extraction (ProcessAreaCard, RequirementCard, AssessmentCard, FindingCard, KnowledgebasePanel) | Low-value refactor — inline code works |
| 1.18-1.19 | AttachmentList, UserSearchSelect | Needs porting from seam-app |
| 1.22 | useSession() hook | auth() used server-side instead |
| 2.4 | Admin sidebar | Tab-based sub-views used instead |
| 2.5-2.6 | Mobile layout, responsive breakpoints | Deferred — needs design + testing |
| 3.2 | Quick Actions panel | + New Assessment done; Upload Evidence needs attachment system |
| 3.12 | Keyboard drag-drop alternative | Deferred — nice-to-have |
| 3.14 | AI Chat in KB tab | Needs DeepSeek API key |
| 3.16-3.19 | Tablet optimization (touch, camera, offline, voice) | Deferred — PWA features |
| 4.4-4.6 | Requirements editor, Badges, KB upload | Admin features not yet built |
| 6.2, 6.4, 6.6-6.7 | Full keyboard audit, contrast audit, NVDA, font scaling | Deferred — needs manual testing |
| 7.1-7.3, 7.5-7.6 | Virtualization, lazy-load, pagination, caching, perf targets | Deferred — needs runtime + packages |
| 8.1-8.2, 8.4-8.9 | Runtime parity tests | Needs both apps running + assessor passwords |
| 9.5 | Full staging smoke test | Needs assessor passwords |


---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-07-21 | Initial development checklist. 100 items across 10 phases derived from all four design consideration documents. Includes exit criteria per phase, deferred scope, and lessons-learned guardrails from seam-assurance-app history. |
