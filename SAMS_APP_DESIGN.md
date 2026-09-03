# SAMS App — Design Reference

> **📐 Active alongside `CONAN_Design Philosophy.md` and `CONAN_App Design.md`.** CONAN docs are the narrative source of truth; this document is the technical specification (models, routes, components, APIs). Both are maintained.

**Last Updated:** September 04, 2026 (v1.13.18 — Conversation Fabric: threaded comments + evidence-request pipeline, SAMS-004 Phase 2a)

---

## 1. Design Philosophy → See `CONAN_Design Philosophy.md`

All design philosophy, guiding principles, paradigm shifts, gamification philosophy, domain language, and architecture decisions have been consolidated into `CONAN_Design Philosophy.md` in the project root.

---

## 2. Architecture Overview
3. [UI / UX Design](#3-ui--ux-design)
4. [Data Model & Entity Relationships](#4-data-model--entity-relationships)
5. [Route Map — Pages & API](#5-route-map--pages--api)
6. [Component Library](#6-component-library)
7. [Gamification Engine](#7-gamification-engine)
8. [Multi-Company Architecture](#8-multi-company-architecture)
9. [AI Integration](#9-ai-integration)
10. [Security & Authorization](#10-security--authorization)
11. [Wireframes & Screen Inventory](#11-wireframes--screen-inventory)
12. [Deployment & DevOps](#12-deployment--devops)
13. [Known Gaps & Roadmap](#13-known-gaps--roadmap)

---

## 1. Design Philosophy

### 1.1 Core Purpose

SAMS is an **assurance management system** — not an audit tool, not a checklist app. It shifts organizations from "passing audits" to **continuously proving their barriers hold**. Every feature traces back to a single mission: **make assurance visible, continuous, and everyone's job.**

### 1.2 Guiding Principles

| Principle | What It Means |
|-----------|---------------|
| **Assurance over Audit** | The app tracks ongoing barrier health, not one-time certification events |
| **Findings are Gold** | Surfacing a gap is celebrated — it means we caught it before it caught us |
| **Every Role Has Stakes** | From site leadership to process practitioners, every role sees their contribution to barrier health |
| **No-Blame Design** | Ineffective samples earn 0 points, never negative. Learning conversations, not punishment |
| **Abundance, Not Scarcity** | Team leaderboards compete on aggregate points — everyone can win by doing their own work well |
| **Traceability to Risk** | Every point, badge, and metric traces to a specific control protecting against a specific risk |
| **Company Isolation** | Multi-tenant from day one. Companies never see each other's data |
| **Uncontrolled Inputs for Bulk Edits** | When many rows share a single save trigger, inputs use `defaultValue` + `data-` attributes (not `value` + `onChange`). This avoids React re-renders on every keystroke. Values are read directly from the DOM via `document.querySelector`. Save triggers: blur, Enter key, or an explicit Save button |
| **Optimistic Local Updates** | After a successful API call, update local React state immediately rather than reloading the page. Pattern: `setLocalUsers(prev => prev.map(u => condition ? { ...u, field: newValue } : u))`. Shows a brief success toast. Preserves scroll position, filter state, and expanded sections — no disruption to admin workflow |
| **Mandatory Field Guarding** | Required fields (Name, Username, Email, Role) are marked with red `*` in forms. Save is blocked with a toast if any mandatory field is empty. System/API-added users bypass the guard but are flagged in the "Incomplete Profiles" section for admin review |
| **Email-Based Identity Resolution** | When free-text name fields (e.g., manager names from Active Directory) don't match DB `User.name` (official vs calling names), resolve identity via Shell email addresses. Pattern: parse `GivenName.LastName@shell.com` from the email, match against the manager's `<last>, <first>` CSV format. This bridges ethnic/calling-name differences (e.g., "Ho, Alvin" → "Ho, Wei Seng" via `Alvin.Ho@shell.com`). Batch-verify matches before bulk-updating |

### 1.3 Paradigm Shifts the App Drives

| Old Paradigm | New Paradigm |
|-------------|-------------|
| Audit → findings → more work → dread | Assurance → findings → known gaps → closure → stronger |
| "Answer only what is asked" (defensive) | "Show me what's really happening" (collaborative) |
| Certification is a one-time achievement | Certification is a continuous claim, verified daily |
| Assurance is the assessor's job | Assurance is everyone's job |

---

## 2. Architecture Overview

### 2.1 Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Framework** | Next.js 16.2.9 | App Router, Turbopack (dev), full build (prod) |
| **Language** | TypeScript 5.x | Strict mode |
| **Database** | PostgreSQL | Railway managed, shared with seam-assurance-app |
| **ORM** | Prisma 7.8.0 | Custom client output to `src/generated/prisma` |
| **Auth** | NextAuth v5 | JWT-based, credentials provider, bcryptjs |
| **AI** | DeepSeek V4 (`deepseek-chat`) | Knowledgebase chat, document extraction |
| **Image Gen** | OpenAI GPT Image (`gpt-image-2`) | Badge image generation |
| **Styling** | Tailwind CSS | Utility-first, responsive |
| **Hosting** | Railway | Auto-deploy from `main` branch |

### 2.2 System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                   │
│  React Server Components + Client Components         │
│  Tailwind CSS · NextAuth Session · Company Cookie    │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (Server Actions + API Routes)
┌──────────────────────▼──────────────────────────────┐
│                 Next.js Server (Railway)              │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ App Router   │  │ API Routes│  │ Server Actions │  │
│  │ (RSC/SSR)   │  │ (REST)   │  │ (Mutations)   │  │
│  └──────┬──────┘  └────┬─────┘  └───────┬────────┘  │
│         │              │               │             │
│  ┌──────▼──────────────▼───────────────▼────────┐   │
│  │              Prisma Client                    │   │
│  │         (src/generated/prisma)                │   │
│  └──────────────────────┬───────────────────────┘   │
└─────────────────────────┼───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│              PostgreSQL (Railway)                     │
│  <DB host — see .env>                            │
│  50+ tables · 18,000+ rows · Shared with SA App      │
└─────────────────────────────────────────────────────┘
```

### 2.3 Data Flow Patterns

**Read Path (Server Components):**
```
Page (async RSC) → await prisma.model.findMany({ include, where })
  → Render HTML on server → Stream to client
```

**Write Path (API Routes):**
```
Client Component → fetch('/api/...', { method: 'POST', body })
  → Route Handler → requireAdmin() / requireAssessor()
  → Prisma create/update/delete → ActivityLog.write()
  → NextResponse.json(result)
```

**Real-time Updates:**
- Not implemented. Pages use `export const dynamic = "force-dynamic"` for fresh data on each request.

---

## 3. UI / UX Design

### 3.1 Visual Language

| Element | Specification |
|---------|--------------|
| **Primary Color** | Blue-600 (`#2563EB`) — actions, links, selected states |
| **Background** | Slate-50 (`#F8FAFC`) — page background |
| **Cards** | White, rounded-lg, shadow-sm, border-slate-200 |
| **Text** | Slate-900 (headings), Slate-700 (body), Slate-500 (muted) |
| **Status Colors** | Green-500 (Effective/Completed), Red-500 (Ineffective/Serious), Amber-500 (InProgress), Gray-400 (Planned) |
| **Typography** | System font stack (Inter, system-ui, sans-serif) |
| **Spacing** | Tailwind default scale (4px base), generous padding (p-4, p-6) |

### 3.2 Layout System

**Desktop (default):**
```
┌──────────────────────────────────────────────┐
│  NavBar (sticky top)                          │
│  Logo · Dashboard · Setup · Admin · Help · User│
├──────────────────────────────────────────────┤
│                                              │
│  Main Content Area (max-w-6xl, mx-auto)       │
│  - Page Header (title + metadata)             │
│  - Content (cards, tables, forms)             │
│                                              │
└──────────────────────────────────────────────┘
```

**Mobile (< 768px):**
```
┌──────────────────┐
│  ☰ Mobile Nav    │
├──────────────────┤
│  Content          │
│  (stacked, full   │
│   width, reduced  │
│   padding)        │
└──────────────────┘
```

### 3.3 Navigation Structure

```
/                          → Dashboard (role-based: Admin→admin, Assessor→fla)
/login                     → Login page
/setup/process-areas       → Process Areas (grouped by Standard, collapsible)
/setup/processdetails/[id] → Process Area detail (Knowledgebase, Requirements, Controls)
/setup/controls            → Control library
/fla                        → Assessment dashboard (list + create)
/fla/[id]                   → Assessment detail (tabs: Controls, Samples, Findings, Activities)
/fla/my-interviews          → Interviewee dashboard (assigned interviews only)
/fla/new                    → New assessment form
/help                       → In-app help with screenshots
/admin                      → Admin dashboard (users, backlog, database, etc.)
/admin?view=users           → User management
/admin?view=backlog         → Kanban backlog
/admin?view=database        → Database management (backup/restore)
/admin?view=extraction      → Document extraction
/admin?view=protocols       → Assurance protocols
/admin?view=knowledgebase   → Knowledgebase management
/admin?view=requirements    → Requirements viewer
/admin?view=badges          → Badge management
```

### 3.4 Key UX Patterns

**Card-Based Layouts:** Process Areas, Assessments, Controls, and Requirements all use card components with consistent metadata (counts, status badges, links).

**Collapsible Sections:** Standards group Process Areas; Assessment templates group controls; Requirements group mapped controls. Used extensively for progressive disclosure. Assessment assigned controls use a 2-level hierarchy (ProcessArea → Requirement) with both levels independently collapsible.

**Modal Forms:** Add/Edit operations use modal overlays (UserManager, ControlForm, ActionModal) to keep context visible.

**Tabbed Detail Pages:** Assessment detail uses tabs (Controls, Samples & Records, Findings & Actions, Activities) to organize complex data.

**Empty States:** Every list shows a helpful empty state message (e.g., "No process areas found for the selected company") rather than a blank page.

**Confirmation Dialogs:** Destructive actions (delete, clean templates) use `confirm()` dialogs with detailed descriptions of what will be affected.

---

## 4. Data Model & Entity Relationships

### 4.1 Entity Relationship Diagram (Core)

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│ Standard │────→│ ProcessArea  │←────│ Requirement │
│          │ 1:N │              │ 1:N │             │
│ sequenceNo│    │ name         │     │ rId (PK)    │
│ standard  │    │ standardId   │     │ requirementId│
└──────────┘     └──────┬───────┘     └──────┬───────┘
                        │                    │
                        │ 1:N                │ N:M
                        ▼                    ▼
                 ┌──────────┐     ┌──────────────────────┐
                 │ SubProcess│     │ MapControl2Requirement│
                 │          │     │ (controlId, reqRId)   │
                 └────┬─────┘     └──────────┬───────────┘
                      │ N:M                  │ N:M
                      ▼                      ▼
              ┌──────────────┐     ┌──────────────┐
              │ControlSubProc│     │   Control    │
              │(ctrlId, spId)│     │ name, type   │
              └──────────────┘     │ healthScore  │
                                   └──────┬───────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
          ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐
          │ControlAssignment│  │AssessmentTemplate │  │ ControlFromDoc │
          │(assessment, ctrl)│  │ControlLinkage     │  │ (AI extracted) │
          │effectiveness    │  │(template, ctrl)   │  │ status: Pending│
          └────────┬────────┘  └──────────────────┘  └────────────────┘
                   │
                   ▼
          ┌──────────────┐
          │  Assessment  │
          │  status, LOA │
          │  assessorId  │
          └──────┬───────┘
                 │
      ┌──────────┼──────────┐
      ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌──────────┐
│ Sample  │ │Finding │ │  Aact    │
│ status  │ │severity│ │(activity)│
│ control │ │FID-xxxx│ │AActUsers │
└────┬────┘ └───┬────┘ │AActDetail│
     │          │      └──────────┘
     │          ▼
     │   ┌───────────┐
     │   │  Action   │
     │   │ actionId  │
     │   │ closureDate│
     │   │ effective │
     │   └───────────┘
     ▼
┌──────────────┐
│  Attachment  │
│  (polymorphic)│
│  Mapping:    │
│  destTable,  │
│  recId       │
└──────────────┘
```

### 4.2 Complete Model Inventory

#### Core Domain Models

| Model | Table | PK | Key Fields | Company Scoped | Cascade |
|-------|-------|----|------------|---------------|---------|
| **Company** | `Company` | id (cuid) | companyID (unique), companyName, shortName | N/A (tenant root) | — |
| **Standard** | `Standard` | id (cuid) | standard, sequenceNo, companyId | `@@unique([standard, companyId])` | — |
| **ProcessArea** | `ProcessArea` | id (cuid) | name, standardId (FK→Standard), companyId | `@@unique([name, companyId])` | — |
| **SubProcess** | `SubProcess` | id (cuid) | name, processAreaId (FK→ProcessArea), companyId | No unique beyond PK | `onDelete: Cascade` (ProcessArea) |
| **Requirement** | `Requirement` | rId (Int) | requirementId, standard, clauseContent, processAreaId, companyId, **socStatus** (`SocStatus` enum — standing Statement of Compliance: FullyComply/PartiallyComply/NotComply, v1.13.7), **socSummary** (≤1000-char human summary) | `@@unique([requirementId, processAreaId, companyId])` | — |
| **Control** | `Control` | id (cuid) | name, statement, controlType, processAreaId (FK→ProcessArea, **nullable**), mappedAt (v1.13.0 — stamped when the mapping pipeline processed it), healthScore, companyId | `@@unique([name, companyId])` | — |
| **AssuranceProtocol** | `AssuranceProtocol` | id (cuid) | requirementId, rId (FK→Requirement), keyQuestions, whatGoodLooksLike, controlPoints | No company unique | `onDelete: Cascade` (Requirement) |

#### Junction / Mapping Models

| Model | Purpose | Unique Constraint |
|-------|---------|-------------------|
| **ControlSubProcess** | Control ↔ SubProcess (M:N) | `@@unique([controlId, subProcessId])` |
| **ControlFDSubProcess** | ControlFromDocument ↔ SubProcess (M:N) | `@@unique([controlFromDocumentId, subProcessId])` |
| **MapControl2Requirement** | Control ↔ Requirement (M:N); `mandatory` flag: **true = control is mandatory for the requirement, false = supporting only** (v1.13.0 semantics); `aiGenerated` (nullable boolean, raw-SQL column) flags AI-created rows for review | `@@unique([controlId, requirementRId])` |
| **AssessmentAssessor** | Assessment ↔ User (additional assessors) | `@@unique([assessmentId, userId])` |
| **AssessmentTemplateControlLinkage** | Template ↔ Control | `@@unique([templateId, controlId])` |
| **AssessmentTemplateActivityType** | Template ↔ ActivityType | `@@unique([templateId, activityTypeId])` |
| **BacklogItemControl** | Backlog item ↔ Control | `@@unique([backlogItemId, controlId])` |

#### Operational Tables (raw SQL, not Prisma-managed)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **ReconcileClaim** | Coordination table for parallel AI pipelines (v1.13.0): per-unit claim gate + launcher lease. Workers claim a unit via `INSERT ON CONFLICT (kbId) DO NOTHING`; stale claims (>20 min) are reclaimed. The row `kbId='__launcher__'` is the single-instance launcher lease (5s heartbeat, stale-reclaim >120s). **v1.13.1:** pipelines use distinct lease ids (`__launcher__` for extraction, `__launcher_map__` for mapping) so two pipelines can run concurrently. | kbId (text PK), shard (int), claimedAt, heartbeatAt |
| **RequirementCoverageAudit** | Coverage verdicts from the requirement-coverage audit pipeline (v1.13.2): one row per audited requirement with verdict **FullyMet/PartiallyMet/NotMet** (labels = `Conclusion` enum), howMetEvidence, gapAnalysis, proposedControlStatement (CSF format), mappedControlCount, aiGenerated. Mirrored into the app as one Assessment per PA + Findings/Actions for human review. | id `cov_<md5(rID)>` (text PK), companyId, processAreaId, requirementRId, standard, verdict, model (mapped from `model`), worker, covAt |
| **SocStatementAudit** | Statement-of-Compliance results from the SOC pipeline (v1.13.8): one row per requirement with verdict **FullyComply/PartiallyComply/NotComply** (labels = `SocStatus` enum), the ≤1000-char human summary, `source` (audit-bootstrap / mini-analysis), `covAuditBackfilled`. The row IS the completion marker; workers write-through `Requirement.socStatus`/`socSummary` in the same transaction. | id `soc_<md5(rID)>` (text PK), companyId, processAreaId, requirementRId, standard, verdict, summary, model, worker, socAt |
| **TestClaim** | Test-plan orchestration claim gate (`test_plan_supervisor.py`/`test_plan_worker.py`, v1.13.11): every test is a unit of work; tests group into chains claimed whole by one worker. status: `available|claimed|deferred|done|blocked`. | testId (text PK), chainId, area, mode (default `ui`), status (default `available`), workerId, leaseUntil, attempts, result, evidence, createdAt, updatedAt |
| **TestWorker** | Worker liveness rows (heartbeat) for the test-plan watchdog (v1.13.11). | workerId (text PK), pid, startedAt, lastBeat |

#### Assessment & Workflow Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | System user | name, username (unique), email, role (Admin/Superuser/Assessor/Interviewee), positionId (FK→Position), companyId, managerName, managerUsername, organisationIndicator. **v1.8.0:** Added managerName, organisationIdentifier fields. **v1.8.2:** Added managerUsername (resolved FK-like reference to User.username). **v1.13.15:** Added `providerRole` (`ProviderRole` enum, nullable, additive — **orthogonal** to the `role` enum; null = not provider staff) |
| **Department** | Org unit within a company | name, companyId, parentDepartmentId (self-referencing hierarchy, NULL = top-level) |
| **Position** | Job title scoped to Department | title, departmentId (FK→Department). @@unique([title, departmentId]) |
| **Assessment** | Frontline assurance check | status (Planned→InProgress→Completed/Cancelled), loa, assessorId (lead), activityTypeId, processAreaId (v1.13.2 — direct PA link for coverage audits + Standard→PA grouping; UI falls back to control assignments when null). **TOR fields (v1.6.5):** objective, scope, sponsor, methodology, keyFocus, reportIssueDate |
| **ControlAssignment** | Controls assigned to assessment | effectiveness (Effective/NotEffective/null), effectiveUpdatedAt |
| **Sample** | Record sample tested | status (Tested/NotTested), conclusion (Pass/Fail), controlEffective |
| **Finding** | Finding raised during assessment | severity (Low/Medium/High/Serious), repeat, FID-xxxxxx ID, **checklistItemId (v1.10.0)** — optional FK to AuditChecklistItem for traceability |
| **Action** | Remediation tied to finding | actionId, closureDate, closureEvidence, actionClosureEffective |
| **Aact** | Assurance activity (interview, meeting, doc review) | aaID (unique), activityName, activityDate |
| **AActUsers** | Participants in activity | userRoles, assignmentRemarks |
| **AActControls** | Controls mapped to activity | — |
| **AActDetails** | Activity detail/notes | checklists, activityNotes, summaryAgainstControls |

#### Audit Models (v1.10.0)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **AuditEvidence** | Evidence collected during audit | evidenceType (Document/Interview/Observation/Test/Sample), evidenceStatus (Collected/Reviewed/Accepted/Rejected), source, fileRef, collectedDate, assessmentId (FK→Assessment) |
| **AuditChecklist2Requirement** | Checklist item ↔ Requirement junction | checklistItemId (FK), requirementRId (FK), assessmentId (FK). @@unique([checklistItemId, requirementRId, assessmentId]) |
| **AuditChecklistTemplate** | Reusable checklist template | name, description, auditStandard (ISO9001/ISO14001/ISO45001/PMS), companyId (FK→Company). @@unique([name, companyId]). **v1.10.3:** `isGlobal` computed flag — templates owned by SAMS001 (comp_1783989395315) are global, visible to all companies via OR query. Non-SAMS001 templates are local. |
| **AuditChecklistTemplateItem** | Template line item (adopted by assessment) | checklistItemId (unique ID like QMS-7.1.5), checklistText, auditStandard, sortOrder, templateId (FK). @@unique([checklistItemId, templateId]) |
| **AuditChecklistItem** | Assessment-specific checklist instance | checklistItemId (copied from template), checklistText, auditStandard, complianceStatus (NotTested/Compliant/NonCompliant/NotApplicable/Observation), auditorNotes, testedDate, testedBy, evidenceMethod, sortOrder, assessmentId (FK), templateItemId (FK→AuditChecklistTemplateItem, nullable). @@unique([checklistItemId, assessmentId]) |
| **AssessmentChecklistControl** | Explicit junction: checklist item ↔ control ↔ assessment | @@unique([checklistItemId, controlId]) |
| **RequirementConclusion** | Per-assessment per-requirement auditor judgment | conclusion (FullyMet/PartiallyMet/NotMet), narrative, lastAssessedDate |

#### Conversation Fabric Models (v1.13.18, SAMS-004 Phase 2a)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Comment** | One polymorphic comment entity (thread target = `entityType` + `entityId`, mirroring the AttachmentMapping destTable/recId convention). Entities v1: `Finding`, `EvidenceRequest`. Flat threads (`parentCommentId`, one level). Append-only v1 (no edit/delete). `authorPlane` (Provider/Client) derived from the session, never client-supplied; per-comment `visibility` (Internal/SharedWithClient). Default authorPlane=Provider, visibility=Internal. | id (cuid), entityType (String), entityId, parentCommentId (self-ref → Comment, `onDelete: SetNull`), authorUserId (FK→User), authorPlane (`CommentAuthorPlane` enum, default Provider), visibility (`CommentVisibility` enum, default Internal), body (≤4000), companyId, createdAt. Indexes: (entityType, entityId), (companyId), (authorUserId). |
| **EvidenceRequest** | DRL unit — the structured evidence-request pipeline. State machine `Draft→Requested→Submitted→Accepted\|Rejected(→Submitted again)\|NotApplicable`. Files via the EXISTING polymorphic Attachment system (`destTable='EvidenceRequest'`). Requestees see only their own (`?mine=1`); assessors/provider see all company requests. | id (cuid), companyId, assessmentId (FK→Assessment, optional, `onDelete: SetNull`), requirementRId (Int, optional), controlId (optional), title (≤200), instructions (≤2000), requestedByUserId (FK→User), requestedFromUserId (FK→User), dueDate, status (`EvidenceRequestStatus` enum, default Draft), submittedNote, reviewNote, submittedAt, reviewedAt, createdAt, updatedAt. Indexes: (companyId, status), (requestedFromUserId, status). |

#### Gamification Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **PointTransaction** | Every point event | points, reason, emotionalDrive, multiplier, gameAttributeId |
| **GameAttribute** | XP category (maps to process area) | attributeName (unique), attributeStatus |
| **GameAttributeRule** | Scoring rules per attribute + activity type | basePoints, perControlPoints, qualityBonus, multiplier |
| **AchievementBadge** | Badge definitions | badgeName, emotionalDrive, rarity, level, pointsRequired |
| **UserAchievement** | Earned badges | `@@unique([userId, badgeId])` |
| **EmotionalDriveMetric** | Octalysis 8-drive scores | per-user per-period, overallEngagement |
| **Milestone** | Goal tracking | targetValue, currentValue, type, completedAt |
| **GamificationStage** | Per-company gamification stage activation / advancement | companyId, stage, activatedAt, advancedAt, advancedBy |

#### Organizational Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | System user | username (unique), role (Admin/Superuser/Assessor/Interviewee), positionId, companyId, managerName, managerUsername, organisationIndicator |
| **Department** | Organizational unit | name, companyId, parentDepartmentId (self-ref hierarchy) |
| **Position** | Job position | title, departmentId |
| **UserCompany** | User ↔ Company (M:N) | `@@unique([userId, companyId])` |
| **UserRole** | Custom role definition | uRoleName, companyId |
| **UserRoleMapping** | User ↔ UserRole (M:N) | `@@unique([userId, userRoleId])` |
| **UserFavorite** | User bookmarks | `@@unique([userId, entityType, entityId])` |

#### Knowledge & Document Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Knowledgebase** | Knowledge entries | knowledgeName, knowledgeContent, companyId, processAreaId, **reconciledAt (v1.13.1)** — timestamptz, authoritative "doc reconciled" marker stamped by the reconciliation pipeline after a doc completes (inserts AND update-merges); **LMS metadata** (v1.13.11 — `documentNumber`, `nextReviewDate`, `custodianOwner`, `authorizer`, `department`; backfilled from `lms.csv` via `scripts/db/kb_lms_backfill.py`); **transcript fields (2026-08-29)** — `entryType` enum `{Knowledge\|Transcript}` (authoritative transcript discriminator, default `Knowledge`), `meetingDate`, `participants` (nullable, transcript-only) |
| **Tag** | Company-scoped reusable label | name, companyId, `@@unique([name, companyId])` (2026-08-29) |
| **KnowledgebaseTag** | KB entry ↔ Tag (M:N junction) | kID, tagId, `@@unique([kID, tagId])` (2026-08-29) |
| **MapArt2Know** | Article ↔ Knowledge mapping | artName, artID, kID, whyToMap |
| **DocumentExtract** | Uploaded source document | documentTitle, content (extracted text), status |
| **ControlFromDocument** | AI-extracted control candidate | CSF fields, status (Pending→Approved/Rejected) |
| **Attachment** | File attachment | fileName, filePath, fileSize, uploadedBy |
| **AttachmentMapping** | Polymorphic FK to any entity | destTable, recId |
| **Document** | Document record — versioned, PA-linked | documentNo, version, isLatest, archivedAt, companyId, source, folder, filename, processAreaId, summary, documentContent |
| **MapRequirement2Document** | M:N requirement ↔ document (traceability) | requirementRId, linkedBy, linkedAt |

#### Supporting Models

| Model | Purpose |
|-------|---------|
| **ActivityLog** | Audit trail of all mutations |
| **ActivityLogType** | Activity type registry |
| **AssuranceActivityType** | Activity type definitions (Interview, Document Review) |
| **AssessmentActType** | Assessment activity type registry |
| **AssessmentTemplate** | Reusable assessment templates |
| **SampleType** | Sample type lookup |
| **RecordSourceType** | Record source type lookup |
| **BacklogItem** | Kanban backlog items |
| **WebhookLog** | Inbound webhook event log |

#### Risk Models (v1.12.0)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **RiskCategory** | Standard Risk Library taxonomy (3-level hierarchy, 204 risks / 34 categories / 15 domains) | externalId, title, level, parentId, domain, category, categoryCode, ranking, processAreaId |
| **Risk** | Specific business risk | riskID (RSK-xxx, editable), currentImpact/currentLikelihood, unmitigatedImpact/unmitigatedLikelihood, objectives, riskEvent, rootCauses, consequences, riskCategoryId |
| **RiskMetrics** | 1 Risk → Many Metrics (time-series appetite tracking) | defWithinAppetite/defNearAppetite/defOutsideAppetite, currentStatus, statusUpdatedOn |
| **ControlRisk** | M:N Risk ↔ Control | role (Primary/Secondary/Supporting), riskWeight |

### 4.3 Key Design Decisions

#### Composite Unique Constraints
All company-scoped tables use `@@unique([businessKey, companyId])` rather than single-column `@unique`. This prevents cross-company uniqueness violations during template adoption.

**Affected models:** Standard, ProcessArea, Requirement, Control, AssessmentTemplate, UserRole, Department, Position

#### Polymorphic Attachments
`AttachmentMapping` uses `(destTable, recId)` instead of FK constraints. This allows any entity (Sample, Finding, Action, Aact) to have attachments without schema changes. Manual cleanup required on parent deletion (no cascade possible).

#### Running-Number IDs
`Finding.id` uses format `FID-XXXXXX` (human-readable running number) instead of cuid. Generated in application code (`src/lib/findings.ts`), not auto-generated by Prisma.

#### Requirement rID as PK
`Requirement.rId` (Int) is the primary key — imported from source data (`mRequirement.csv`), not auto-generated. This makes it stable for FK references from `MapControl2Requirement` and `AssuranceProtocol`.

---

## 5. Route Map — Pages & API

### 5.1 UI Pages

| Route | Type | Auth | Description |
|-------|------|------|-------------|
| `/` | RSC (redirect) | Auth | Redirects Admin→/admin, Assessor→/fla |
| `/login` | Client | Public | Username + password form |
| `/setup/process-areas` | RSC | Auth | Process Areas grouped by Standard (collapsible) |
| `/profile` | RSC + Client | Auth | User profile: Overview (gamification dashboard) + User Details (read-only with edit, now includes Department, Position, Manager, Org Indicator) tabs |
| `/setup/processdetails/[id]` | RSC + Client | Auth | PA detail: Overview, Requirements & Controls, Assessments, Knowledgebase, Documents, Improvement tabs |
| `/setup/controls` | RSC | Auth | Full control library (filterable) |
| `/fla` | RSC | Assessor+ | Assessment list + create button |
| `/fla/[id]` | Client | Assessor+ | Assessment detail with tabs |
| `/fla/my-interviews` | Client | Auth | Interviewee's assigned interviews |
| `/fla/my-evidence-requests` | Client | Auth | **v1.13.18:** Requestee evidence-request home — cards per request (instructions, due date w/ overdue flag, status, submit box note + attachment, resubmit after rejection with review note visible). Loads `GET /api/evidence-requests?mine=1`; requestee sees only their own. |
| `/fla/new` | Client | Assessor+ | New assessment form |
| `/help` | Static | Auth | In-app help with screenshots |
| `/admin` | Client | Admin | Admin dashboard with view switching |
| `/operator` | RSC + Client | Provider | **v1.13.15:** Cross-client Operator Console (read-only portfolio). Provider-gated (`session.user.providerRole`); non-provider → 403 view. Rows click-through → `POST /api/operator/context-switch` → lands in the target company's `/admin` or `/fla`. |
| `/admin?view=users` | Client | Admin | User CRUD (UserManager) |
| `/admin?view=backlog` | Client | Admin | Kanban backlog board |
| `/admin?view=database` | Client | Admin | DB management (backup/restore/execute SQL) |
| `/admin?view=extraction` | Client | Admin | Document upload & AI extraction |
| `/admin?view=manager-assignment` | Client | Admin | Manager assignment — three sections: (1) Distinct Managers with inline auto-save on blur + status filter (All/✓/✗/tbc), (2) Not in User Table collapsible, (3) User-by-User filterable table (All/Resolved/TBC) |
| `/admin?view=protocols` | Client | Admin | Assurance protocols table |
| `/admin?view=knowledgebase` | Client | Admin | Knowledgebase management: entry editor, Standard→PA tree listing (List Knowledge), and Map Standard/PA tab (multi-select mapping) |
| `/admin?view=requirements` | Client | Admin | Requirements viewer |
| `/admin?view=badges` | Client | Admin | Badge management |

### 5.2 API Routes

#### Admin APIs (`/api/admin/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/admin/users` | GET/POST | Admin | List all users / Create user |
| `/api/admin/users/quick-add` | POST | Admin | Quick-add a user with minimal fields (name, username only) — used by ManagerAssignmentView to onboard managers not in the system |
| `/api/admin/users/[id]` | PUT/DELETE | Admin | Update/Delete user |
| `/api/admin/assessments` | POST | Admin | Create assessment + spawn template activities |
| `/api/admin/assessments/[id]` | PUT/DELETE | Assessor | Update assessment fields / Delete with cascade |
| `/api/admin/backlog` | GET/POST | Admin | List backlog / Add item |
| `/api/admin/backlog` | PATCH | Admin | Update backlog item status |
| `/api/admin/backfill-activities` | POST | Admin | Backfill missing assessment activities |
| `/api/admin/database/backup` | GET | Admin | Download full SQL dump |
| `/api/admin/database/restore` | POST | Admin | Restore from SQL file upload |
| `/api/admin/manager-assignment` | POST | Admin | Bulk-update `managerUsername` for all users with given `managerName` |
| `/api/admin/extraction` | POST | Admin | Upload + AI-extract controls from document |
| `/api/admin/assurance-protocols` | GET | Auth | Search/filter/paginate assurance protocols |
| `/api/admin/table/Knowledgebase/data` | POST | Admin | Knowledgebase table data (specific route — generic `table/[table]/data` removed) |
| `/api/admin/table/MapControl2Requirement/data` | GET/POST | Admin | MapControl2Requirement table data (specific route — generic `table/[table]/data` removed) |
| `/api/admin/table/Assessment/[id]/assessors` | PUT | Admin | Sync assessment assessors |
| `/api/admin/table/MapControl2Requirement/[id]` | DELETE | Admin | Remove control-requirement mapping |
| `/api/admin/table/Requirement/[rId]` | PUT | Admin | Update requirement fields (`requirementId`, `clauseContent`, `socStatus`, `socSummary` — v1.13.7) |
| `/api/admin/table/Knowledgebase/[id]` | PATCH | Admin | Map a KB entry to a ProcessArea (update `processAreaId`) |
| `/api/admin/table/Knowledgebase/map` | POST | Admin | **v1.11.9:** Batch-map N KB entries to a ProcessArea in one request — `{ ids: string[], processAreaId }` via single UPDATE |
| `/api/admin/assessments/checklist-templates` | GET | Auth | List available checklist templates for current company |
| `/api/admin/assessments/[id]/adopt-checklist` | POST | Assessor | Clone selected template items into assessment checklist (v1.10.0) |
| `/api/admin/assessments/[id]/checklist` | GET | Assessor | Get assessment checklist items with enriched mapped controls (v1.10.0) |
| `/api/admin/assessments/[id]/checklist/[itemId]` | PATCH | Assessor | Update checklist item compliance status, auditor notes, evidence method (v1.10.0) |
| `/api/admin/audit-checklist-templates` | POST | Admin | Create new checklist template (v1.10.0) |
| `/api/admin/audit-checklist-templates/[id]` | PUT/DELETE | Admin | Update/Delete template (v1.10.0) |
| `/api/admin/audit-checklist-templates/[id]/items` | GET/POST | Admin | List/Add template items (v1.10.0) |
| `/api/admin/audit-checklist-templates/[id]/items/[itemId]` | PUT/DELETE | Admin | Update/Delete template item (v1.10.0) |
| `/api/admin/audit-checklist-templates/[id]/adopt` | POST | Admin | **v1.10.3:** Clone global template to current company — copies template + all items with `[COMPANY]` prefix. Returns 409 if already adopted (duplicate name). |
| `/api/admin/assessments/[id]/requirement-tree` | GET | Assessor | **v1.11.3:** Returns Standard → ProcessArea → Requirement → Control tree with `assignedControlIds`, `controlLocations` (multi-requirement awareness), and `unmappedControls`. Shows ALL requirements including zero-control gaps. |
| `/api/admin/assessments/[id]/controls/remove` | POST | Assessor | **v1.11.3:** Bulk-remove control assignments by `controlIds[]` array. Returns `{ removed, requested }`. |
| `/api/admin/export/controls` | GET | Admin | **v1.13.11:** Company-scoped controls CSV export — `?companyId=`. One row per Control×Requirement mapping (many-to-many duplicates), unmapped controls included once; all business Control columns (introspected) + requirement_id/clause/intent/applicability + both PA/Standard pairs + mapping_mandatory. |
| `/api/admin/assessments/[id]/checklist-controls` | GET/POST | Assessor | List / link controls to checklist items |
| `/api/admin/assessments/[id]/checklist-controls/[junctionId]` | DELETE | Assessor | Unlink a checklist-control junction |
| `/api/admin/assessments/[id]/checklist-requirements` | DELETE/POST | Assessor | Link / unlink checklist items to requirements |
| `/api/admin/assessments/[id]/control-effectiveness` | PUT | Assessor | Set a control's effectiveness in the assessment |
| `/api/admin/assessments/[id]/controls` | GET/POST | Assessor | List / assign controls in an assessment |
| `/api/admin/assessments/[id]/recalculate-health` | POST | Admin | Recompute control health for the assessment |
| `/api/admin/assessments/[id]/requirement-conclusions` | PUT | Assessor | Persist `RequirementConclusion` (v1.11.4) |
| `/api/admin/assessments/[id]/ai-analysis` | POST | Assessor | DeepSeek v4 full-audit analysis (Executive Summary, Patterns, Risk, Recommendations) |
| `/api/admin/assessment-hierarchy` | GET | Admin | Full assessment hierarchy |
| `/api/admin/requirement-documents` | GET | Admin | Requirements with linked documents |
| `/api/admin/documents` | GET | Admin | List documents |
| `/api/admin/control-assignments` | POST | Assessor | Create a control assignment |
| `/api/admin/control-assignments/[id]` | DELETE/PUT | Assessor | Update / remove a control assignment (moved to top-level) |
| `/api/admin/standards` | GET | Admin | List standards |
| `/api/admin/standards/[id]` | DELETE/PUT | Admin | Update / delete a standard |
| `/api/admin/standards-list` | GET | Admin | List standards |
| `/api/admin/processareas` | GET | Admin | List process areas |
| `/api/admin/processareas/[id]` | DELETE/PUT | Admin | Update / delete a process area |
| `/api/admin/requirements` | GET | Admin | List requirements |
| `/api/admin/controls` | GET | Admin | List controls |
| `/api/admin/controls/[id]` | DELETE/PUT | Admin | Update / delete a control |
| `/api/admin/controls/tree` | GET | Admin | Control hierarchy tree |
| `/api/admin/map-control-requirement` | POST | Admin | Map a control to a requirement |
| `/api/admin/companies` | GET/POST | Admin | List / create companies |
| `/api/admin/companies/[id]` | DELETE/PUT | Admin | Update / delete a company |
| `/api/admin/company/[id]/bootstrap` | POST | Admin | Bootstrap a new company from SAMS001 master data |
| `/api/admin/org-chart` | GET | Admin | Recursive CTE org tree |
| `/api/admin/departments` | GET/POST | Admin | List / create departments |
| `/api/admin/departments/[id]` | DELETE/PUT | Admin | Update / delete a department |
| `/api/admin/findings` | POST | Assessor | Create a finding |
| `/api/admin/findings/[id]` | DELETE/PUT | Assessor | Update / delete a finding |
| `/api/admin/samples` | POST | Assessor | Create a sample |
| `/api/admin/samples/[id]` | DELETE/PUT | Assessor | Update / delete a sample |
| `/api/admin/gamification/readiness` | GET | Admin | Gamification readiness check |
| `/api/admin/gamification/advance` | POST | Admin | Advance a gamification stage |
| `/api/admin/gamification/core-drives` | GET | Admin | Octalysis 8-drive calculator |
| `/api/admin/gamification/import-csv` | POST | Admin | Import gamification data from CSV |
| `/api/admin/badges` | GET | Admin | List badges |
| `/api/admin/badges/[id]` | DELETE/PUT | Admin | Update / delete a badge |
| `/api/admin/badges/generate` | POST | Admin | Generate a badge image |
| `/api/admin/assessment-templates/[id]` | PUT | Admin | Update an assessment template |
| `/api/admin/assessment-templates/[id]/adopt` | POST | Admin | Adopt an assessment template |
| `/api/admin/assessment-templates/[id]/share` | POST | Admin | Share an assessment template |
| `/api/admin/actions` | POST | Admin | Create an action |
| `/api/admin/actions/[id]` | DELETE/PUT | Admin | Update / delete an action |
| `/api/admin/activities` | GET/POST | Admin | List / create activities |
| `/api/admin/activities/[id]` | DELETE/PUT | Admin | Update / delete an activity |
| `/api/admin/activity-controls` | POST | Admin | Link an activity to a control |
| `/api/admin/activity-controls/[id]` | DELETE | Admin | Unlink an activity-control |
| `/api/admin/activity-details` | POST | Admin | Create activity details |
| `/api/admin/activity-users` | POST | Admin | Link an activity to a user |
| `/api/admin/activity-users/[id]` | DELETE | Admin | Unlink an activity-user |
| `/api/admin/template-activities/[id]` | PUT | Admin | Update a template activity |
| `/api/admin/pip` | GET/POST | Admin | PIP Kanban list / create |
| `/api/admin/pip/[id]` | DELETE/PATCH | Admin | Update / delete a PIP item |
| `/api/admin/pip/mic` | POST | Admin | Save a MIC statement |
| `/api/admin/reset-health` | GET/POST | Admin | Reset control health scores |
| `/api/admin/users/[id]/reorder` | PUT | Admin | Reorder org-chart siblings |
| `/api/admin/extraction/documents` | GET | Admin | List extraction documents |
| `/api/admin/extraction/extract` | POST | Admin | Run AI extraction |
| `/api/admin/extraction/upload` | POST | Admin | Upload a source document for extraction |
| `/api/admin/database/export-controls` | GET | Admin | Export controls CSV (legacy SAMS001-hardcoded, deduped) |
| `/api/admin/database/export-requirements` | GET | Admin | Export requirements CSV |
| `/api/admin/table/Assessment/[id]` | PUT | Admin | Update an Assessment row |

#### Assessor APIs (`/api/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/attachments` | POST | Assessor | Upload file + create Attachment + Mapping |
| `/api/attachments/[id]` | DELETE | Assessor | Delete attachment + mappings |
| `/api/health` | GET | Public | Health check |
| `/api/my/interviews` | GET | Auth | List user's assigned interviews |
| `/api/my/interviews/[assignmentId]` | PUT | Auth | Update an assigned interview for the current user |

#### Operator APIs (`/api/operator/*`) — v1.13.15 (Provider plane)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/operator/portfolio` | GET | Provider | Read-only cross-client portfolio JSON. Provider-gated (`session.user.providerRole`); 403 for non-provider. Per company: SOC coverage counts (FullyComply/PartiallyComply/NotComply/NotAssessed from `Requirement.socStatus`), open findings, open actions (overdue flagged), in-progress assessments, user count, KB count, last-activity ts. Every query carries `companyId` (nested relation traversal for Finding→Assessment, Action→Finding→Assessment — never dropped). |
| `/api/operator/context-switch` | POST | Provider | Audit a provider company-context switch: writes an `ActivityLog` row (`activityType=PROVIDER_CONTEXT_SWITCH`, before/after = old/new selected company) when the selected company changes, sets the `selectedCompanyId` cookie, returns `{ redirectTo }` for `/admin` (role=Admin) or `/fla`. 403 for non-provider. |

#### Conversation Fabric APIs — v1.13.18 (SAMS-004, Phase 2a)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/comments` | GET | Auth | Thread for a polymorphic target (`?entityType=Finding\|EvidenceRequest&entityId=`), visibility-filtered server-side by the session plane. Provider-plane session → everything; client session → client-authored + provider-`SharedWithClient` comments, NEVER provider-`Internal`. Cross-company target → 403. |
| `/api/comments` | POST | Auth | Create a comment. `authorPlane` derived from the session (providerRole → Provider), never client-supplied. Client authors cannot set `visibility=Internal` → 400; body required ≤4000; cross-company target → 403; parentCommentId must belong to the same thread. |
| `/api/evidence-requests` | POST | Assessor/Provider | Create an EvidenceRequest (DRL unit) in `Draft`. Requires title (≤200) + instructions (≤2000) + `requestedFromUserId`. Writes an `EVIDENCE_REQUEST_CREATED` ActivityLog row. Cross-company → 403 for non-provider. |
| `/api/evidence-requests` | GET | Auth | Role-scoped listing. `?mine=1` → the caller's OWN requests (any status), any authenticated user. Without `?mine=1` → all company requests, assessor/provider only, scoped to the caller's company. |
| `/api/evidence-requests/[id]` | PATCH | Auth | Drive the DRL state machine. `send` (Draft→Requested), `submit` (Requested/Rejected→Submitted; requestee only; 422 if neither note nor attachment), `accept` (→Accepted, terminal), `reject`+`reviewNote` (→Rejected), `na` (→NotApplicable). Invalid transitions → 409. Every transition writes an `EVIDENCE_REQUEST_STATUS` ActivityLog row with before/after status. Requestee can only act on their own request; requestee cannot `submit` for another; assessor/provider cannot `submit`. |

#### AI APIs

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/chat/knowledge` | POST | Auth | DeepSeek chat with knowledgebase context |
| `/api/chat/knowledge/upload` | POST | Auth | Upload doc/image → text extraction or vision → Document row (optional `folder` field: `Uploaded` from Documents tab, default `AI Chat`) |
| `/api/documents/[id]` | PATCH | Assessor+ | Edit document summary |
| `/api/documents/[id]` | DELETE | Admin | Soft-delete (archive) document; shared (SAMS001) docs only while SAMS001 selected |


#### Gamification APIs

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/gamification/award` | POST | Auth | Award points via rule engine + evaluate badges |
| `/api/gamification/certificate` | POST | Auth | Generate a competency certificate |
| `/api/gamification/events` | POST | Auth | Generic event ingestion — single entry point for all gamification events (internal + external) |
| `/api/gamification/stats` | GET | Auth | User gamification stats (overallXP, tracks, levels) |
| `/api/webhooks/[source]` | POST | Auth | External webhook receiver |

#### Auth API

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/[...nextauth]` | ALL | NextAuth handler (login, session, JWT) |

---

## 6. Component Library

### 6.1 Shared UI Components (`src/components/`)

| Component | Type | Purpose |
|-----------|------|---------|
| **NavBar** | Server | Top navigation bar with role-based links |
| **MobileNav** | Client | Hamburger menu for mobile |
| **Card** | Server | Reusable card wrapper (padding, hover, border) |
| **Button** | Server | Styled button with variants |
| **Input** | Server | Form input with label |
| **Select** | Server | Dropdown select with label |
| **Modal** | Client | Overlay modal with backdrop |
| **Table** | Client | Sortable data table |
| **Badge** | Server | Status/rarity badge pill |
| **StatusBadge** | Server | Assessment/Finding status indicator |
| **Toast** | Client | Notification toast |
| **CollapsibleSection** | Client | Expandable section with title + count |
| **CompanySelector** | Client | Dropdown to switch active company |
| **HealthIndicator** | Server | Control health percentage bar |
| **SignOutButton** | Client | Sign out action |
| **OfflineBanner** | Client | Offline detection banner |
| **VoiceInput** | Client | Web Speech API voice input |

### 6.2 Domain Components

| Component | Type | Purpose |
|-----------|------|---------|
| **ProcessAreaCard** | Server | PA summary card (name, standard, counts) |
| **ProcessAreaList** | Client | Groups PAs by Standard with collapsible sections |
| **RequirementCard** | Server | Requirement summary card; header shows SOC badge (Fully/Partially/Not Comply); expanded state renders the **Statement of Compliance** section (status + ≤1000-char summary, ✏️ edit for SPO/Admin → `PUT /api/admin/table/Requirement/[rId]`) plus the control table with Control / Type / Health / **Mandatory** columns (★ toggle, SPO/Admin only; drag-drop remap); control name is a link opening the CSF detail modal |
| **ControlDetailModal** | Client | Pop-up modal for one control: statement, attributes (type/detail, HSSE critical, risk weight, RAM, health, last tested, mapped requirement), CSF core (Who/What/When/Where/Why/How/Evidence), enrichment & assurance, traceability — all from the already-serialized control object (no extra fetch) |
| **AssessmentCard** | Server | Assessment summary card with status |
| **AssessmentActivitiesPanel** | Client | Activity list + document review guidance |
| **FindingCard** | Client | Finding detail with actions |
| **ActionModal** | Client | Add/Edit action modal |
| **ActionRowClient** | Client | Single action row with expand/collapse |
| **AttachmentList** | Client | File upload + list for any entity |
| **CommentThread** | Client | **v1.13.18:** Reusable flat comment thread for a polymorphic target. Renders author name + 🛡 provider badge, visibility badge on provider comments (🔒 Internal / 🌐 Shared), and a composer with a visibility toggle (provider authors only). Client authors cannot pick Internal (toggle hidden; server 400s). Mounted on Finding cards + EvidenceRequest detail. |
| **EvidenceTab** | Client | **v1.13.18:** 📨 Evidence tab on `/fla/[id]` — evidence-request list w/ status chips + overdue flag, create form (title, instructions, `UserSearchSelect` requestee picker, due date), accept / reject (review note) / not-applicable transitions, requestee submit surface, reuses `AttachmentList` + `CommentThread` per request. |
| **MyEvidenceRequestsClient** | Client | **v1.13.18:** Requestee home on `/fla/my-evidence-requests` — cards per request (instructions, due date overdue red, status, submit note + attachment, resubmit after rejection with review note visible). |
| **GamificationPanel** | Server | Points + badges display |
| **KnowledgebasePanel** | Client | KB entry tree + content viewer/editor |
| **KanbanBoard** | Client | Drag-and-drop backlog board |
| **UserManager** | Client | User CRUD with modal forms |
| **UserSearchSelect** | Client | Typeahead user search |
| **MyInterviewsClient** | Client | Interviewee interview list |
| **AssignedControlsList** | Client | **Superseded by ControlTreePanel (v1.11.3).** 2-level hierarchy (PA→Req→Ctrl) for assigned controls with inline effectiveness, tooltips, and remove. |
| **ControlTreePanel** | Client | **v1.11.3:** Reusable tree-view for control assignment: Standard → ProcessArea → Requirement → Control with checkboxes at every level. Cascade logic: check control → check req; check req → check all child controls. Multi-location awareness (🔗N badge + popup when control exists in other PAs). Filter by requirement/control text. "Selected Assignments" summary panel below tree grouped by PA → Req → Control with per-control ✕ remove. Fetches from `GET /api/admin/assessments/[id]/requirement-tree`. Replaces `RequirementControlPanel` in both MinimalistView and Classic views. |
| **AuditReportTab** | Client | **v1.11.3:** Printable audit report. Compliance Matrix table at top (Requirement No | Requirement | Comply Y/N | Compliance Statement — Fully/Partially/Not complied with gap bullet points) aggregated per-requirement. Below: Terms of Reference, Checklist Compliance Summary by standard, Control Effectiveness cards, Findings with linked actions, AI Insights (DeepSeek), footer. |
| **DocumentsPanel** | Client | PA document library: Shared (SAMS001) + Company collapsible sections, multi-file upload (shared checkbox when SAMS001 selected), expandable content viewer, inline summary edit, admin soft-delete with master-company guard |
| **ProfileTabs** | Client | Profile page with Overview (gamification dashboard) and User Details (read-only with edit toggle) tabs |
| **UserDetailsTab** | Client | User info card (name, username, email, role, position, department, manager, org indicator, member since, points) + company memberships; edit mode with inline form |
| **UserManager** | Client | Two-panel admin view: left (search + company-grouped user list with expand/collapse, compact Name+Role rows) + right (edit form with Department/Position dropdowns, Manager, Organisation Indicator, Role, Companies, Delete) |

### 6.3 Admin View Components (`src/app/admin/`)

| Component | Purpose |
|-----------|---------|
| **AssuranceProtocolView** | Filterable, paginated protocol table with expandable rows |
| **BadgesView** | Badge catalogue viewer |
| **ExtractionView** | Document upload + AI extraction UI |
| **KnowledgebaseView** | Knowledgebase entry editor |
| **ListKnowledgeView** | **v1.11.9:** KB listing as 3-level collapsible tree — Standard (count) → ProcessArea (count) → entries, with search filtering the tree |
| **MapKnowledgeView** | **v1.11.9:** Two-panel mapping UI. Left: Standard → ProcessArea collapsible tree with per-entry checkboxes (multi-select), search, "Only unmapped (N)" filter, "Select all (N)"/"Clear" actions; docs organized under their mapped PA. Right: cascading Standard → ProcessArea dropdowns + "Save Mapping" (1 entry) / "Map N Entries" (batch) via `POST /api/admin/table/Knowledgebase/map`. Optimistic local updates + toast. |
| **ManagerAssignmentView** | Three-section manager→username resolution: (1) Distinct Managers with uncontrolled inputs (auto-save on blur via POST /api/admin/manager-assignment) + Status column filter buttons (All/✓ in table/✗ not found/tbc), (2) "Not in User Table" collapsible details, (3) User-by-User filterable table (All/Resolved/TBC) with inline dropdown edit |
| **RequirementsView** (v1.10.11) | Requirements browser grouped by Standard → ProcessArea. **Control mapping:** ProcessArea dropdown filter → search controls by name. "＋ Add Control" links via `MapControl2Requirement`. **"＋ New Control"** inline form creates control + auto-links in one action. "× Remove" on hover. Optimistic local updates. Global company-level mapping — assessments inherit automatically. |
| **ChecklistTemplateSelector** (v1.10.0) | Client component — multi-select checklist templates via checkboxes, "Adopt Selected Checklist(s)" button → POST adopt-checklist API, success/error feedback |
| **AssessmentChecklistTab** (v1.10.0) | Client component — grouped by auditStandard collapsible sections, per-item compliance status dropdown (Not Tested/Compliant/Non-Compliant/N.A./Observation), control-to-requirement trace display (Requirement ID → Control Name → Source File), auditor notes inline |
| **AuditChecklistTemplateAdminView** (v1.10.3) | Client component — template CRUD with Global/Local filter toggles (All | 🌐 Global | 🏢 Local). Global templates (SAMS001-owned) are read-only for non-SAMS001 companies, show "📥 Copy to Local" button. Local templates fully editable (✏️ / 🗑). Template list expandable with inline item editing. |
| **ExportDataView** (v1.13.11) | Client component — SysAdmin → 📤 Export Data. Shows the selected company, "⬇ Export Controls (CSV)" button → downloads `{companyID}_controls_{ts}.csv` from `GET /api/admin/export/controls?companyId=`. Disabled (with guidance) when no company is selected. |

---

## 7. Gamification Engine

### 7.1 Design Reference

Full gamification design doc: `02 Design and Backup/SEAM_Process_Gamification_Design.md`
Framework: **Octalysis** (8 Core Drives)

### 7.2 Point Economy

| Role | Action | Points | Rationale |
|------|--------|--------|-----------|
| Lead Assessor | Conduct assessment | 10 | Highest responsibility |
| Assessor | Conduct assessment | 5 | Core assurance work |
| Interviewee | Participate in interview | 1 | Participation recognized |
| Worker | Sampled work **effective** | 10 | Recognition for doing the boring job well |
| Worker | Sampled work **ineffective** | 0 | Learning conversation, not punishment |

### 7.3 XP per Process Area

`GameAttribute` maps to process areas. Points earned in an assessment for a specific PA accumulate in that attribute — creating competency demonstration. In the future, this feeds "has this person done PM cleanup X times?" analytics.

### 7.4 Three Visibility Layers

| Layer | Audience | Data Source |
|-------|----------|-------------|
| **Business Objective Indicator** | Site leadership | Aggregate control effectiveness across all PAs |
| **Team Leaderboard** | Departments | Cumulative points per department per period |
| **Individual Competency Tracks** | All users | XP per process area, per role |

### 7.5 Team Model

```
Company → Department → Position → User
```

- Department has self-referencing `parentDepartmentId` for hierarchy
- Points roll up: User → Position → Department → Company
- Competition is **abundance-based**: all departments can win by doing their own work well
- Individual contributions are traceable (no free-riding)

### 7.6 Current Implementation Status

**All core gamification modules deployed (v1.5.0):**

| Module | File | Status |
|--------|------|--------|
| Rule Engine | `src/lib/gamification/ruleEngine.ts` | ✅ Deployed |
| Badge Engine | `src/lib/gamification/badgeEngine.ts` | ✅ Deployed |
| Stage Manager | `src/lib/gamification/stageManager.ts` | ✅ Deployed |
| Drive Calculator | `src/lib/gamification/driveCalculator.ts` | ✅ Deployed |
| Event Ingestion API | `POST /api/gamification/events` | ✅ Deployed |
| CSV Import API | `POST /api/admin/gamification/import-csv` | ✅ Deployed |
| Webhook Receiver | `POST /api/webhooks/[source]` | ✅ Deployed |
| Readiness API | `GET /api/admin/gamification/readiness` | ✅ Deployed |
| Advancement API | `POST /api/admin/gamification/advance` | ✅ Deployed |
| Core Drives API | `GET /api/admin/gamification/core-drives` | ✅ Deployed |
| Certificate API | `POST /api/gamification/certificate` | ✅ Deployed |
| Certificate Page | `/gamification/certificate/[certId]` | ✅ Deployed |
| Verification Page | `/verify/[certId]` | ✅ Deployed |
| GamificationWidget | FLA dashboard + assessment detail | ✅ Deployed |
| CompetencyDashboard | `/gamification` with XP breakdown + recommendations | ✅ Deployed |
| OfflineBanner | PWA + offline mutation queue + auto-sync | ✅ Deployed |
| GamificationStage | 4-stage maturity model (seeded for all 3 companies) | ✅ Deployed |
| WebhookLog | External webhook call logging | ✅ Deployed |
| Certificate | Competency certificate records | ✅ Deployed |
| EmotionalDriveMetric | Octalysis 8-drive scores | ✅ Deployed |
| GameAttributeRule | Generalized (source, eventType, role, conditions, dynamicModifiers) | ✅ Deployed |
| PointTransaction | Rule-driven point awards with emotionalDrive tagging | ✅ Deployed |
| AchievementBadge | 3-type badge catalog (Track/Role/Special) | ✅ Deployed |
| UserAchievement | Badge earning records | ✅ Deployed |
| Company.certSignatoryName | Certificate signatory name | ✅ Deployed |
| Company.certSignatoryPosition | Certificate signatory position | ✅ Deployed |

**Remaining work (2 items):**
- P7: Notification Quality Scoring — Assessment Template
- P6: Manager-Led Quality Audit — Assessment Template

### 7.7 Control Health Mechanics

Control health scores (0–100%) are recalculated when an assessment is Completed:
- Score resets to 0% at quarter start (triggers first assessment)
- First assessment brings it to 100%
- Outstanding actions deduct per severity: Low 0%, Medium -5%, High -10%, Serious -15%, Repeat -15%
- Cumulative floor at 0%
- Only controls assigned to the completed assessment are affected

---

## 8. Multi-Company Architecture

### 8.1 Company Isolation Model

Three companies in production:
- **SAMS001** (`comp_1783989395315`) — Template/seed company
- **SMDS** (`comp_smds`) — Client company
- **OGP** (`comp_ogp`) — Client company

### 8.2 How It Works

1. **URL Search Param (primary):** CompanySelector navigates to `/fla?companyId=X` via `router.push()`. Server reads `searchParams.companyId` — this is the most reliable mechanism since the param is part of the HTTP request URL, not dependent on cookie attributes.
2. **Cookie (fallback):** `selectedCompanyId` cookie stored with `Secure; SameSite=Lax` for persistence across sessions. Read by `getSelectedCompanyId()` as fallback when no URL param is present.
3. **Server-Side Filtering:** All data queries add `where: { companyId }` when a company is selected. Models without direct `companyId` use nested relation traversal (e.g., `Action → Finding → Assessment → companyId`).
4. **Company Selector:** `CompanySelector` client component in NavBar — wrapped in `<Suspense>` (required for `useSearchParams()`). Reads URL param first, then cookie, to determine current selection.
5. **Template Adoption:** SAMS001 acts as seed. "Adopt Templates" copies Standards, ProcessAreas, SubProcesses, Requirements, Controls, and mappings into the target company
6. **Composite Uniques:** `@@unique([field, companyId])` on all company-scoped tables prevents cross-company collisions

### 8.3 Company-Scoped vs. Global Tables

| Scoped (per company) | Global (shared reference) |
|----------------------|--------------------------|
| ProcessArea, SubProcess | Standard |
| Requirement, Control | ActivityLogType |
| Assessment, Sample, Finding, Action, Aact | SampleType, RecordSourceType |
| AssessmentTemplate, UserRole | AssuranceActivityType |
| Knowledgebase, AchievementBadge | AssessmentActType |
| Department, Position | BacklogItem |
| UserCompany | AssuranceProtocol |

**Rule:** `COMPANY_SCOPED_TABLES` in the generic table API only contains production data tables — not reference/lookup tables.

### 8.4 Shared Documents (SAMS001-as-Shared Convention)

`Document` rows owned by the SAMS001 company apply to **all** companies. Everywhere documents are read (Documents tab, AI chat context), the query is `companyId = <master> OR companyId = <selected>`.

⚠️ **cuid vs code:** `companyId` columns store `Company.id` (cuid, e.g. `comp_1783989395315`), not the `companyID` business code (`SAMS001`). Code must resolve the master company's id first: `prisma.company.findUnique({ where: { companyID: "SAMS001" } })`. The `selectedCompanyId` cookie also holds the cuid.

**Rules:**
- Upload as shared: only while SAMS001 is the selected company (checkbox in Documents tab)
- Archive shared doc: Admin only, and only while SAMS001 is selected (`DELETE /api/documents/[id]` → 403 otherwise)
- Delete is soft (`archivedAt` timestamp); archived docs are excluded from the tab and the AI chat context
- Versioning fields (`documentNo`, `version`, `isLatest`, `replacedById`) exist but are dormant — reserved for a future versioning feature

---

## 9. AI Integration

### 9.1 Knowledgebase Chat (`/api/chat/knowledge`)

**Model:** DeepSeek V4 Pro (`deepseek-v4-pro`)
**Context Strategy:** Smart loading — lightweight default context + deep data on-demand via keyword triggers

**Default context (always loaded):**
- Company & Process Area identity
- KB entries for the current process area
- SAMS001 global knowledge entries

**Deep context (loaded on keyword triggers):**
- "controls" / "what controls" → fetches Control list with CSF fields
- "requirements" / "clauses" → fetches Requirement clauseContent
- "assessments" / "health" → fetches Assessment + ControlAssignment health data
- "findings" / "actions" → fetches Finding + Action summaries

**Response format:** Markdown with tables. `formatMarkdown.ts` converts to HTML (bold, italic, lists, code, headers, tables). Uses `___CONTROL___` blocks for suggested controls that can be approved into the library.

### 9.2 Document Extraction (`/api/admin/extraction`)

**File Pipeline:**
1. Upload via multipart form → stored in `Document` table (Prisma-managed)
2. Text extraction: `pdf-parse` (PDF), `mammoth` (DOCX→markdown), direct read (MD/TXT/CSV)
3. AI extracts structured controls → `ControlFromDocument` records (raw SQL table, `documentId` FK)
4. Human reviews candidates → Approve (creates Control + MapControl2Requirement) or Reject

**Data Model:**
- `Document` — Prisma-managed. Fields: id, documentNo (@unique), version, isLatest, replacedById, archivedAt, companyId, source, folder, filename, processAreaId, summary, documentContent, srcFileDeleted, createdAt, updatedAt. Supports version control via isLatest/replacedById.
- `ControlFromDocument` — Raw SQL table. FK: documentId → Document(id). Status: Pending/Approved/Rejected.
- `DocumentControl` — Raw SQL junction table. Links approved Documents to Controls. FK: documentId → Document(id), controlId → Control(id).

### 9.3 Batch CSF Extraction Pipeline (`scripts/db/csf_batch_runner.py`)

Out-of-app bulk control extraction for the SMDS company (522 procedure documents, batches of 5). Distinct from the in-app extraction above — it writes directly to the `Control` table (not `ControlFromDocument` candidates).

**Configuration (v1.11.7, 2026-08-07):**
- **Model:** `deepseek-v4-pro` (was `deepseek-chat` / V4 Flash)
- **Context:** full document content (was truncated to 2,500 chars)
- **Token limit:** none — `max_tokens` removed (8K cap truncated JSON and dropped controls)

**Quality impact (measured):** Pro + full context extracts **2–3× more controls** per batch, with deeper CSF fields (`csfHow` +8–16w, `csfEvidence` +2.6–5.3w) and finer granularity (one control per analyser/asset vs grouped procedures). PCN narrative docs consistently yield 0 controls (expected — not procedures).

**⚠ Non-determinism:** the same batch re-run produces 0% exact-name overlap (semantically-same controls, different phrasing). Name-based dedup (`ON CONFLICT (name, companyId)`) does NOT catch re-runs — each batch must run exactly once per library build. Semantic dedup required if re-running.

**Status (v1.11.8, 2026-08-08):** All **105 batches complete** — 5,055 controls from 514 docs. Runner hardened: robust JSON parsing, defensive field access, per-batch duration logging, failure logging (`failed_batches.log` + re-run commands), network auto-retry with backoff, continue-on-error.

**Rebuild (no-dedup):** DB rebuilt from `batch_XXX_parsed.json` records (DELETE 4,912 → INSERT 5,055, 0 failures). Identical names from different docs preserved with running-number suffix + `knowledge` note (Design Principle #43). Pipeline scripts: `backup_smds_controls.py` → `merge_batch_jsons.py` → `analyze_merged.py`/`classify_issues.py` → `fix_merged.py` → `generate_sql.py` → `validate_sql_v2.py` (static + DB dry-run) → `execute_rebuild.py` (batched, failure capture). Fix report: `dbBackup/FIX_REPORT.md`.

### 9.4 Parallel KB → Control Reconciliation Pipeline (v1.13.0)

Fan-out batch reconciliation of every SMDS Knowledgebase document into consolidated controls, coordinated with Postgres-only primitives (no external queue). Replaced the single-threaded `csf_batch_runner` workflow for full-library runs.

**Components:**
- `launch_shards.py` — supervisor: single-instance **lease row** in `ReconcileClaim` (`kbId='__launcher__'`, 5s heartbeat, stale-reclaim >120s), loser goes **standby** (never exits) and auto-takes-over on staleness; spawns 20 shard workers + aggregator; Windows Job Object + parent watchdog for orphan-free shutdown.
- `kb_control_reconcile.py` — per-shard worker: deterministic sharding (`md5(kb_name) % N`), **per-doc claim gate** (`INSERT ON CONFLICT DO NOTHING`, release after commit, stale-reclaim >20 min), skip-don't-crash on AI/network failure, **DB reconnect-retry wrapper** on InterfaceError, per-doc commit, **work-stealing sweep** after own queue (all workers pull unclaimed docs at the tail).
- `kb_reconcile_aggregate.py` — merges per-shard status into one dashboard JSON with a **unique-union tally** (never >100%); `--out` flag for side-by-side corrected status.
- `parent_watchdog.py` — child self-terminates when its supervisor dies.
- Dashboards: `scripts/db/kb_reconcile_output/kb_reconcile_progress.html` (extraction) + `kb_map_progress.html` (mapping); auto-refresh 2s.

**Result (2026-08-13):** 557/557 docs → SMDS Control library 23,586 controls (18,531 KB-derived NEW), 0 duplicate name rows, 0 rate-limit hits, resumable across kills and network outages. Full method + failure catalog: `docs/parallel-worker-coordination.md`.

**Supporting scripts:** `scripts/db/check_smds_state.py` (count verify), `scripts/db/purge_smds_controls.py` (full SMDS purge), `scripts/db/csf_extract_pro.py` + `scripts/db/pro_full_compare.py` (model comparison), `CSF_BATCH_BACKLOG.md` (batch status).

### 9.5 Requirement Coverage Audit (v1.13.2)

Multiworker AI verification that every applicable SMDS requirement is met by its mapped controls — runs on the same Postgres-claims coordination as 9.4 (distinct `--lease-id __launcher_cov__`). One row per requirement in `RequirementCoverageAudit` with a verdict — **FullyMet** (controls cover every substantive obligation), **PartiallyMet** (material gaps remain), **NotMet** (no substantive coverage) — plus `howMetEvidence`; every gap also gets a **proposed control statement in CSF format** that closes it. Results are mirrored for in-app review: one `Assessment` ("Coverage Audit — <PA>") per PA, one `Finding` per gapped requirement (severity High=NotMet / Medium=PartiallyMet), one `Action` per finding whose description is the proposed statement. Proposals never touch the live Control library — human review first.

- Scripts: `cov_bootstrap.py` (tables + 69 PA assessments), `kb_cov_audit.py` (worker), `cov_aggregate.py`, `cov_monitor.py` (watchdog + audible alarms), `cov_svc.py` (surgical start/stop per role), `cov_recover.py` (one-command recovery); dashboards on port 8790.
- Result (2026-08-14): 873/873 SMDS requirements audited — 293 FullyMet, 346 PartiallyMet, 234 NotMet, 580 gap proposals (~24 min, 30 workers). Priority: ISO block first, then foundations → process safety → WHSS → transport → carbon/environment.
- Scope caveat: audits the AI-mapped documented control library, not on-the-ground implementation. Runbook: `docs/requirement-coverage-audit.md`.

### 9.6 Statement of Compliance Pipeline (v1.13.8)

Multiworker AI run that fills the **Statement of Compliance** (`Requirement.socStatus`/`socSummary`) for every applicable SMDS requirement (808 eligible, excluding the "Unmapped Controls" pseudo-requirement). **Verdict is bootstrapped** from `RequirementCoverageAudit` (FullyMet→FullyComply, PartiallyMet→PartiallyComply, NotMet→NotComply) — the AI (`deepseek-v4-pro`) writes ONLY the ≤1000-char human summary, grounded in clause + intent + audit evidence + ALL mapped controls (compact CSF fields: name, type, mandatory flag, statement, What, How). Requirements missing an audit row get a **mini coverage-analysis** in the same call (verdict + summary + evidence + gap + proposed statement) and backfill the audit table. Work unit = **one requirement per AI call** (batch=1, user spec), **30 workers**, single-pass md5 shards + work-stealing. Claim gate `soc:<rID>` (namespace separate from `req:` of the coverage pipeline), completion marker = the `SocStatementAudit` row itself.

- Scripts: `soc_backup.py` (targeted pre-run backup), `soc_bootstrap.py` (table), `soc_worker.py` (worker), `soc_aggregate.py` (DB-truth dashboard data), `soc_monitor.py` (watchdog + audible alarms), `soc_svc.py` (surgical role start/stop), `soc_recover.py` (one-command recovery), `_soc_truth.py` (DB truth), `soc_report.py` (`SOC_REPORT.md`). Dashboards: `http://localhost:8790/soc_progress.html` + `soc_monitor.html`. Launcher lease `__launcher_soc__`.
- Runbook: `docs/workflow/soc-pipeline-runbook.md`.

---

## 10. Security & Authorization

### 10.1 Four-Tier Role Model

| Role | Powers |
|------|--------|
| **Admin** | System configuration: user management, backlog, database, template adoption, backfills. All APIs. |
| **Superuser** | Assessment data management: create/edit/delete assessments, samples, activities, control assignments. Cannot manage users. |
| **Assessor** | Read assessment data + create findings/actions + complete assessments they're linked to. No delete. |
| **Interviewee** | Least privilege: sees only assigned interviews. No mutation access. |

### 10.2 Authorization Helpers (`src/lib/authz.ts`)

```typescript
requireAdmin()       // 403 if not Admin
requireSuperuser()   // 403 if not Admin or Superuser
requireAssessor()    // 403 if not Admin, Superuser, or Assessor
requireAuth()        // 401 if not authenticated
getSelectedCompanyId()    // Read company cookie
requireSelectedCompany()  // 400 if no company selected
hasCompanyAccess(userId, companyId)  // Boolean check
getCompanyWhere(companyId)  // Prisma where clause
```

### 10.3 Session Security

- JWT-based sessions via NextAuth v5
- `maxAge`: 8 hours (not 30-day default)
- Runtime role validation in JWT callback — only `"Admin"` or `"Assessor"` accepted, defaults to `"Assessor"` if corrupted
- Passwords hashed with bcryptjs
- `.env` in `.gitignore` — API keys never committed

### 10.4 API Protection

- **Middleware:** `/admin/*` UI pages blocked for non-Admin
- **Route-level:** Every API route has explicit auth check via helpers
- **Write gating:** Generic table API POST/PUT/DELETE whitelists tables per role
- **Company scoping:** All data reads filtered by `companyId`. **Audit (2026-07-31):** Found 27 gaps — 3 unauthenticated endpoints (badges, templates), 9 missing company scope on GET/POST routes (controls, processAreas, standards, documents, findings, samples, actions, controlAssignments), 11 medium-severity gaps. Documented in `lessons-learned-2026-07-31.md`. Fixes in progress.

---

## 11. Wireframes & Screen Inventory

### 11.1 Key Screens

| # | Screen | Route | Key Elements |
|---|--------|-------|-------------|
| 1 | **Login** | `/login` | Username + password form, SAMS branding |
| 2 | **Process Areas** | `/setup/process-areas` | Standards as collapsible sections, PA cards with req/control counts |
| 3 | **Process Detail** | `/setup/processdetails/[id]` | 3-tab layout: Knowledgebase, Requirements (with mapped controls), Controls |
| 4 | **Control Library** | `/setup/controls` | Filterable grid of all controls |
| 5 | **Assessment Dashboard** | `/fla` | List of assessments (cards) + "New Assessment" button |
| 6 | **Assessment Detail** | `/fla/[id]` | 4-tab layout: Control Assignment (2-panel: select + assigned hierarchy), Samples, Findings+Actions, Activities |
| 7 | **My Interviews** | `/fla/my-interviews` | Interviewee's assigned interviews with activity detail |
| 8 | **Admin Dashboard** | `/admin` | View switcher: Users, Backlog, Database, Extraction, Protocols, KB, Requirements, Badges |
| 9 | **User Management** | `/admin?view=users` | User cards + Add/Edit/Delete modal |
| 10 | **Kanban Backlog** | `/admin?view=backlog` | Drag-and-drop columns: Backlog, Sprint Backlog, In Progress, Done |
| 11 | **Database Management** | `/admin?view=database` | Backup download, restore upload, SQL executor |
| 12 | **Document Extraction** | `/admin?view=extraction` | File upload → AI extraction → candidate review → approve/reject |
| 13 | **Assurance Protocols** | `/admin?view=protocols` | Filterable table, expandable rows with protocol details |
| 14 | **Help** | `/help` | 8-section sidebar with annotated screenshots |

### 11.2 Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| **Desktop** (>768px) | Full sidebar nav, multi-column grids, side-by-side panels |
| **Mobile** (<768px) | Hamburger menu, single-column stack, full-width cards |

### 11.3 Key Flows

**Assessment Flow:**
```
Create Assessment → Assign Controls → Collect Samples → Record Findings
  → Create Actions → Complete Activities → Mark Completed → Health Recalculated
```

**Template Adoption Flow:**
```
Admin selects company → "Adopt Templates" → Copies Standards, PAs, SPs, Reqs, Controls
  → Company has full independent data set → "Clean Templates" to reset if needed
```

**Document Extraction Flow:**
```
Upload Document → AI Extracts Text → AI Proposes Controls → Human Reviews
  → Approve (creates Control) or Reject → Approved controls enter library
```

---

## 12. Deployment & DevOps

### 12.1 Deployment Pipeline

```
Local Dev (localhost:3100)
  → git commit + push to GitHub (main branch)
  → Railway auto-deploys from main
  → preDeployCommand removed (one-time ops done manually)
  → `npx prisma generate` + `npx next build` on Railway
  → App available at sams-app-sams.up.railway.app
```

### 12.2 Manual Operations

| Operation | Command | When |
|-----------|---------|------|
| Schema sync | `npx tsx prisma/sync-schema.ts` | After Prisma schema changes |
| Seed admin user | `npx tsx prisma/seed.ts` | First deploy only |
| DB backup (Python) | `python full_db_backup.py` | Regular backups (project root) |
| DB backup (in-app) | `/admin?view=database` → Download | Ad-hoc via UI |
| DB restore | `/admin?view=database` → Upload .sql | Disaster recovery |
| Type check | `npx next build` | Before push (Turbopack skips errors) |

### 12.3 Critical Rules

1. **NEVER use `prisma db push --force-reset`** — wipes ALL data with no confirmation
2. **Always `npx next build` before push** — Turbopack dev mode silently swallows TypeScript errors
3. **No INSERT/UPDATE/DELETE in `sync-schema.ts`** — deploy scripts are DDL only
4. **No `python -c` in PowerShell** — always use `.py` files
5. **Remote DB writes via app API only** — never external psycopg2/PL/pgSQL over public internet

---

## 13. Known Gaps & Roadmap

### 13.1 Sprint Backlog (Prioritized)

| ID | Gap | Priority |
|----|-----|----------|
| G6 | Admin tabs for ProcessAreas & Controls (CRUD) | High |
| G7 | Attachment integration for Aact (checklists) | High |
| G8 | Company management admin tab (CRUD) | Medium |
| G9 | Template activity type linkages UI | Medium |
| G10 | Quarterly control health reset (automation) | Medium |

### 13.2 Backlog

| ID | Gap | Priority |
|----|-----|----------|
| G11 | AActControls/AActUsers population from assessment workflow | Medium |
| G12 | User.email backfill for existing users | Low |
| — | DocumentExtract/ControlFromDocument restore (SQL escape issues) | Low |
| — | Gamification: GameAttributeRule engine wiring | Medium |
| — | Gamification: Team leaderboard UI | Medium |
| — | Gamification: Badge catalogue expansion | Low |
| — | Scheduled cron jobs (quarterly reset, health calc) | Low |

### 13.3 Design Debt

- **Generic table API** uses `information_schema` introspection — could be replaced with typed routes
- **Admin page.tsx** contains 4+ function components in one file — should be split
- **Some API routes** use raw SQL (`$queryRawUnsafe`) to bypass PrismaPg adapter caching — should migrate when adapter is fixed
- **Attachment cleanup** is manual (polymorphic table has no FK cascades)

---

## Appendix A: Version History

| Version | Date | Changes |
|---|---|---|
| v1.13.18 | 2026-09-04 | **Conversation Fabric — threaded comments + evidence-request pipeline (SAMS-004, Phase 2a).** (1) **Additive schema:** one polymorphic `Comment` model (`entityType`+`entityId`, mirroring the AttachmentMapping destTable/recId convention; entities v1 `Finding`/`EvidenceRequest`; flat threads via `parentCommentId`, append-only v1; `authorPlane` Provider/Client derived server-side, per-comment `visibility` Internal/SharedWithClient) + `EvidenceRequest` DRL unit (state machine `Draft→Requested→Submitted→Accepted\|Rejected(→resubmit)\|NotApplicable`, files via the EXISTING polymorphic Attachment system `destTable='EvidenceRequest'`; optional FK to Assessment, requestedBy/requestedFrom FK to User). New enums `CommentAuthorPlane`, `CommentVisibility`, `EvidenceRequestStatus`. Additive idempotent migration `scripts/db/migrations/20260904_add_conversation_fabric.ts` (**no `prisma db push`**); also registers `ActivityLogType` rows `EVIDENCE_REQUEST_CREATED`/`EVIDENCE_REQUEST_STATUS`. (2) **APIs:** `GET/POST /api/comments` (visibility-filtered thread list — client sessions never see provider-`Internal`; POST derives `authorPlane` from session, rejects client `visibility=Internal` → 400, cross-company target → 403); `POST /api/evidence-requests` (Draft, `EVIDENCE_REQUEST_CREATED` audit), `GET /api/evidence-requests` (role-scoped, `?mine=1` for the requestee), `PATCH /api/evidence-requests/[id]` (state machine — 409 on invalid transitions, 422 on submit w/o note OR attachment, `EVIDENCE_REQUEST_STATUS` row with before/after). Requestee can only `submit` on their own request; assessor/provider drive `send`/`accept`/`reject`/`na`. (3) **UI:** reusable `CommentThread` (🛡 provider badge, 🔒/🌐 visibility badges, composer visibility toggle for provider authors only) on Finding cards + EvidenceRequest detail; 📨 Evidence tab on `/fla/[id]` (assessor: list/create/accept/reject, `UserSearchSelect` requestee picker); `/fla/my-evidence-requests` (requestee: cards, submit note+file, resubmit sees reviewNote, overdue red). New authz `requireAssessorOrProvider`; `useSession` + next-auth types expose `providerRole`. |
| v1.13.17 | 2026-09-04 | **Data Trust Gate — tenant isolation suite + retention + client export (Phase 1 signability, SAMS-003).** (1) **Additive schema:** `Company.archivedAt` + `Company.deletionScheduledAt` (nullable TIMESTAMPTZ, `scripts/db/migrations/20260904_add_company_archive_columns.ts`, idempotent, **no `prisma db push`**; also registers `ActivityLogType` rows `COMPANY_ARCHIVED`/`COMPANY_SCHEDULE_DELETE`/`COMPANY_REINSTATE`/`COMPANY_EXPORT`). (2) **Retention flows:** `POST /api/admin/companies/[id]/retention` (`archive` → `schedule-delete` (30-day safety net) → `reinstate`; Admin or Provider; audit-logged; SAMS001 protected). Archived companies are hidden from the NavBar selector (`archivedAt == null` filter) and their users' logins are blocked in `authorize` (via `User.companyId` or a `UserCompany` mapping). (3) **Hard delete (manual only):** `scripts/db/company_hard_delete.ts <companyId> --confirm --export <zip>` — refuses without `--confirm`, an unexpired safety net, a missing export, or a non-matching manifest; deletes in FK-safe order (junctions → children → roots) and writes one terminal `HARD_DELETE_TERMINAL` counts-only ActivityLog record. (4) **Client export:** `GET /api/admin/companies/[id]/export` (Admin or Provider; provider call writes a `COMPANY_EXPORT` audit row) → streamed per-company ZIP (one CSV per company-scoped table + `manifest.json` with per-table counts, schema version, exclusion list). A dependency-free ZIP writer (`src/lib/zip.ts`, DEFLATE, manifest stored uncompressed) + export catalogue (`src/lib/data-trust-export.ts`) scope every query by companyId (direct column or nested-relation traversal; Risk/RiskCategory scope via process-area subquery). Hard-coded exclusion list (`EXCLUSION_COLUMNS`): password hashes, token/session/secret columns, `beforeData`/`afterData`. Never reuses the whole-DB backup route. (5) **Isolation suite (T1):** `scripts/isolation/` + `npm run test:isolation` — route + model **matrix drift** (coverage by construction), two-company cross-tenant read/write probes, provider-plane per-company iteration + `PROVIDER_CONTEXT_SWITCH` reference, and a client-export isolation scan (zero credential material, zero other-tenant rows, manifest counts = live queries). Company admin UI gains Active / Archived / Pending-deletion state badges + Archive / Schedule deletion / Reinstate / Export controls. New docs: `docs/ISOLATION_MODEL.md`. |
| v1.13.16 | 2026-09-04 | **Provider company selector lists ALL companies + role-aware redirect (SAMS-002b, post-review follow-up).** (1) `NavBar.tsx` now queries *every* company (ordered by `companyID`) for the selector when `session.user.providerRole` is set, so provider staff — who may hold few or no `UserCompany` mappings — can still switch clients via the primary in-app selector; when `providerRole` is null the selector keeps the `UserCompany`-mapping list byte-for-byte. Server-side access enforcement is unchanged (provider plane stays read-only; mutations remain role-gated). (2) `CompanySelector.tsx` switch for provider sessions now navigates to the `redirectTo` returned by `POST /api/operator/context-switch` (`/admin` for role=Admin, `/fla` otherwise, fallback `/fla`) instead of hardcoding `/fla`; the non-provider path still writes the `selectedCompanyId` cookie synchronously and stays on `/fla`. Provider switches stay audit-logged — exactly one `PROVIDER_CONTEXT_SWITCH` row per actual change, zero when the company is unchanged (002a regression preserved). |
| v1.13.15 | 2026-09-03 | **Operator Console + provider role plane (SAMS-002, Phase 0 of managed GRA SaaS).** New nullable `ProviderRole` enum (`ProviderAdmin|ProviderConsultant`) + `User.providerRole` column (orthogonal to the `role` enum, no backfill) via additive idempotent migration `scripts/db/migrations/20260903_add_user_provider_role.ts` (also registers `ActivityLogType.PROVIDER_CONTEXT_SWITCH`). New top-level provider-gated route `/operator` (cross-client portfolio: SOC coverage counts + colour bar, open findings, open actions w/ overdue flag, in-progress assessments, user count, KB count, last activity; worst coverage first; loaded via `GET /api/operator/portfolio`). Provider staff get an "Operator" NavBar link when `session.user.providerRole` is set; every provider company-context switch (console row click or NavBar company selector) writes a `PROVIDER_CONTEXT_SWITCH` ActivityLog row (before/after = old/new company) via `POST /api/operator/context-switch` which sets the `selectedCompanyId` cookie and lands in `/admin` or `/fla`. READ-ONLY v1: all queries keep the `companyId` filter (nested relation traversal for Finding/Action→Assessment). Non-provider `GET /operator`/`GET /api/operator/portfolio` → 403; zero-data company renders "Not assessed" empty state. |
| v1.13.14 | 2026-09-02 | **KB transcript hardening (scoped, no schema change).** G1 — `POST /api/admin/knowledgebase/transcript` now flags long uploads: content over `MAX_TEXT_LENGTH` (500k) is truncated and the response sets `truncated: true`; `TranscriptView` surfaces an amber warning toast instead of silently dropping content. G2 — shared `lib/extractText.ts` no longer writes temp files into `process.cwd()/uploads` (fails on Railway read-only ephemeral FS): pdf-parse already reads the buffer so its disk write is dropped, and mammoth (.docx) spills to `os.tmpdir()` for the duration of extraction then unlinks. G4 — transcript attribution replaced the `(session as any)?.user?.name || "Admin"` fallback with typed session access; a missing Admin display name now 403s instead of being attributed to "Admin". Benefits both the admin transcript and `chat/knowledge/upload`. No Prisma schema/migration change; `db:parity` drift is unchanged (cascade/additive deferrals). |
| v1.13.13 | 2026-08-29 | **KB meeting-transcript upload + company-scoped tagging (shipped).** Admin-only transcript upload (`POST /api/admin/knowledgebase/transcript`) reuses shared `lib/extractText.ts` (.pdf/.docx/.vtt/.srt/.csv/.md/.txt/.json) — dedupes the inline pdf-parse/mammoth in `chat/knowledge/upload`. New models `Tag` (`@@unique([name, companyId])`) + `KnowledgebaseTag` (M:N junction); `Knowledgebase.entryType` enum `{Knowledge|Transcript}` discriminator + `meetingDate`/`participants`; duplicate title → 409 (Prisma P2002) not raw 500. Settled decisions #5 (extracted text only, no original file), #9 admin-only, #10 delete-only, #11 Process Area optional, #12 text-only sources. |
| v1.13.12 | 2026-08-25 | **Dependency security patch (audit-driven).** `next-auth` bumped `^5.0.0-beta.31` → `^5.0.0-beta.32` (fixes Auth.js fail-open auth checks + homoglyph bypass + @auth/core advisories; bundles `@auth/core@0.41.3`). Lockfile regenerated: next 16.3.2, postcss 8.5.26, nanoid 3.3.18, sharp 0.35.3, prisma 7.9.1, fast-uri 3.1.6. `npm audit` 18 (2 crit) → 3 high (Prisma CLI dev-tooling chain, no upstream fix). Added `scripts/requirements.txt` (`psycopg2-binary==2.9.12`) for `verify_parity.py`. No schema/route/component changes. |
| v1.13.11 | 2026-08-19 | **SysAdmin → Export Data + Knowledgebase LMS metadata + TestClaim/TestWorker registration.** (1) `Knowledgebase` gains LMS metadata columns (`documentNumber`, `nextReviewDate`, `custodianOwner`, `authorizer`, `department`, backfilled from `lms.csv` via `kb_lms_backfill.py`). (2) `TestClaim` + `TestWorker` registered as Prisma models (drift-safety) for the test-plan orchestrator. (3) New `ExportDataView` submenu under SysAdmin (📤 Export Data) + new endpoint `GET /api/admin/export/controls?companyId=<id>` (Admin). Exports the selected company's controls as CSV: one row per Control × Requirement mapping (many-to-many → duplicated control rows; verified 43,059 rows / 24,883 distinct for SMDS), unmapped controls included once with blank requirement columns. Columns (grilled 2026-08-19): all business Control columns (introspected at runtime via information_schema, internal id/companyId/timestamps excluded), requirement_id + requirement_clause (full text) + intent (`intentOutcome`) + applicability (`clauseApplicability`), control_process_area/control_standard and requirement_process_area/requirement_standard (both pairs), and mapping_mandatory. The pre-existing `/api/admin/database/export-controls` (SAMS001-hardcoded, deduped) is unchanged. |
| v1.12.3 | 2026-08-10 | **Report format v2 + discipline filter badges + IMS merged report.** Design-effectiveness reports refactored from separate-sections format (Summary TOC → What-went-well → Gaps) to a single expandable-row table with clickable filter badges (comply status + standard + discipline). Discipline badges (Everyone/AI/PS/OSH for PMS; QMS/EMS/OHSMS for ISO) are now interactive filters — clicking narrows the table to one discipline's clauses. Badges work in legend bars, cat-summary bars, and table cells via `toggleFilter` JS with `el.closest('table.summary')` fallback. IMS merged report (`IMS_DESIGN_EFFECTIVENESS.html`) consolidates all 4 standards into 7 IMS category tables with per-category filter badges and a consolidated Find & Act section. Design Philosophy principles #46–48 updated; IMS Audit Philosophy §9.2–9.4 updated. |
| v1.12.1 | 2026-08-09 | **PMS cross-PA control mapping.** Added `mandatory Boolean @default(false)` to `MapControl2Requirement` (added via idempotent raw `ALTER TABLE ADD COLUMN IF NOT EXISTS` to avoid Prisma drift-drop). Marks controls that are essential (non-substitutable) to a specific requirement. Used to map the 5,055-control SMDS library to the 42 statutory ICOP PMS clauses (controls from other PAs anchored to the PMS requirement; MCR `processAreaId` = the control's own PA). Produces `SMDS PMS Gaps.md` + Design Effectiveness report. |
| v1.13.0 | 2026-08-13 | **KB→Control Parallel Reconciliation + Mapping v2 Design.** (1) **Parallel extraction pipeline** (`scripts/db/launch_shards.py`, `kb_control_reconcile.py`, `kb_reconcile_aggregate.py`, `parent_watchdog.py`): 20 shards × 2 process copies coordinated via new **`ReconcileClaim`** raw-SQL table (per-doc claim gate + `__launcher__` lease row with 5s heartbeat + stale reclaim; standby never exits; work-stealing sweep at tail; skip-don't-crash on network failures; per-doc commit). Result: SMDS control library grown to 23,586 controls (18,531 KB-derived NEW), 0 duplicate name rows, 0 × 429. (2) **`MapControl2Requirement.aiGenerated`** nullable boolean added via idempotent raw ALTER — flags AI-created mapping rows. (3) **Mapping v2 design grilled & confirmed:** backup + delete all 5,596 SMDS mappings, re-match all controls against all 881 SMDS requirements two-stage (token-overlap top-40 → AI confirm with justification, strong/weak tiering), mandatory boolean = mandatory/supporting, many-to-many, AI chunk 40 + commit per control, single supervisor with 30 workers, launch only after extraction completes. New docs: `docs/parallel-worker-coordination.md` (runbook) + `docs/adr/adr-coordinating-many-workers-db-claims.md`; 19-entry lessons log `/memories/lessons-learned-2026-08-13.md`. |
| v1.13.1 | 2026-08-13 | **Reconciliation completion marker + Mapping v2 runner built.** (1) **`Knowledgebase.reconciledAt`** (idempotent raw ALTER) is now the authoritative "doc reconciled" marker — stamped in the same transaction after a doc completes with inserts AND/OR update-merges. `Control.practiceDocumentId` reverts to CREATOR-only semantics (stamped on INSERT, never on UPDATE) — update-stamping caused a 44-doc ownership ping-pong between docs that merge into the same controls. Backfill stamped 556/557 docs from evidence (control ownership or successful worklog); only 1 doc (SGN U1100 PRE-FURN) needed a real re-run. (2) **Mapping v2 runner built**: `scripts/db/kb_map_v2.py` (work unit = control; chunk 40/AI call with adaptive split; stage-1 token-overlap top-40 candidates from 873 eligible reqs; stage-2 AI strong/weak + justification; strong-only inserts capped at 5; weak → `kb_map_review.jsonl`; per-control claim/insert/commit/release; deterministic `map_smds_<md5>` ids; skip-don't-crash; DB reconnect-retry; work-stealing), `kb_map_aggregate.py` (unique-union + dbMapped), `kb_map_progress.html` rebuilt, `map_backup_clear.py` (export 5,596 rows to dbBackup/ then delete). `launch_shards.py` parameterized: `--worker-script/--aggregate-script/--log-prefix/--status-out/--dashboard-file/--extra-worker-args/--lease-id`. |
| v1.13.2 | 2026-08-14 | **Requirement Coverage Audit + FLA Standard→PA grouping.** (1) New pipeline table `RequirementCoverageAudit` (registered Prisma model, §9.5): 873/873 SMDS requirements audited by 30 workers — 293 FullyMet / 346 PartiallyMet / 234 NotMet with evidence + 580 CSF gap-closure proposals, mirrored as Assessments/Findings/Actions for in-app review. (2) `Assessment.processAreaId` direct PA link — assessments group by Standard → Process Area on `/fla/all`; `/api/admin/assessments` returns the direct processArea with legacy control-assignment fallback. (3) Findings UI: clause/requirement box, gap details, and proposed control statement displayed on assessment + FLA pages; truncation removed (220-char cap lifted, data backfilled). (4) Schema drift-safety: pipeline tables + columns registered in Prisma so `db push` never drops them. New docs: `docs/requirement-coverage-audit.md`; lessons `/memories/lessons-learned-2026-08-14.md`. |
| v1.13.3 | 2026-08-15 | **Requirements & Controls table: Mandatory column + remove Move-to.** `ProcessDetails` requirement cards now render Control / Type / Health / Mandatory — the inline "Move to" dropdown is removed (duplicated the 🗂 Map Controls feature; drag-drop remap retained). Mandatory values come from `MapControl2Requirement.mandatory` (page query now carries `mandatory` + `mcrId` per control); SPO/Admin click ★/☆ to toggle, persisted via `PUT /api/admin/table/MapControl2Requirement/[id]` (route extended to accept `mandatory` alongside `requirementRId`; Prisma `update` replaces raw SQL). |
| v1.13.4 | 2026-08-15 | **Clickable control names → CSF detail modal.** `RequirementCard` control names are now links opening new `ControlDetailModal` — statement, control attributes, CSF core (Who/What/When/Where/Why/How/Evidence), enrichment & assurance, and traceability sections. Data comes from the already-serialized control object in the page query (full `Control` record incl. `csf*`, `keyActivities`, `controlRef`, etc.) — no extra API call. Escape / ✕ / backdrop close (reusable `Modal`). |
| v1.13.5 | 2026-08-15 | **Browser title on process details page.** Added `generateMetadata` to `/setup/processdetails/[id]` — document title is now the ProcessArea name (e.g. "[SMDS] Ensure Safe Production") instead of the static root-layout "SAMS" title. |
| v1.13.6 | 2026-08-15 | **Process details: Assessments tab + ORCA metrics fixed for direct-linked controls.** SMDS controls link via `Control.processAreaId` directly (0 sub-processes), but the page only followed sub-process controls → ControlAssignment → Assessment. Result: empty Assessments tab and zeroed Total Controls/Health/Last Assessment on every direct-linked PA. Now: (1) assessments queried via `Assessment.processAreaId` first, legacy control-assignment chain kept as fallback for `processAreaId: null` assessments, merged + deduped + sorted by startDate desc; (2) `allControlsFlat` = direct PA controls ∪ sub-process controls (e.g. 2,818 for Ensure Safe Production); (3) assessment-actions raw SQL broadened to `c."processAreaId" = $1 OR csp."subProcessId" IN (sub-processes of PA)`. Fixes all SMDS PA detail pages. |
| v1.13.7 | 2026-08-15 | **Statement of Compliance (SOC) per requirement.** New `SocStatus` enum (FullyComply/PartiallyComply/NotComply) + `Requirement.socStatus` / `Requirement.socSummary` (≤1000 chars) — applied idempotently via raw SQL (CREATE TYPE IF NOT EXISTS pattern; no `db push` drift). SOC = standing per-requirement coverage judgment: do the mapped controls, taken together, fulfil the requirement? Distinct from per-assessment `RequirementConclusion`. UI: status badge in each requirement card header + expandable "Statement of Compliance" section (status select, 1000-char textarea with counter, placeholder per status), editable by SPO/Admin via `PUT /api/admin/table/Requirement/[rId]` (route extended; enum validated; null/empty clears). Design Philosophy #49 + domain glossary updated. |
| v1.13.8 | 2026-08-15 | **SOC pipeline — 808/808 SMDS requirements populated.** Verdicts bootstrapped from `RequirementCoverageAudit` (FullyMet→FullyComply, PartiallyMet→PartiallyComply, NotMet→NotComply); `deepseek-v4-pro` wrote the ≤1000-char summaries grounded in clause + intent + audit evidence + ALL mapped controls (compact CSF fields). Batch=1 × 30 workers, single-pass md5 shards + work-stealing, claim gate `soc:<rID>`, completion marker = `SocStatementAudit` row, write-through to `Requirement` in the same transaction. **Result: 293 Fully Comply, 346 Partially Comply, 169 Not Comply (~7 min).** Scripts: `soc_backup/soc_bootstrap/soc_worker/soc_aggregate/soc_monitor/soc_svc/soc_recover/_soc_truth/soc_report.py` (§9.6); dashboards :8790 with per-worker dead/stalled visibility; runbook `docs/workflow/soc-pipeline-runbook.md`; report `SOC_REPORT.md`. |
| v1.13.9 | 2026-08-15 | **Honest Controls Health + Requirements Coverage donut.** (1) Controls Health no longer counts untested controls as Effective: a control with zero `ControlAssignment` rows is **Never Tested** regardless of its default `rawHealthScore=80` (was showing a fake 100% on PAs like Ensure Safe Production where none of the 2,818 controls have been sampled). `paControls` query regains `_count.controlAssignments` for this check. (2) New **📊 Requirements Coverage** card beside Controls Health: donut over the SOC distribution (Fully/Partially/Not Comply, green/amber/red) with centre % = **Coverage = % of requirements Fully Comply** (of assessed); unset requirements shown as Not Assessed. Computed server-side from `reqWithControls.socStatus`. |
| v1.13.10 | 2026-08-15 | **Dashboard Process Health = SOC compliance coverage.** `/fla` "Process Health" now shows per-PA **compliance coverage** (`fully/assessed fully comply` + colour-coded %, % = Fully Comply of assessed requirements) instead of the misleading control-effectiveness metric (`0/N 0% Not Tolerable`). Subtitle updated. The heavy `controls + controlAssignments` include was dropped in favour of a light `requirements` SOC query — dashboard page load dropped from ~20s to ~3s. |
| v1.0.1 | 2026-07-24 | Added `ProcessAreaList` component — groups PAs by Standard with collapsible sections on `/setup/process-areas` |
| v1.0.2 | 2026-07-24 | Added `AssignedControlsList` component — 2-level PA→Req→Ctrl hierarchy for assessment assigned controls with inline effectiveness dropdowns, remove button, color-coded status, and mouseover tooltip showing full control statement |
| v1.0.3 | 2026-07-24 | Sorting: Standards and ProcessAreas sorted alphabetically; Requirement IDs sorted by natural numeric order (1, 2, 3… not 1, 10, 11) with Unmapped Controls always last. Applied to both Select Controls and Assigned Controls panels. |
| v1.0.4 | 2026-07-24 | Sprint 1 completed: G6 (ProcessAreas & Controls admin tabs), G8 (Company management), G9 (Template activity type linkages), G10 (Health reset button + API). Added `ProcessAreasAdminView`, `ControlsAdminView`, `CompanyAdminView`, `TemplateActivityTypesView`, `HealthResetButton`, and `POST /api/admin/reset-health`. |
| v1.0.5 | 2026-07-24 | Sprint 2 completed: G10b (health reset status display with last/next dates + ActivityLog), G11/G12 verified already built. Backlog now 33 completed, 9 remaining. |
| v1.0.6 | 2026-07-24 | Gamification design grilled and resolved: per-PA mastery tracks (Observer→Bronze→Silver→Gold→Platinum→Black), two-track economy (Conduct Assurance role-based + Domain Tracks per-activity), mixed milestone+XP progression, compact gamification widget. Updated CONTEXT.md with full design. |
| v1.0.7 | 2026-07-24 | Badge system rebuilt: cleared 305 old badges, added `ProcessArea.abbreviatedName` + `AchievementBadge` prompt fields (badgeType, backgroundPrompt, foregroundPrompt, designConfig, imageFormat). New 3-tab BadgesAdminView (Track/Role/Special). Image generation API: SVG via DeepSeek V4, PNG via gpt-image-2. Added G13-G15 backlog for XP engine + widget + dashboard. |
| v1.0.8 | 2026-07-24 | G13: Rewrote XP engine — two-track economy (Conduct Assurance role-based once per assessment + Domain XP per-PA per-activity), auto-creates GameAttribute per PA, Bronze badge auto-award at 10 XP. G14: Compact GamificationWidget on FLA dashboard + assessment detail (overall XP + latest non-Assurance track + top 3 tracks). Added `GET /api/gamification/stats`. |
| v1.0.9 | 2026-07-24 | Gamification Philosophy grilled & captured: 3-Layer Model (Playground/Game/Sport), Assessor-as-Coach paradigm, 5-dimension Mature Feedback Culture, 4-stage Maturity Model (Compliance→Recognition→Growth→Play), Unified Player Profile architecture. Created `Gamification of Work Processes.md` + ADR-0003 (Dynamic Badge Types). |
| v1.1.0 | 2026-07-24 | **P0-P2: Gamification Engine v2.** Generalized `GameAttributeRule` from activityType-only to `(source, eventType, gameAttributeId?, role?, basePoints, perUnitPoints, conditions?, dynamicModifiers?)`. Created rule engine (`src/lib/gamification/ruleEngine.ts`), event ingestion API (`POST /api/gamification/events`), badge evaluation engine (`src/lib/gamification/badgeEngine.ts`). Award route refactored to use declarative DB rules instead of hardcoded constants. Badge engine evaluates after every event. |
| v1.1.1 | 2026-07-24 | **P3: Maturity Stage System.** Added `GamificationStage` model (4 stages: Compliance→Recognition→Growth→Play). Created stage manager (`src/lib/gamification/stageManager.ts`) with readiness detection, advancement logic, and feature toggle utility. Added `GET /api/admin/gamification/readiness` (stage info + readiness signals) and `POST /api/admin/gamification/advance` (advance to next stage). Seeded all 3 companies: SAMS001=Growth, SMDS=Recognition, OGP=Compliance. |
| v1.2.0 | 2026-07-24 | **P4: Octalysis Core Drive Calculator.** Repurposed `EmotionalDriveMetric` from Carmazzi 8-drive to Chou Octalysis 8 Core Drives (epicMeaning, development, empowerment, ownership, socialInfluence, scarcity, curiosity, lossAvoidance). Updated `EmotionalDrive` enum. Built `src/lib/gamification/driveCalculator.ts` — calculates all 8 drives from behavioral data (assessments, XP, badges, findings, attachments, social interactions, cross-PA exploration) with White Hat / Black Hat balance. Added `GET /api/admin/gamification/core-drives?userId=X`. |
| v1.2.1 | 2026-07-24 | **P5: CSV Import Adapter.** Added `POST /api/admin/gamification/import-csv` — accepts CSV file upload + source + eventType, parses rows with quoted-field support, creates gamification events per row via rule engine, evaluates badges. Supports `useUploaderId` mode for single-user bulk imports. Returns summary: rows processed, points awarded, badges earned, errors. |
| v1.3.0 | 2026-07-24 | **P6: External Webhook Receiver.** Added `WebhookLog` model (source, eventType, payload, status, response). Created unified webhook endpoint `POST /api/webhooks/[source]` with `X-Webhook-Secret` header verification against `WEBHOOK_SECRET` env var. Delegates to rule engine for point awarding + badge evaluation. Logs all webhook calls for debugging. Gamification engine P0-P6 complete. |
| v1.3.1 | 2026-07-24 | **P4 (Extraction): AI-Assisted Control Extraction.** Created `DocumentExtract` + `ControlFromDocument` tables. Added `POST /api/admin/extraction/upload` (file upload + text extraction for .md/.txt/.csv), `POST /api/admin/extraction/extract` (DeepSeek-powered control extraction with JSON parsing + markdown code block handling, idempotent re-extraction), `GET /api/admin/extraction/documents` (document list with candidate counts). Extraction prompt covers all CSF fields, control types, HSSE criticality, standards, and requirements. |
| v1.4.0 | 2026-07-25 | **P5: Mobile Offline-First.** Enhanced `OfflineBanner` with service worker registration (`sw.js`), offline mutation queue (`queueOfflineMutation` in localStorage), and auto-sync on reconnect. Added `manifest.json` for PWA installability. Service worker caches core assets, intercepts API calls with graceful offline fallback. Users can queue findings/actions while offline — changes sync automatically when back online. |
| v1.4.1 | 2026-07-25 | **P6: Enhanced Gamification Dashboard.** Added XP Source Breakdown (Assessments vs Domain XP vs Interviews), Track Level Distribution (count per level: Observer/Bronze/Silver/Gold/Platinum/Black), and Next-Level Recommendations (top 3 tracks closest to level-up with XP needed). Enhanced `/gamification` page with server-side aggregation queries and updated `CompetencyDashboard` component. |
| v1.5.0 | 2026-07-25 | **P8: Competency Certificate (CV Export).** Added `Company.certSignatoryName` + `Company.certSignatoryPosition` columns. Created `POST /api/gamification/certificate`, `/gamification/certificate/[certId]` (printable A4: certificate page 1 + transcript page 2), `/verify/[certId]` (public verification). Self-service: any user clicks "📜 Export Certificate" from `/gamification`. Certificate shows top tracks, badges, XP, assessment count, closure rate, and company signatory block. Auto-opens print dialog. |
| v1.5.1 | 2026-07-25 | **Document Management Migration.** Replaced `DocumentExtract` model with new `Document` model (version control: version, isLatest, replacedById, archivedAt, documentNo). `ControlFromDocument` and `DocumentControl` moved to raw SQL tables with `documentId` FK (no longer Prisma-managed). Dropped `ControlFDSubProcess` (unused). Updated all extraction API routes (upload, extract, documents, parent route GET/POST/PATCH) to use new Document model + raw SQL for ControlFromDocument. Fixed DeepSeek model name: `deepseek-chat` → `deepseek-v4-pro`. Restored `certSignatory` columns on Company table after Prisma push dropped them. |
| v1.5.2 | 2026-07-25 | **Candidate Edit with Cascading Dropdowns.** Added inline edit form for AI-extracted control candidates with 14 editable fields. Standard → Process Area → Requirement cascading dropdowns populated from company data. Requirement ordering prioritizes company standards (non-ISO) before ISO international standards. Added `requirements` field to GET /api/admin/extraction?docId=X response. |
| v1.6.0 | 2026-07-25 | **ORCA Process Overview Tab.** Rebuilt Process Detail Overview tab around ORCA framework (Objectives → Risk → Controls → Assurance) with Improvement section. Added server-side health metrics computation (control health distribution, finding/action summaries, assessment cadence). SVG donut chart showing Effective/Partially/Ineffective/Never Tested controls. Collapsible "How to Read" guide. Added `Management in Control` design philosophy to CONTEXT.md. Removed Process Areas from navbar and dashboard quick-actions. Back arrow on detail page now returns to Dashboard. Activity Log converted from flex layout to proper HTML table with text wrapping. |
| v1.6.1 | 2026-07-25 | **Process Improvement Plan (PIP) Module.** Extended `BacklogItem` with PIP fields (isPIP, pipStatus, processAreaId, targetDate, source, riskAcceptance, alarpRationale). Added `PIPStatus` enum (Proposed→Approved→InProgress→Implemented→Closed). Created `BacklogItemControl` M2M junction linking PIP items to Controls. Extended `ProcessArea` with `micStatement` and `micStatementUpdatedAt`. New API routes: GET/POST `/api/admin/pip`, PATCH/DELETE `/api/admin/pip/[id]`, POST `/api/admin/pip/mic`. New Improvement tab with 5-column Kanban board. MIC Statement with edit mode (SPO/Admin) in ORCA Overview. |
| v1.6.2 | 2026-07-25 | **PIP Kanban: Assessment Action Auto-Sync.** Assessment actions (`apAgreed=true`) automatically appear in the PIP Kanban as amber cards linking back to their assessment. Accepted actions enter the Approved column. When closed (`closureDate` set), auto-advance to Closed with strikethrough styling. Server query joins Action→Finding→Assessment→ControlAssignment→Control→ProcessArea. Card shows assessment name, finding, control, and target date. Manual PIP items and auto-synced actions coexist in the same board with visual distinction. Added closable help popup modal explaining PIP workflow, columns, and ORCA context. Header shows breakdown: "5 items (3 from assessments)". |
| v1.6.3 | 2026-07-25 | **AI PIP Proposals.** Knowledge chat AI can now propose Process Improvement Plan items using `___PIP___` block format. AI is prompted to identify gaps, low-health controls, and improvement opportunities. Chat UI shows amber PIP proposal cards with "＋ Add to PIP" button (Admin/SPO only). Clicking adds the item to the Kanban's Proposed column. Fixed knowledge chat model name: `deepseek-chat` → `deepseek-v4-pro` (was missed in v1.5.1 fix). |
| v1.6.4 | 2026-07-25 | **Document Upload to AI Chat.** Added 📎 button to Knowledgebase tab chat allowing upload of documents (.pdf, .md, .csv, .docx, .txt) and images (.png, .jpg, etc.). Documents are markdown-converted and stored in `Document` table with `processAreaId` + `companyId`. Images processed via GPT-4o-mini vision API (OpenAI). New endpoint `POST /api/chat/knowledge/upload`. PA documents appear in AI context as summary list with on-demand full-content loading via `___FETCH___ documents`. Smart context: file summaries always included, full text loaded when user mentions a document by name. |
| v1.6.5 | 2026-07-26 | **Assessment Terms of Reference (TOR).** Added 6 TOR fields to Assessment model: `objective` (audit purpose), `scope` (what's assessed + references), `sponsor` (who commissioned), `methodology` (how audit conducted), `keyFocus` (attention areas & comments), `reportIssueDate` (expected report date). TOR fields editable in Assessment Detail → Overview tab alongside existing details (name, activity type, LOA, assessors, dates, status). Read-only TOR card appears when any TOR field is populated. All fields optional — assessments without TOR remain fully functional. |
| v1.8.2 | 2026-07-27 | **Manager Assignment, SMDS Import & Admin UX.** Added managerUsername column to User. Imported 541 SMDS users from Active Directory CSV to 532 new + 9 updated, 90 Departments, 320 Positions. Added managerName + organisationIndicator to User. Admin dashboard restructured, User Manager two-panel layout with company-grouped left panel. /admin?view=manager-assignment with filterable table. PUT /api/admin/users/[id] extended for managerUsername. |
| v1.8.3 | 2026-07-27 | **Manager Assignment — Distinct Managers, Save Button & Filter Persistence.** Rebuilt ManagerAssignmentView with three sections: (1) Distinct Managers with uncontrolled inputs (blur/Enter/Save button triggers), Status column filter buttons (All/✓/✗/tbc) persisted to URL via `?mgrFilter=` param (survives page reload), (2) Not in User Table collapsible, (3) User-by-User filterable table. Input values read from DOM via `data-mgr-name` attributes + `document.querySelector` to avoid stale refs. Fixed SSR hydration race condition between URL→state and state→URL effects. |
| v1.8.4 | 2026-07-27 | **Email-Based Manager Resolution.** Resolved 29 of 42 remaining TBC managers by matching Shell email patterns (`GivenName.LastName@shell.com`) against manager CSV names. Pattern bridges calling-name vs official-name gap (e.g., "Ho, Alvin" → "Ho, Wei Seng" via `Alvin.Ho@shell.com`). 28 verified by last-name + email match, 1 found via fuzzy name search ("Fakhruddin" → "Mohammad Fakhruddin"). 167 staff linked in first pass; additional 49 via pattern analysis. One manager ("Surang, Mujan") unresolvable — not in imported user list. |
| v1.8.5 | 2026-07-27 | **Not-in-User-Table: Remap & Add User.** Added two action controls per row: (1) "Remap to…" dropdown — reassigns staff to any existing user via alphabetically-sorted combobox showing "Name (username)" format, (2) "Add User" button — creates a new User record via `POST /api/admin/users/quick-add` with the manager's name and typed username. New API endpoint creates user with minimal fields. Imported 3 DSP users (MYJABU, MYMSVW, MYFMU1) completing the manager hierarchy — zero TBC managers remaining. |
| v1.8.6 | 2026-07-27 | **Optimistic Updates & No-Reload Saves.** All manager assignment actions (Save, Remap, Add User) now update the UI in-place via `localUsers` state — no `window.location.reload()`. Green success toast appears top-right for 2.5s. Filter, scroll position, and expanded sections preserved across saves. Manager hierarchy terminated at TOP: "Sulaiman, Siti, H" → TOP (Khajavi/Sheida is SMDS apex). Username confirmed as primary login identifier and cross-reference key. |
| v1.8.7 | 2026-07-27 | **Incomplete Profiles & Mandatory Fields.** Added "⚠️ Incomplete Profiles" collapsible section at top of User Manager left panel — flags users missing mandatory fields (currently email). Edit form labels for Name, Username, Email, Role marked with red `*`. Save blocked with toast if mandatory email is empty. Department and Position deliberately non-mandatory. |
| v1.8.8 | 2026-07-27 | **Org Chart, preferredName & Department Backfill.** Built `🏢 Org Chart` admin view with recursive CTE tree — 536 users, 6 levels, indented expandable list with search. Added `preferredName` column to User (86 backfilled from CSV). Backfilled 74 user positions from `SMDS_Whosewho.csv` (83 had Position but empty Department — placed under "SMDS — Unassigned"). Manager remap now also updates `managerName` to resolved user's name (296 rows backfilled). New API: `GET /api/admin/org-chart`. |
| v1.9.0 | 2026-07-28 | **Manager Resolution Complete.** 540 of 550 users have resolved `managerUsername`. Zero TBC, zero invalid usernames. 8 external manager names absorbed by 3 SMDS users. TOP sentinel marks hierarchy apex. Display shows `↳ USERNAME — Name` below Manager field. Preferred names shown in Org Chart as `Name (Preferred)`. Manager assignment: uncontrolled inputs with Save button + blur/Enter triggers, status filter persisted to URL, optimistic local state updates (no page reload). |
| v1.9.1 | 2026-07-28 | **preferredName Display Priority.** `preferredName` now the primary display name everywhere: Org Chart, User Manager left panel, and search bars. Fallback to formal `name` when preferred is absent. Search scans both `preferredName` and `name` so users are findable by either. |
| v1.7.1 | 2026-07-27 | **User Profile Page.** New `/profile` page accessible by clicking the username in the navbar ("Admin (Admin)" → link). Two tabs: **📊 Overview** (gamification dashboard — XP sources, track levels, recommendations, mastery tracks, badges, recent activity — moved here from the navbar's "Gamification" link, which was removed) and **👤 User Details** (read-only profile card with Name, Username, Email, Role badge, Position, Department, Member since, Total Points, Company Memberships; "✏️ Edit" opens inline form for name/username/email, saves via `PUT /api/admin/users/[id]`). Gamification nav link removed; `/gamification` route now redirects to `/profile`. New components: `ProfileTabs.tsx`, `UserDetailsTab.tsx`. |
| v1.9.2 | 2026-07-31 | **Company Selector — URL Params + Cookie Dual Mechanism.** Fixed `selectedCompanyId` cookie not being sent over HTTPS (missing `Secure` attribute). Switched primary mechanism to URL search params (`?companyId=X`) — CompanySelector now uses `router.push()` instead of `window.location.reload()`. Server reads `searchParams.companyId` with cookie fallback. Added `Suspense` boundary in NavBar for `useSearchParams()`. **My Actions company filter:** Added nested Prisma relation traversal `finding → assessment → companyId` to action queries in both `fla/page.tsx` and `admin/page.tsx`. **Comprehensive audit:** Identified 27 gaps across unauthenticated endpoints, missing company scoping on API routes, and models needing nested relation traversal (Action, Finding, Sample, ControlAssignment, Aact variants, etc.). Documented in lessons-learned-2026-07-31.md. |
| v1.10.0 | 2026-08-01 | **Complete Audit System.** 5 new models, 13 API routes, 5 components, 7 assessment tabs. All tiers G5-G10 + T2-T3-T5 delivered. |
| v1.10.1 | 2026-08-01 | **Control → Checklist Reconciliation.** `AssessmentChecklistControl` junction (checklistItemId → controlId → assessmentId). Keyword relevance engine scores assigned controls per checklist item. \"🔗 Linked Controls\" on each item row. Resolves 1.2M-row indirect trace. |
| v1.10.2 | 2026-08-01 | **IMS Integrated Checklist Template.** 5th template "IMS INTERNAL AUDIT" — 39 items covering shared clauses across all 4 standards. Rich fields carry per-standard breakdown. Design principles #25, #26. |
| v1.10.3 | 2026-08-02 | **Global/Local Template Governance.** `AuditChecklistTemplate` now supports multi-company management: SAMS001 templates flagged `isGlobal` (🌐), visible to all. Filter toggles: All / 🌐 Global / 🏢 Local. "📥 Copy to Local" clones global template + all items with `[COMPANY]` prefix. New API: POST /api/admin/audit-checklist-templates/[id]/adopt. Global templates read-only for non-SAMS001. Local templates fully editable. Design principle #27. |
| v1.10.4 | 2026-08-02 | **IMS Requirement Mapping (K1).** Auto-mapped all 39 IMS checklist items to 100 requirement references across QMS (25), EMS (24), OHSMS (26), and PMS (25). Sub-items with specific `(QMS §x.x)` references parsed automatically. Integrated parent items (IMS-001–IMS-018) mapped via `INTEGRATED_MAP` dict to equivalent clauses across all 4 standards. Creates `AuditEvidence` placeholder record as junction group container. Zero unmapped items. Script: `scripts/db/fix_ims_mappings_v3.py`. |
| v1.10.5 | 2026-08-02 | **UI/UX Test Run 2 — 84 cases passed.** Verified: Activities CRUD, Samples/Findings/Actions flow, Checklist compliance auto-save + notes/voice, Template management with 6-field editor, Dashboard Process Health, Controls assignment, Report tab with live compliance summary + TOR + AI analysis. **Design gap T8:** global templates editable on non-SAMS001 (should be read-only per v1.10.3). **Known issue:** `/api/gamification/stats` 500. |
| v1.10.6 | 2026-08-02 | **P1+P2 Bug Fixes + Test Completion (109 cases).** P1: Global template read-only guard enforced at UI (🔒 labels, hidden +Add/✏️/×) and API (403 on PUT/DELETE for non-SAMS001). 4 files, 78 insertions. P2: Gamification stats BigInt serialization fixed — `SUM()::int` cast + `Number()` wrapper. API returns 200 with 8 tracks + 36 XP. Test coverage: 109/130+ cases passed across 4 batches. Backlog: 5 remaining items (assessment flow, admin audit, deploy, 2 pre-existing features). |
| v1.10.7 | 2026-08-02 | **P4: End-to-end assessment creation verified (9/9).** Full pipeline tested: Assessment → ControlAssignment → Aact (6 default activities) → AssessmentAssessor → AuditChecklistItem → verified readable. All CRUD operations clean up with 0 traces. Checklist template adoption verified (39 items available). Admin subviews audited: 550 users (94 preferredName, 545 managers), 12 standards (2,393 requirements), 54 backlog items, 527 KB entries, 58 DB tables, 195 PAs, 3,144 controls. 4 backlog items remaining. |
| v1.10.8 | 2026-08-02 | **Checklist UI Redesign (v1.10.9–v1.10.12).** 4 iterations driven by user feedback: (1) "+X more controls" made clickable, grouped by requirement; (2) Collapsible requirement containers with reqId + clause text, per-requirement add/remove controls via search modal; (3) `AuditChecklist2Requirement` junction for checklist→control links, new `POST/DELETE /api/admin/assessments/[id]/checklist-requirements`; (4) Inline rich content (no toggle needed), collapsible "📋 Requirements (N mapped)" container, Unmap button. Collapsible template selector. Un-adopt checklist via DELETE. |
| v1.10.9 | 2026-08-02 | **Global Control ↔ Requirement Mapping UI.** Architectural grilling resolved 5 design decisions: (1) Controls live under ProcessAreas — single source of truth; (2) One control test cascades to all linked requirements — no duplicate ISO+process audits; (3) Requirement-first mapping workflow; (4) Global company-level mapping — assessments inherit automatically; (5) Batch cross-company replication via matching `requirementId` + `controlName`. **Implementation:** Enhanced `RequirementsView.tsx` with "＋ Add Control" modal (searches by control name/process area), "× Remove" on hover, instant UI updates. Enhanced `GET /api/admin/controls` with company scoping + `mappedRequirementRIds`. Added `DELETE` to `MapControl2Requirement/[id]`. Updated server query to include `mappingId` for delete operations. 4 files changed. |
| v1.10.10 | 2026-08-03 | **ISO 14001 + ICOP PMS Control Mapping Complete.** ISO 14001:2015 EMS: 177 mappings, 101 controls → 22 clauses (8 environment ProcessAreas). ICOP PMS: 1,231 mappings, 385 controls → 26 clauses (11 ProcessAreas). PA-level mapping: all controls in a ProcessArea map to relevant PMS clauses. 17 EMS + 16 PMS system-level clauses intentionally unmapped. SAMS001 only — SMDS/OGP ready for batch replication. New design principles #28 (Control-First Assurance) and #29 (Global Mapping, Batch Replication) in CONAN_Design Philosophy.md. IMS Audit Philosophy §8 added. 15 mapping/export/verify scripts committed. |
| v1.10.11 | 2026-08-03 | **QMS + OHSMS Mapping Complete & Modal Enhancements.** ISO 9001:2015 QMS: 427 mappings, 148 controls → 23 clauses. ISO 45001:2018 OHSMS: 663 mappings, 504 controls → 15 clauses. All 4 standards: 2,498 total mappings. **UI enhancements:** ProcessArea dropdown filter in Add Control modal (scope by PA before searching). "＋ New Control" button — inline form creates a new control (ProcessArea, Name, Control Type, Control Ref, Statement) and auto-links to the requirement via POST /api/admin/controls → POST MapControl2Requirement/data in one action. New control appears immediately in available list. |
| v1.11.0 | 2026-08-05 | **SMDS Control Rebuild — Foundation.** Deleted all 1,048 SMDS controls (backed up to `dbBackup/controls_smds_full_20260805_192325.json`) along with 6,283 related rows across 12 dependent tables (AuditChecklist2Requirement, ControlAssignment, ControlSubProcess, SubProcess, Assessment, Findings, etc.). Made `processAreaId` nullable on Control model — Controls are now independent of ProcessAreas; the mapping path is `Control → MapControl2Requirement → Requirement → ProcessArea`. New design principle: **Requirement-First Mapping** — controls are written to satisfy ISO/Shell requirements, not to mirror procedure documents. Strategy: rebuild consolidated controls from the SMDS Audit Brain (14 domains, 40+ nodes) + Knowledgebase (523 entries) + backup JSON (1,048 CSF statements), targeting as few controls as practical. `SubProcess` + `ControlSubProcess` marked for schema removal (backlogged). **Design philosophy updated** in CONTEXT.md (Requirement-First Mapping, Control Independence from PA, Consolidated Control Design). |
| v1.11.1 | 2026-08-05 | **SMDS Control Rebuild — Methodology & Batch Structure.** Rebuild strategy finalized: Brain-first with requirement overlay. Source material: SMDSAuditBrain.md (14 domains), SMDS_merged_part001-003.md (550+ procedures), Knowledgebase table (523 entries), 815 requirements across ISO 9001/14001/22301/45001 + Shell standards. **6-batch structure:** (1) Core Operations — Domains 1-3, (2) Emergency & Support — Domains 4-6, (3) Governance & Performance — Domains 7-8, (4) Environment & Projects — Domains 9-10, (5) Security & Commercial — Domains 11-13, (6) Social Performance — Domain 14. Each batch: AI reads Brain node + procedures + requirements → produces `merge_plan_batch_N.json` with consolidated controls → Python assembler validates and inserts Control + MapControl2Requirement entries. Design principles #30 (Requirement-First Mapping) and #31 (Control Independence from PA) added to CONAN_Design Philosophy.md. |
| v1.11.2 | 2026-08-05 | **SMDS Control Rebuild — Knowledgebase-Based Controls & Requirement-First Audit.** Deleted all SMDS controls and started fresh with SMDS-specific Knowledgebase procedures ONLY (not SAMS global practice documents). Built 110 consolidated controls from 523 KB entries grouped by ProcessArea × topic clusters. Cross-mapped controls to all 815 SMDS requirements (987 direct MCR + 4,719 cross-PA MCR = 5,706 total) achieving 100% coverage across all 12 standards. **Finding Model Enhancement:** Added 5 new fields to Finding — `requirementRId` (the clause not met), `processAreaId` (denormalized for query), `riskDescription` (consequence), `rootCause` (why the gap), `recommendation` (what to do). Created audit assessment (`assess_smds_3c6e5d6769`) with 346 findings: 7 Serious (Ionising Radiation, Human Factors — no procedures), 45 High (Contractor HSSE, Water, Product Stewardship, Diving, Biodiversity — flagged for SMDS procedure development), 82 overlay frameworks (PMS + IMS Integrated Audit — cross-mapped), 219 ISO standards (cross-mapped). **Design decisions:** (1) Finding references Requirement (required) + Control (optional), (2) One finding per requirement for granular closure, (3) Assessment scoped by standard/PA with control removal per TOR, (4) PMS and ISO standards are overlay frameworks — existing SMDS controls demonstrate compliance. |
| v1.11.3 | 2026-08-07 | **Tree-View Control Assignment & Compliance Matrix.** **ControlTreePanel:** Reusable tree component replacing the dual-panel `RequirementControlPanel` in both MinimalistView and Classic views. Tree: Standard → ProcessArea → Requirement → Control with checkboxes at every level. Cascade logic: check control auto-checks parent requirement; check requirement auto-checks all child controls. Multi-location awareness: 🔗N badge on controls appearing in N other requirements; popup on assign lists locations without auto-checking. Requirements with zero controls shown with gap indicator (Principle #32). Filter searches requirement IDs, clause content, and control names. "Selected Assignments" summary panel below tree groups assigned controls by PA → Req with per-control ✕ remove. **New API routes:** `GET /api/admin/assessments/[id]/requirement-tree` (full hierarchy with `controlLocations` map + `assignedControlIds` + `unmappedControls`), `POST /api/admin/assessments/[id]/controls/remove` (bulk-remove by controlIds). **Compliance Matrix:** Added per-requirement compliance table at top of Audit Report (before TOR): Requirement No | Requirement | Comply Y/N | Compliance Statement (Fully/Partially/Not complied with gap bullet points). Aggregates checklist items by `(requirementId, auditStandard)`. Existing checklist summary, control effectiveness, findings, and AI sections maintained. **Design philosophy:** CONAN Principles #32 (Tree-View Cascade) and #33 (Compliance Matrix); Audit Brain Principles #33 (Tree-View Assignment) and #34 (Per-Requirement Reporting). |
| v1.11.4 | 2026-08-07 | **Requirement Conclusions & Persisted Effectiveness.** ... |
| v1.11.5 | 2026-08-07 | **Test Method Capture & Dual-Trigger Findings.** ... |
| v1.11.7 | 2026-08-07 | **CSF Batch Extraction — V4 Pro + Full Context.** Switched `scripts/db/csf_batch_runner.py` from `deepseek-chat` (V4 Flash) to `deepseek-v4-pro`, full document context (removed 2,500-char truncation), and removed `max_tokens` cap. Measured: Pro+full context yields 2–3× more controls (batch 1: 22→59; batch 2: 47 controls) with deeper CSF fields (`csfHow` +8–16w, `csfEvidence` +2.6–5.3w) and per-asset granularity (9→16 analyser controls). PCN narratives consistently return 0 controls (expected). **Non-determinism finding:** same batch re-run gives 0% exact-name overlap — name-based dedup ineffective; each batch must run once per library build. Purged 680 legacy Flash controls, re-extracted batches 2-10 → 252 controls in DB. New scripts: `csf_extract_pro.py`, `pro_full_compare.py`, `purge_smds_controls.py`, `compare_batch1_runs.py`. |
| v1.11.8 | 2026-08-08 | **SMDS Extraction Complete + No-Dedup Rebuild.** All 105 batches extracted → 5,055 controls from 514 docs. Runner hardened (robust JSON parse, defensive fields, duration + failure logging, network retry, continue-on-error). DB rebuilt from batch JSON records (DELETE 4,912 → INSERT 5,055, 0 failures): **no-dedup** — duplicate names across docs preserved with running-number suffix + `knowledge` note (Principle #43); 21 closest-match `controlType` fixes; 1 missing field filled by DeepSeek, 1 registered empty (Principle #44 — extraction records = source of truth, rebuildable library). New scripts: `backup_smds_controls.py`, `merge_batch_jsons.py`, `analyze_merged.py`, `classify_issues.py`, `fix_merged.py`, `generate_sql.py`, `validate_sql_v2.py`, `execute_rebuild.py`. Fix report: `dbBackup/FIX_REPORT.md`. |
| v1.11.9 | 2026-08-08 | **Admin Knowledgebase & Standards UI Overhaul + Multi-Select Standard→PA Mapping.** (1) **Controls list tree:** `ControlsAdminView` groups controls as collapsible **ProcessArea (N docs) → Document (N controls) → controls**. (2) **Process Area company scoping:** `ProcessAreasAdminView` adds a **Company dropdown** (shows `companyID`, sits above Standard); the Standard dropdown is filtered by the selected company (`standards.filter(s => !form.companyId || s.companyId === form.companyId)`) and changing company resets the standard. `Standard` type now carries `companyId`; `StandardsManagementView` passes `standardsAll` down; `admin/page.tsx` adds the `standardsAllCompanies` query. (3) **KB 3-level tree:** `ListKnowledgeView` organizes entries as **Standard → ProcessArea → KB entries** with counts. (4) **Map Standard/PA tab (multi-select):** `MapKnowledgeView` — two-panel mapping UI. Left panel is a Standard → ProcessArea collapsible tree where docs sit under their mapped PA, each entry has a **checkbox** for multi-select; header has search, "Only unmapped (N)" filter (auto-expands No Standard when on), "Select all (N)" and "Clear". Right panel shows the single entry (with current mapping prefilled) or "N knowledge entries selected"; cascading Standard → ProcessArea dropdowns; "Save Mapping" (1) / "Map N Entries" (batch). **New APIs:** `PATCH /api/admin/table/Knowledgebase/[id]` (single-entry mapping) and `POST /api/admin/table/Knowledgebase/map` (batch `{ ids: string[], processAreaId }` — single `UPDATE ... WHERE kID = ANY(ids)`). Optimistic local state updates + success toast; verified end-to-end (34 unmapped SMDS entries, batch save writes to DB). |
| v1.11.6 | 2026-08-07 | **Checklist Repurposed & Compliance Matrix from Tree.** **Design decisions (5-part grill):** (1) Checklist = interview guide (read-only reference), Tree = single source of truth. (2) `complianceStatus` stripped from checklist items — no dual sources of truth. (3) Checklist adoption = scope transparency ("I used this guide"), not data cloning. (4) Compliance Matrix now derives from `RequirementConclusion` + `ControlAssignment.effective`, not checklist items. (5) "Checklist Compliance Summary" renamed to "Audit Coverage Summary" — shows which interview guides were used, item count only. **Code changes:** `AuditReportTab` fetches from both checklist API (coverage) and requirement-tree API (compliance). Matrix logic: FullyMet + all controls Effective = "Fully complied"; PartiallyMet or mixed = "Partially complied"; NotMet or zero controls = "Not complied." **Finding buttons wired:** `onCreateFinding` callback in `ControlTreePanel` now opens finding form in AssessmentClient (pre-fills description with requirement/control context) and switches to classic findings tab from MinimalistView. **Design philosophy:** CONAN Principles #38–40 (Checklist=Guide, Tree-Derived Compliance, Scope Transparency); Audit Brain Principles #39–41. | **ControlTreePanel:** Reusable tree component replacing the dual-panel `RequirementControlPanel` in both MinimalistView and Classic views. Tree: Standard → ProcessArea → Requirement → Control with checkboxes at every level. Cascade logic: check control auto-checks parent requirement; check requirement auto-checks all child controls. Multi-location awareness: 🔗N badge on controls appearing in N other requirements; popup on assign lists locations without auto-checking. Requirements with zero controls shown with gap indicator (Principle #32). Filter searches requirement IDs, clause content, and control names. "Selected Assignments" summary panel below tree groups assigned controls by PA → Req with per-control ✕ remove. **New API routes:** `GET /api/admin/assessments/[id]/requirement-tree` (full hierarchy with `controlLocations` map + `assignedControlIds` + `unmappedControls`), `POST /api/admin/assessments/[id]/controls/remove` (bulk-remove by controlIds). **Compliance Matrix:** Added per-requirement compliance table at top of Audit Report (before TOR): Requirement No | Requirement | Comply Y/N | Compliance Statement (Fully/Partially/Not complied with gap bullet points). Aggregates checklist items by `(requirementId, auditStandard)`. Existing checklist summary, control effectiveness, findings, and AI sections maintained. **Design philosophy:** CONAN Principles #32 (Tree-View Cascade) and #33 (Compliance Matrix); Audit Brain Principles #33 (Tree-View Assignment) and #34 (Per-Requirement Reporting). |

---

## Appendix B: Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| APP_DESIGN.md | `seam-assurance-app/APP_DESIGN.md` (archived: `01 Context and References/archive/seam-assurance-app/APP_DESIGN.md`) | Original SEAM Assurance App design (archived) |
| APP_DESIGN_PowerPlatform.md | `01 Context and References/archive/seam-assurance-app/APP_DESIGN_PowerPlatform.md` | Power Platform companion design (archived) |
| CONTEXT.md | `CONTEXT.md` (project root) | Sharpened domain glossary + design decisions |
| ADRs | `sams-app/docs/adr/` | Architecture Decision Records |
| Parallel Worker Coordination Runbook | `docs/parallel-worker-coordination.md` (project root) | Reusable method: DB lease + claim gate + standby + work-stealing + idempotency + monitoring + failure catalog |
| ADR: DB-Claims Coordination | `docs/adr/adr-coordinating-many-workers-db-claims.md` | Why Postgres leases/claims beat file locks & process guards for 20+ workers |
| Session Lessons (2026-08-13) | `/memories/lessons-learned-2026-08-13.md` | 19-entry failure catalog from the parallel extraction + mapping sessions |
| Schema | `sams-app/prisma/schema.prisma` | Prisma schema (source of truth for DB) |
| Gamification Design | `02 Design and Backup/SEAM_Process_Gamification_Design.md` | Full gamification design doc |
| Backup Instructions | `/memories/repo/backup.md` | DB backup & restore procedures |
| Grilling Workflow | `/memories/repo/grilling-workflow.md` | When and how to use grill-with-docs |
| Schema Change Checklist | `/memories/repo/schema-change-checklist.md` | Pre-deploy checklist for schema changes |

---

> **⚠️ CONSOLIDATED:** This document's design philosophy (§1) has moved to `CONAN_Design Philosophy.md`. The full app design has been consolidated into `CONAN_App Design.md` in the project root. Those files are now the single source of truth. This file is retained for reference only — do not update it.
