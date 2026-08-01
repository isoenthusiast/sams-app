# SAMS App — Design Reference

> **📐 Active alongside `CONAN_Design Philosophy.md` and `CONAN_App Design.md`.** CONAN docs are the narrative source of truth; this document is the technical specification (models, routes, components, APIs). Both are maintained.

**Last Updated:** July 31, 2026 (v1.9.2)

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
│  hayabusa.proxy.rlwy.net:54471/railway               │
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
| **Requirement** | `Requirement` | rId (Int) | requirementId, standard, clauseContent, processAreaId, companyId | `@@unique([requirementId, processAreaId, companyId])` | — |
| **Control** | `Control` | id (cuid) | name, statement, controlType, processAreaId (FK→ProcessArea), healthScore, companyId | `@@unique([name, companyId])` | — |
| **AssuranceProtocol** | `AssuranceProtocol` | id (cuid) | requirementId, rId (FK→Requirement), keyQuestions, whatGoodLooksLike, controlPoints | No company unique | `onDelete: Cascade` (Requirement) |

#### Junction / Mapping Models

| Model | Purpose | Unique Constraint |
|-------|---------|-------------------|
| **ControlSubProcess** | Control ↔ SubProcess (M:N) | `@@unique([controlId, subProcessId])` |
| **ControlFDSubProcess** | ControlFromDocument ↔ SubProcess (M:N) | `@@unique([controlFromDocumentId, subProcessId])` |
| **MapControl2Requirement** | Control ↔ Requirement (M:N) | `@@unique([controlId, requirementRId])` |
| **AssessmentAssessor** | Assessment ↔ User (additional assessors) | `@@unique([assessmentId, userId])` |
| **AssessmentTemplateControlLinkage** | Template ↔ Control | `@@unique([templateId, controlId])` |
| **AssessmentTemplateActivityType** | Template ↔ ActivityType | `@@unique([templateId, activityTypeId])` |

#### Assessment & Workflow Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | System user | name, username (unique), email, role (Admin/Superuser/Assessor/Interviewee), positionId (FK→Position), companyId, managerName, managerUsername, organisationIndicator. **v1.8.0:** Added managerName, organisationIdentifier fields. **v1.8.2:** Added managerUsername (resolved FK-like reference to User.username) |
| **Department** | Org unit within a company | name, companyId, parentDepartmentId (self-referencing hierarchy, NULL = top-level) |
| **Position** | Job title scoped to Department | title, departmentId (FK→Department). @@unique([title, departmentId]) |
| **Assessment** | Frontline assurance check | status (Planned→InProgress→Completed/Cancelled), loa, assessorId (lead), activityTypeId. **TOR fields (v1.6.5):** objective, scope, sponsor, methodology, keyFocus, reportIssueDate |
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
| **AuditChecklistTemplate** | Reusable checklist template | name, description, auditStandard (ISO9001/ISO14001/ISO45001/PMS), companyId (FK→Company) |
| **AuditChecklistTemplateItem** | Template line item (adopted by assessment) | checklistItemId (unique ID like QMS-7.1.5), checklistText, auditStandard, sortOrder, templateId (FK). @@unique([checklistItemId, templateId]) |
| **AuditChecklistItem** | Assessment-specific checklist instance | checklistItemId (copied from template), checklistText, auditStandard, complianceStatus (NotTested/Compliant/NonCompliant/NotApplicable/Observation), auditorNotes, testedDate, testedBy, evidenceMethod, sortOrder, assessmentId (FK), templateItemId (FK→AuditChecklistTemplateItem, nullable). @@unique([checklistItemId, assessmentId]) |

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
| **Knowledgebase** | Knowledge entries | knowledgeName, knowledgeContent, companyId, processAreaId |
| **MapArt2Know** | Article ↔ Knowledge mapping | artName, artID, kID, whyToMap |
| **DocumentExtract** | Uploaded source document | documentTitle, content (extracted text), status |
| **ControlFromDocument** | AI-extracted control candidate | CSF fields, status (Pending→Approved/Rejected) |
| **Attachment** | File attachment | fileName, filePath, fileSize, uploadedBy |
| **AttachmentMapping** | Polymorphic FK to any entity | destTable, recId |

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
| `/fla/new` | Client | Assessor+ | New assessment form |
| `/help` | Static | Auth | In-app help with screenshots |
| `/admin` | Client | Admin | Admin dashboard with view switching |
| `/admin?view=users` | Client | Admin | User CRUD (UserManager) |
| `/admin?view=backlog` | Client | Admin | Kanban backlog board |
| `/admin?view=database` | Client | Admin | DB management (backup/restore/execute SQL) |
| `/admin?view=extraction` | Client | Admin | Document upload & AI extraction |
| `/admin?view=manager-assignment` | Client | Admin | Manager assignment — three sections: (1) Distinct Managers with inline auto-save on blur + status filter (All/✓/✗/tbc), (2) Not in User Table collapsible, (3) User-by-User filterable table (All/Resolved/TBC) |
| `/admin?view=protocols` | Client | Admin | Assurance protocols table |
| `/admin?view=knowledgebase` | Client | Admin | Knowledgebase entries editor |
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
| `/api/admin/company/[id]/clean-templates` | POST | Admin | Remove adopted templates for a company |
| `/api/admin/company/[id]/adopt-templates` | POST | Admin | Adopt SAMS001 templates into a company |
| `/api/admin/database/backup` | GET | Admin | Download full SQL dump |
| `/api/admin/database/restore` | POST | Admin | Restore from SQL file upload |
| `/api/admin/database/execute-sql` | POST | Admin | Execute raw SQL (diagnostics) |
| `/api/admin/database/diagnose` | GET | Admin | DB health checks |
| `/api/admin/manager-assignment` | POST | Admin | Bulk-update `managerUsername` for all users with given `managerName` |
| `/api/admin/extraction` | POST | Admin | Upload + AI-extract controls from document |
| `/api/admin/assurance-protocols` | GET | Auth | Search/filter/paginate assurance protocols |
| `/api/admin/table/[table]/data` | GET | Auth | Generic table data API (company-scoped) |
| `/api/admin/table/[table]/data` | POST/PUT/DELETE | Admin/Assessor | Write to tables (Admin: all, Assessor: Aact tables only) |
| `/api/admin/table/[table]/template` | GET | Admin | Download CSV template for import |
| `/api/admin/table/Assessment/[id]/assessors` | PUT | Admin | Sync assessment assessors |
| `/api/admin/table/MapControl2Requirement/[id]` | DELETE | Admin | Remove control-requirement mapping |
| `/api/admin/table/Requirement/[rId]` | PUT | Admin | Update requirement fields |
| `/api/admin/assessments/checklist-templates` | GET | Auth | List available checklist templates for current company |
| `/api/admin/assessments/[id]/adopt-checklist` | POST | Assessor | Clone selected template items into assessment checklist (v1.10.0) |
| `/api/admin/assessments/[id]/checklist` | GET | Assessor | Get assessment checklist items with enriched mapped controls (v1.10.0) |
| `/api/admin/assessments/[id]/checklist/[itemId]` | PATCH | Assessor | Update checklist item compliance status, auditor notes, evidence method (v1.10.0) |

#### Assessor APIs (`/api/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/attachments` | POST | Assessor | Upload file + create Attachment + Mapping |
| `/api/attachments/[id]` | DELETE | Assessor | Delete attachment + mappings |
| `/api/health` | GET | Public | Health check |
| `/api/my/interviews` | GET | Auth | List user's assigned interviews |

#### AI APIs

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/chat/knowledge` | POST | Auth | DeepSeek chat with knowledgebase context |
| `/api/chat/knowledge/upload` | POST | Auth | Upload doc/image → text extraction or vision → Document row (optional `folder` field: `Uploaded` from Documents tab, default `AI Chat`) |
| `/api/documents/[id]` | PATCH | Assessor+ | Edit document summary |
| `/api/documents/[id]` | DELETE | Admin | Soft-delete (archive) document; shared (SAMS001) docs only while SAMS001 selected |
| `/api/chat/update-control` | POST | Admin | Create Control from AI-suggested `___CONTROL___` block |

#### Gamification APIs

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/gamification/award` | POST | Auth | Award points via rule engine + evaluate badges |
| `/api/gamification/events` | POST | Auth | Generic event ingestion — single entry point for all gamification events (internal + external) |
| `/api/gamification/stats` | GET | Auth | User gamification stats (overallXP, tracks, levels) |

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
| **RequirementCard** | Server | Requirement summary card |
| **AssessmentCard** | Server | Assessment summary card with status |
| **AssessmentActivitiesPanel** | Client | Activity list + document review guidance |
| **FindingCard** | Client | Finding detail with actions |
| **ActionModal** | Client | Add/Edit action modal |
| **ActionRowClient** | Client | Single action row with expand/collapse |
| **AttachmentList** | Client | File upload + list for any entity |
| **GamificationPanel** | Server | Points + badges display |
| **KnowledgebasePanel** | Client | KB entry tree + content viewer/editor |
| **KanbanBoard** | Client | Drag-and-drop backlog board |
| **UserManager** | Client | User CRUD with modal forms |
| **UserSearchSelect** | Client | Typeahead user search |
| **MyInterviewsClient** | Client | Interviewee interview list |
| **AssignedControlsList** | Client | 2-level hierarchy (PA→Req→Ctrl) for assigned controls with inline effectiveness, tooltips, and remove |
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
| **ManagerAssignmentView** | Three-section manager→username resolution: (1) Distinct Managers with uncontrolled inputs (auto-save on blur via POST /api/admin/manager-assignment) + Status column filter buttons (All/✓ in table/✗ not found/tbc), (2) "Not in User Table" collapsible details, (3) User-by-User filterable table (All/Resolved/TBC) with inline dropdown edit |
| **RequirementsView** | Requirements browser |
| **ChecklistTemplateSelector** (v1.10.0) | Client component — multi-select checklist templates via checkboxes, "Adopt Selected Checklist(s)" button → POST adopt-checklist API, success/error feedback |
| **AssessmentChecklistTab** (v1.10.0) | Client component — grouped by auditStandard collapsible sections, per-item compliance status dropdown (Not Tested/Compliant/Non-Compliant/N.A./Observation), control-to-requirement trace display (Requirement ID → Control Name → Source File), auditor notes inline |

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
|---------|------|---------|
| v1.0.0 | 2026-07-24 | Initial SAMS_APP_DESIGN.md created — comprehensive documentation of all design aspects |
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

---

## Appendix B: Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| APP_DESIGN.md | `seam-assurance-app/APP_DESIGN.md` (archived: `01 Context and References/archive/seam-assurance-app/APP_DESIGN.md`) | Original SEAM Assurance App design (archived) |
| APP_DESIGN_PowerPlatform.md | `01 Context and References/archive/seam-assurance-app/APP_DESIGN_PowerPlatform.md` | Power Platform companion design (archived) |
| CONTEXT.md | `CONTEXT.md` (project root) | Sharpened domain glossary + design decisions |
| ADRs | `sams-app/docs/adr/` | Architecture Decision Records |
| Schema | `sams-app/prisma/schema.prisma` | Prisma schema (source of truth for DB) |
| Gamification Design | `02 Design and Backup/SEAM_Process_Gamification_Design.md` | Full gamification design doc |
| Backup Instructions | `/memories/repo/backup.md` | DB backup & restore procedures |
| Grilling Workflow | `/memories/repo/grilling-workflow.md` | When and how to use grill-with-docs |
| Schema Change Checklist | `/memories/repo/schema-change-checklist.md` | Pre-deploy checklist for schema changes |

---

> **⚠️ CONSOLIDATED:** This document's design philosophy (§1) has moved to `CONAN_Design Philosophy.md`. The full app design has been consolidated into `CONAN_App Design.md` in the project root. Those files are now the single source of truth. This file is retained for reference only — do not update it.
