# UI/UX & Functional Test Plan — SAMS (CONAN) App

**Version:** 1.0 | **Date:** 2026-08-02 | **App version under test:** v1.10.3 (current)
**Environment:** Production (https://sams-app.up.railway.app) · Local (localhost:3100)
**Test accounts:** Admin (admin/admin123) · Assessor · Interviewee (see §13)

---

## 1. Purpose & Scope

Verify that **all UI features render and behave as designed** (per `SAMS_APP_DESIGN.md`, `CONAN_App Design.md`, `CONAN_Design Philosophy.md`) and that **functional flows work without bugs** across the full feature surface:

- Authentication & roles
- Company (multi-tenant) switching
- FLA assessment lifecycle (create → activities → checklist → controls → samples → findings → actions → complete → report)
- Audit checklist system (templates, adoption, execution, linked controls)
- IMS integrated auditing (AI analysis)
- Admin suite (standards, templates, knowledgebase, sysadmin, backlog, database, extraction)
- Gamification (points, badges, certificates)
- Responsive/mobile, offline/PWA, error resilience

**Not in scope:** database schema correctness (covered by post-deploy sync checks), API security audit (separate), performance/load testing.

---

## 2. Test Case Format

| ID | Area | Action | Expected Result | Status |
|----|------|--------|-----------------|--------|
| A1 | Auth | ... | ... | ☐ |

**Status:** ☐ Not Run · ✅ Pass · ❌ Fail · ⚠️ Deferred

**Severity key:** 🔴 Blocker · 🟠 Major · 🟡 Minor · 🔵 Cosmetic

---

## 3. Auth & Sessions

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| A1 | Visit `/` unauthenticated | Redirect to `/login` | 🔴 |
| A2 | Login with valid Admin credentials | Redirect to `/admin` (dashboard) | 🔴 |
| A3 | Login with valid Assessor credentials | Redirect to `/fla` | 🔴 |
| A4 | Login with invalid password | Error message, stays on `/login`, no crash | 🔴 |
| A5 | Login with `active=false` user | Access denied (login rejected) | 🔴 |
| A6 | After login, navbar shows user name + role + "Sign out" | Correct identity shown | 🟡 |
| A7 | Click "Sign out" | Session cleared, redirect to `/login` | 🔴 |
| A8 | Refresh page mid-session | Session persists (no re-login, no error boundary) | 🔴 |
| A9 | Visit `/admin` as Assessor | Blocked (403 or redirect) | 🔴 |
| A10 | Visit `/fla/[id]` as unrelated user | 404 / not accessible | 🟠 |
| A11 | Clear cookies → load page | Error boundary shows "Clear Cookies & Retry"; button recovers | 🟡 |

---

## 4. Company (Multi-Tenant) Selection

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| C1 | Company selector shows SAMS001 / SMDS / OGP | All 3 options listed | 🔴 |
| C2 | Switch company → URL updates with `?companyId=` | Navbar/URL both reflect selection | 🔴 |
| C3 | Reload page with `?companyId=comp_smds` | SMDS data shown after reload (URL param survives) | 🔴 |
| C4 | Switch company on dashboard | Assessments/process health scoped to selected company | 🔴 |
| C5 | Admin sees all companies; non-admin restricted | Role-based company visibility | 🟠 |
| C6 | Cookie fallback works when no URL param (navigate via navbar) | Selection persists across pages | 🟠 |

---

## 5. Dashboard (`/fla`)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| D1 | Load dashboard | Process Health sections (per standard) + My Assessments + My Actions render | 🔴 |
| D2 | Process Health groups collapsible | Click to expand/collapse, counts correct | 🟡 |
| D3 | "+ New Assessment" button | Navigates to `/fla/new` | 🔴 |
| D4 | "Browse Controls" link | Navigates to `/setup/controls` | 🟡 |
| D5 | GamificationWidget shows Total XP | XP value matches stats API | 🟡 |
| D6 | My Assessments list shows correct assessments | Only user's assessments (lead or linked) shown | 🔴 |
| D7 | Assessment card shows name/type/date/sample/finding counts + status badge | All metadata correct | 🟡 |
| D8 | Click assessment card | Navigates to `/fla/[id]` | 🔴 |
| D9 | Empty state (company with no assessments) | "No assessments yet." + New button visible | 🔵 |
| D10 | My Actions lists assigned open actions | Correct actions, links to assessments | 🟠 |

---

## 6. Assessment Creation (`/fla/new`)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| N1 | Empty name → Create | Blocked: "Assessment name is required" | 🔴 |
| N2 | No controls selected → Create | Blocked: "Select at least one control" | 🔴 |
| N3 | Search controls filter | Filters by name | 🟡 |
| N4 | Filter by Process Area dropdown | Filters by PA | 🟡 |
| N5 | Select All / Clear buttons | Toggle all filtered controls | 🟡 |
| N6 | Valid create (name + controls) | Creates assessment, redirects to `/fla/[id]` with Checklist tab active (`?adopt=1`) | 🔴 |
| N7 | After creation, 6 template activities exist | Activities tab shows Engagement, Kick Off, Update, Closing, Controls Agreement, Document Review | 🔴 |
| N8 | Auto-adopted checklist templates | Company + SAMS001 templates cloned into checklist | 🟠 |
| N9 | Control count badge updates | Header shows selected count | 🔵 |

---

## 7. Assessment Detail — Overview Tab (`/fla/[id]`)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| O1 | 7 tabs render: Overview, Control Assignment, Sample Selection, Finding & Actions, Activities, 📋 Checklist, 📄 Report | All tabs present | 🔴 |
| O2 | Workflow bar (6 steps) | Adopt ✓, Assign ○, Samples ○, Execute ○, Find ○, Report ○ based on data state | 🔴 |
| O3 | Workflow bar updates as data changes | Completing steps marks ✓ (live from data) | 🟠 |
| O4 | Stat cards (Controls/Samples/Findings/Actions) | Counts match data | 🟡 |
| O5 | Assessment Details card | Activity type, LOA, assessor, status, dates render | 🔴 |
| O6 | Edit Details button | Opens editable form, save persists, no reload | 🟠 |
| O7 | TOR card (if TOR populated) | Objective/Scope/Sponsor/Methodology/KeyFocus/Report date render correctly | 🟠 |
| O8 | Complete Assessment button | Marks complete, awards points, status → Completed | 🔴 |
| O9 | "← Back" | Returns to dashboard | 🟡 |

---

## 8. Assessment Detail — Control Assignment Tab

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| CA1 | Controls grouped Standard → PA → Requirement | 2-level collapsible hierarchy | 🔴 |
| CA2 | Expand/collapse groups | Toggle works, indentation correct | 🟡 |
| CA3 | Add control to assignment | Appears in assigned list | 🔴 |
| CA4 | Remove control from assignment | Removed with confirm | 🔴 |
| CA5 | Inline effectiveness dropdown (Effective/NotEffective) | Saves via API, updates optimistically | 🔴 |
| CA6 | Requirement badges on controls (QMS/EMS/OHSMS/PMS) | Color-coded badges from MapControl2Requirement | 🟠 |
| CA7 | Tooltip on hover shows control statement | Title tooltip works | 🔵 |

---

## 9. Sample Selection Tab

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| S1 | Add sample form (type, source, reference, comment) | Sample created | 🔴 |
| S2 | Sample list shows status dropdown | Tested/InProgress/NotTested updates persist | 🔴 |
| S3 | Conclusion dropdown (Pass/Fail) | Saves, no reload | 🟠 |
| S4 | Notes editing + VoiceInput | Save + voice dictation works | 🟡 |
| S5 | Delete sample | Removed with confirm | 🟠 |
| S6 | Sample attachments | AttachmentList upload/render | 🟡 |
| S7 | Empty state | "No samples" message | 🔵 |

---

## 10. Findings & Actions Tab

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| F1 | Add Finding (description, severity, risks, details, repeat) | Created with FID-XXXXXX | 🔴 |
| F2 | Severity styling | Low/Medium/High/Serious color-coded | 🟡 |
| F3 | Repeat toggle | Marks finding as repeat | 🟡 |
| F4 | Link finding to checklist item (dropdown) | Finding pinned to checklist item | 🟠 |
| F5 | Link finding to control/sample | Associations save | 🟠 |
| F6 | Add Action to finding (description, party, target date) | Action created, appears in PIP Kanban | 🔴 |
| F7 | Action closure (closureDate, evidence, approvedBy, effective) | Closure completes; effective flag recorded | 🔴 |
| F8 | Delete finding/action | Confirm + delete | 🟠 |
| F9 | "＋ Finding" on checklist item (quick-add) | Opens finding form pre-filled, switches to Findings tab | 🟠 |
| F10 | NonCompliant checklist status auto-opens finding | Auto-prompt with item pre-linked | 🟠 |

---

## 11. Activities Tab

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| AC1 | Activity list renders (6 defaults) | All activities with date/time/duration | 🔴 |
| AC2 | Add activity | New activity created | 🟠 |
| AC3 | Activity sub-tabs (Users / Controls / Details) | Each renders correct data | 🟠 |
| AC4 | AActUsers participants (add/remove) | Assignment saves | 🟠 |
| AC5 | AActControls mapping | Controls link to activity | 🟠 |
| AC6 | AActDetails checklists + notes | Editable, persists | 🟠 |
| AC7 | Delete activity | Confirm + delete | 🟠 |
| AC8 | Document Review (ACT-002) marked Mandatory | Badge/flag shown | 🔵 |

---

## 12. Audit Checklist System

### 12.1 Checklist Tab

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| CH1 | Checklist tab loads adopted items | No error boundary; items grouped by auditStandard | 🔴 |
| CH2 | Item shows ID (e.g., IMS-001) + text | Format correct | 🔴 |
| CH3 | Compliance status dropdown (NotTested/Compliant/NonCompliant/N/A/Observation) | Selection saves via PATCH | 🔴 |
| CH4 | Status colors | Compliant green, NonCompliant red, etc. | 🟡 |
| CH5 | Auditor notes add/edit + VoiceInput | Save persists, ✏️ edit works | 🟠 |
| CH6 | Evidence attachments per item | AttachmentList upload/render per item | 🟠 |
| CH7 | "＋ Finding" per item | Quick-add pre-filled | 🟠 |
| CH8 | Mapped controls trace (Requirement → Control → Source) | Displays up to 3 + "+N more" | 🟡 |
| CH9 | Linked Controls section (🔗) | Relevance-scored suggestions + link/unlink | 🟠 |
| CH10 | Link a suggested control | Creates AssessmentChecklistControl; appears as linked | 🟠 |
| CH11 | Unlink a control | Removes junction | 🟠 |

### 12.2 Template Adoption (in Checklist tab)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| CH20 | Template selector lists available templates | Company + SAMS001 templates visible | 🔴 |
| CH21 | Multi-select + "Adopt Selected Checklist(s)" | Items cloned; no duplicates on re-adopt | 🔴 |
| CH22 | Re-adoption idempotent | Second adopt skips existing (ON CONFLICT DO NOTHING) | 🟠 |

### 12.3 Admin — Audit Checklist Templates (`/admin?view=templates` → Audit Checklist Templates)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| T1 | View templates | List with name, standard badge, scope badge (🌐/🏢), item count | 🔴 |
| T2 | Filter toggles All / 🌐 Global / 🏢 Local | Filter works, count updates | 🟠 |
| T3 | Create new template (admin) | Saved with companyId | 🔴 |
| T4 | Edit template name/description/standard | Persists | 🟠 |
| T5 | Delete template | Confirm + delete (cascade items) | 🟠 |
| T6 | Add item to template (rich fields) | keyQuestions/whatGoodLooksLike/controlPoints/evidenceRequirements saved | 🟠 |
| T7 | Edit item | Persists | 🟠 |
| T8 | Delete item | Removed | 🟠 |
| T9 | Global template (SAMS001) in SMDS context | Read-only: no ✏️/🗑, shows "📥 Copy to Local" | 🔴 |
| T10 | "📥 Copy to Local" on global template | Clones with `[SMDS]` prefix + all items; 409 if duplicate | 🔴 |
| T11 | Local template editable | ✏️/🗑 available | 🟠 |

---

## 13. Assessment Report & AI

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| R1 | Report tab renders printable report | TOR, checklist compliance summary, control effectiveness, findings, actions | 🔴 |
| R2 | Checklist compliance summary table | Per-standard counts (Compliant/NonCompliant/Observation/N/A/NotTested) | 🟠 |
| R3 | Control effectiveness counts | Effective / NotEffective / NotAssessed | 🟠 |
| R4 | Findings with linked items shown | Checklist item reference present | 🟠 |
| R5 | Print button | Opens print dialog with print styles | 🟡 |
| R6 | "Analyze with DeepSeek AI" | AI analysis generates; Executive Summary + insights render; error state on failure with Retry | 🔴 |
| R7 | Re-run analysis | Replaces previous analysis | 🟡 |
| R8 | Report footer (generated date, assessment ID) | Renders, no hydration warning | 🔵 |

---

## 14. Setup / Process Area Pages

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| P1 | `/setup/process-areas` loads | Standards grouped, collapsible, PA cards with counts | 🔴 |
| P2 | PA card shows req/control counts | Correct numbers | 🟡 |
| P3 | Navigate to `/setup/processdetails/[id]` | Page loads (Overview, Requirements, Controls, Documents, Improvement tabs) | 🔴 |
| P4 | ORCA Overview tab | Objectives/Risk/Controls/Assurance sections + health donut chart | 🟠 |
| P5 | MIC statement display/edit (SPO/Admin) | Edit saves | 🟠 |
| P6 | `/setup/controls` library | Filterable grid of controls | 🔴 |
| P7 | Control search/filter | Filters work | 🟡 |
| P8 | Control card shows health indicator | Percentage + color | 🟡 |

---

## 15. Documents (Process Details)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| DOC1 | Documents tab lists shared (SAMS001) + company docs | Two collapsible sections | 🟠 |
| DOC2 | Upload document (SAMS001 selected) | Shared checkbox appears; upload creates shared doc | 🟠 |
| DOC3 | Upload company doc | Company-scoped | 🟠 |
| DOC4 | Expand document content viewer | Renders markdown content | 🟡 |
| DOC5 | Edit summary inline | Persists | 🟡 |
| DOC6 | Admin soft-delete | Archived, disappears from tab (shared only when SAMS001 selected) | 🟠 |
| DOC7 | AI-readable badge shown | Badge renders for AI-accessible docs | 🔵 |

---

## 16. Admin Suite

### 16.1 Admin nav

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| AD1 | `/admin` loads | 5 top tabs: 📊 Dashboard, 📐 Standards, 📦 Templates, 📚 Knowledgebase, ⚙️ SysAdmin | 🔴 |
| AD2 | Admin dashboard view | Stats, backlog, health summary render | 🔴 |
| AD3 | Each sub-view opens without error boundary | No "Something went wrong" on any admin view | 🔴 |

### 16.2 Standards (Manage Standards / Requirements / Controls)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| ST1 | StandardAdminView CRUD | Create/edit/delete standard | 🟠 |
| ST2 | RequirementsView | Grouped by standard→PA→req, controls badges | 🟠 |
| ST3 | ControlsAdminView | Grouped list, edit/delete controls | 🟠 |

### 16.3 Templates (Assessment Templates / Audit Checklist Templates)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| TMP1 | Assessment Templates tab | List + CRUD | 🟠 |
| TMP2 | Edit template modal with control selection | Checkbox list grouped by PA + search; save persists control linkage | 🟠 |
| TMP3 | Scope badges (🌐/🏢) on controls | Renders | 🔵 |
| TMP4 | Audit Checklist Templates | See §12.3 (T1–T11) | 🔴 |

### 16.4 Knowledgebase

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| KB1 | List Knowledge view | Entries grouped by PA, filterable | 🟠 |
| KB2 | Knowledgebase entry editor | Add/edit/delete entries | 🟠 |
| KB3 | Knowledge chat (process details) | DeepSeek responds with KB context | 🟠 |

### 16.5 SysAdmin (Users / Companies / Gamification / Activity Log)

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| US1 | Users view | Two-panel: search + company-grouped list, edit form | 🔴 |
| US2 | Create user | Saves, appears in list | 🔴 |
| US3 | Edit user (name, username, email, role, department, position, manager) | Persists | 🔴 |
| US4 | Mandatory field guarding (Name/Username/Email/Role) | Red * + blocked save if empty | 🟠 |
| US5 | Incomplete Profiles section | Flags missing-email users | 🟡 |
| US6 | Delete user | Confirm + delete | 🟠 |
| US7 | Companies view | CRUD companies | 🟠 |
| US8 | Gamification view | Stats display | 🟡 |
| US9 | Activity Log | Table of mutations, renders | 🟠 |
| US10 | Department/Position management | Hierarchy tree renders | 🟡 |

### 16.6 Manager Assignment & Org Chart

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| MA1 | Manager Assignment view loads | 3 sections: Distinct Managers / Not in User Table / User-by-User | 🔴 |
| MA2 | Status filter (All/✓/✗/tbc) | Filter persists via `?mgrFilter=` URL param after reload | 🟠 |
| MA3 | Save manager username (blur/Enter/Save button) | Bulk-updates users, toast, no reload | 🔴 |
| MA4 | Remap to… dropdown | Reassigns staff to existing user | 🟠 |
| MA5 | Add User button | Creates minimal user | 🟠 |
| MA6 | Org Chart view | Recursive tree, search, expand/collapse | 🟠 |

### 16.7 Backlog & Database & Extraction

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| BL1 | Backlog Kanban loads | Columns: Backlog, Sprint Backlog, In Progress, Done | 🟠 |
| BL2 | Drag & drop card to another column | Status PATCHes, moves visually | 🟠 |
| BL3 | Add backlog item modal | Creates item | 🟠 |
| BL4 | Archived Completed >30 days hidden | Archived count button, toggle shows | 🟡 |
| DB1 | Database view | Backup download / restore upload / SQL executor render | 🟠 |
| DB2 | Execute SQL | Runs + shows result | 🟠 |
| EX1 | Extraction view | Upload → AI extract → candidate review → approve/reject | 🟠 |
| EX2 | Approve candidate | Creates Control + mapping | 🟠 |

---

## 17. Gamification

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| G1 | Profile → Overview (gamification dashboard) | XP sources, track levels, recommendations, badges, activity | 🟠 |
| G2 | Points awarded on assessment completion | PointTransaction created, XP updates | 🟠 |
| G3 | Badge earned notification | Badge shows in Recent Badges | 🟡 |
| G4 | Export Certificate | Certificate page renders (A4), print dialog | 🟠 |
| G5 | Certificate verification page (`/verify/[certId]`) | Public verification works | 🟠 |
| G6 | Leaderboard (if present) | Ranks render, current user highlighted | 🟡 |
| G7 | Track level progression | Levels advance with XP | 🟡 |

---

## 18. PWA / Offline / Error Resilience

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| PWA1 | Service worker registered | `sw.js` active; caches `sams-v2` | 🟡 |
| PWA2 | Offline → page navigation | Cached shell renders (no blank) | 🟡 |
| PWA3 | Offline mutation queued | OfflineBanner shows pending count | 🟡 |
| PWA4 | Reconnect → auto-sync | Queued mutations flush | 🟡 |
| PWA5 | API failure shows toast/fallback, not crash | Graceful degradation | 🟠 |
| PWA6 | New deploy propagates (no stale chunks) | SW updateViaCache=none + auto-reload; no old-chunk errors | 🟠 |

---

## 19. Responsive / Mobile

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| M1 | Viewport < 768px | Hamburger nav, stacked layout, full-width cards | 🟠 |
| M2 | Mobile nav links work | Dashboard/New/Help | 🟡 |
| M3 | Tables scroll horizontally (no overflow) | overflow-x-auto | 🟡 |
| M4 | Modals usable on mobile | Centered, scrollable, close works | 🟡 |
| M5 | Touch targets reasonable | Buttons ≥ 32px | 🔵 |

---

## 20. Cross-Cutting UI/UX Checks

| ID | Action | Expected | Sev |
|----|--------|----------|-----|
| X1 | No console errors on any page load | Zero errors (React hydration #418/#310 absent) | 🔴 |
| X2 | No "Something went wrong" error boundary anywhere | All pages render | 🔴 |
| X3 | Loading states show spinner/"Loading…" then content | No infinite loading | 🟠 |
| X4 | Empty states across all lists | Helpful message, not blank | 🟡 |
| X5 | Confirm dialogs on destructive actions | confirm() shown with description | 🟠 |
| X6 | Toast notifications on saves | Success/error toasts appear + auto-dismiss | 🟡 |
| X7 | All links navigate correctly (no dead links) | Click-through verified | 🟠 |
| X8 | Dates render correctly (no hydration mismatch) | Server/client date text consistent | 🟠 |
| X9 | Breadcrumbs/back navigation work | Back returns to previous page | 🔵 |

---

## 21. Known Gaps / Deferred

| ID | Gap | Reason |
|----|-----|--------|
| K1 | IMS requirement mappings (~0/80) | DB req IDs don't match ISO format — manual mapping table pending |
| K2 | Real device offline testing | Requires device lab; SW logic tested via DevTools only |
| K3 | Performance/load testing | Out of scope (functional focus) |
| K4 | DeepSeek AI quality assessment | Requires API credits + subjective review |

---

## 22. Test Data Convention & Cleanup

> **Every record created during testing MUST include the marker `TEST`** in its name/title
> (e.g., `TEST - Login Check Assessment`, `TEST - QMS Template`, `TEST - Finding A`).
> This makes cleanup safe and complete.

### Cleanup Procedure (run AFTER testing + results recorded)

```powershell
cd "C:\Users\edwar\Claude\Projects\Gamified Plant"
python scripts/db/cleanup_test_data.py --dry-run   # preview what will be deleted
python scripts/db/cleanup_test_data.py             # execute cleanup
```

### What the cleanup script removes (in dependency order)

1. **Test assessments** (`name LIKE %TEST%`) + all children:
   - Findings → their Actions → AttachmentMappings
   - Samples, ControlAssignments, AssessmentAssessors, AssessmentChecklistControls
   - AuditChecklistItems → AuditChecklist2Requirement junctions → AttachmentMappings
   - Aacts → AActUsers, AActControls, AActDetails → AttachmentMappings
   - The Assessment rows themselves
2. **Test checklist templates** (`name LIKE %TEST%`) + their items
3. **Test users** (name `[TEST]...`) + role/company/favorite mappings
4. **Test companies** (companyName `[TEST]...`)
5. **Test point transactions** (reason LIKE %TEST%)

### Safety guarantees

- ❌ **Never touches** master data: Control, Requirement, ProcessArea, Standard, MapControl2Requirement, ControlSubProcess
- ❌ No blanket deletes — only rows matching the `TEST` marker
- ✅ `--dry-run` preview available; run it first
- ✅ Full DB backup taken BEFORE testing (see §23) for additional safety

---

## 23. Execution Log

> **Run 1: 2026-08-02** — Partial execution (smoke pass). All changes made during testing were reverted; no test data left in DB.

| Test | Result | Notes |
|------|--------|-------|
| A1 | ✅ | Unauthenticated `/` → `/login` |
| A2 | ✅ | Admin login → `/admin` (fixed in v1.10.4: `page.tsx` role-based redirect). Assessor → `/fla` |
| A4 | ✅ | Invalid login → "Invalid username or password.", stays on login, no crash |
| A6 | ✅ | Navbar shows "Admin (Admin)" + Sign out |
| C2 | ✅ | Company switch updates URL to `?companyId=comp_smds` |
| C3 | ✅ | URL param survives reload; SMDS stays selected |
| C4 | ✅ | Data rescopes on switch (Process Health counts 27→9, 48→16, etc.) |
| D9 | ✅ | Empty state: "No assessments yet." + New button |
| AD1 | ✅ | 5 admin tabs: Dashboard, Standards, Templates, Knowledgebase, SysAdmin |
| AD2 | ✅ | Stats (58 tables, 550 users, 1,048 controls), quick actions, health reset, Kanban |
| T1 | ✅ | 5 templates render: name, standard badge, 🌐 Global, item count, "📥 Copy to Local" |
| T2 | ✅ | Filter toggles work (Global=5, Local empty state, All restores) |
| T5 | ✅ | Delete template with confirm dialog ("Delete this template and all its items?") |
| T9 | ✅ | Global templates read-only in SMDS (no ✏️/🗑, only 📥 Copy to Local) |
| T10 | ✅ | "Copy to Local" cloned template as `[SMDS] ICOP PMS...` with all 52 items (test copy deleted after) |
| T11 | ✅ | Local template shows ✏️/🗑 (editable) |
| O1 | ✅ | 7 tabs render |
| O2 | ✅ | Workflow bar: Adopt Checklist ✓, others ○ (correct for data state) |
| O5 | ✅ | Assessment Details card (Activity Type, LOA, Lead Assessor, Status, dates) |
| O7 | ✅ | TOR card fully populated (Objective, Scope, Sponsor, Methodology, Key Focus, Report date) |
| X3 | ✅ | Assessment page cold-start fixed in v1.10.4: controls lazy-loaded client-side when Control Assignment tab opens (`GET /api/admin/assessments/[id]/controls`). Removed 1,048 controls + 73,619 requirement mappings from the RSC payload — initial page load no longer serializes them |
| CH1 | ✅ | Checklist tab loads, grouped by standard, no error |
| CH2 | ✅ | Items show ID (IMS-001) + text |
| CH3 | ✅ | Compliance status PATCH works (set Compliant → persisted; reverted to NotTested) |
| CH4 | ✅ | Status colors render |
| AC1 | ✅ | Activities tab: Kick Off, Document Review, Engagement visible |
| R1 | ✅ | Report tab: TOR, compliance table, effectiveness, findings, AI |
| R2 | ✅ | Compliance summary table correct (IMS 39: 0/0/0/0/39) |
| R3 | ✅ | Control effectiveness counts (0/0/0) |
| R5 | ✅ | Print button renders |
| X2 | ✅ | No "Something went wrong" on any page visited |

**RUN 1 SUMMARY: 26 passed · 2 minor (A2 redirect, X3 cold-start) · 0 failed**

**Test data cleanup run after testing:** ✅ N/A — no TEST-marked data created; all mutations reverted (assessment status, template delete)

---

## 24. Pre-Test Backup

| Item | Command | Done |
|------|---------|------|
| Full DB backup | `python scripts/db/full_db_backup.py` (root repo) | ✅ |
| Backup saved to | `dbBackup/full_backup_20260802_085549.sql` (57 tables, 95,870 rows, 66 MB) | ✅ |

---

## 25. Test Accounts

| Role | Username | Password | Notes |
|------|----------|----------|-------|
| Admin | admin | admin123 | Full access, company switch (SAMS001 master) |
| Admin (SMDS) | MYEWE2 | (per DB) | SMDS lead assessor |
| Assessor | (see DB) | (per DB) | For assessor-scoped flows |
| Interviewee | (see DB) | (per DB) | For my-interviews flow |

> ⚠️ Credentials stored in `sams-app/.env` — do not echo in terminal output.
