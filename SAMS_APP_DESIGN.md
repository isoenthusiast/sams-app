# SAMS App — Complete Design & Architecture Documentation

**Last Updated:** July 24, 2026 (v1.0.0 — Initial)
**Code Name:** "SAMS" — Seam Assurance Management System
**Repository:** `sams-app/` (Next.js 16 + Prisma + PostgreSQL)

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Architecture Overview](#2-architecture-overview)
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
| **Assessment** | Frontline assurance check | status (Planned→InProgress→Completed/Cancelled), loa, assessorId (lead), activityTypeId |
| **ControlAssignment** | Controls assigned to assessment | effectiveness (Effective/NotEffective/null), effectiveUpdatedAt |
| **Sample** | Record sample tested | status (Tested/NotTested), conclusion (Pass/Fail), controlEffective |
| **Finding** | Finding raised during assessment | severity (Low/Medium/High/Serious), repeat, FID-xxxxxx ID |
| **Action** | Remediation tied to finding | actionId, closureDate, closureEvidence, actionClosureEffective |
| **Aact** | Assurance activity (interview, meeting, doc review) | aaID (unique), activityName, activityDate |
| **AActUsers** | Participants in activity | userRoles, assignmentRemarks |
| **AActControls** | Controls mapped to activity | — |
| **AActDetails** | Activity detail/notes | checklists, activityNotes, summaryAgainstControls |

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
| **User** | System user | username (unique), role (Admin/Superuser/Assessor/Interviewee), positionId, companyId |
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
| `/setup/processdetails/[id]` | RSC + Client | Auth | PA detail: Knowledgebase, Requirements, Controls tabs |
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
| `/admin?view=protocols` | Client | Admin | Assurance protocols table |
| `/admin?view=knowledgebase` | Client | Admin | Knowledgebase entries editor |
| `/admin?view=requirements` | Client | Admin | Requirements viewer |
| `/admin?view=badges` | Client | Admin | Badge management |

### 5.2 API Routes

#### Admin APIs (`/api/admin/*`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/admin/users` | GET/POST | Admin | List all users / Create user |
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
| `/api/admin/extraction` | POST | Admin | Upload + AI-extract controls from document |
| `/api/admin/assurance-protocols` | GET | Auth | Search/filter/paginate assurance protocols |
| `/api/admin/table/[table]/data` | GET | Auth | Generic table data API (company-scoped) |
| `/api/admin/table/[table]/data` | POST/PUT/DELETE | Admin/Assessor | Write to tables (Admin: all, Assessor: Aact tables only) |
| `/api/admin/table/[table]/template` | GET | Admin | Download CSV template for import |
| `/api/admin/table/Assessment/[id]/assessors` | PUT | Admin | Sync assessment assessors |
| `/api/admin/table/MapControl2Requirement/[id]` | DELETE | Admin | Remove control-requirement mapping |
| `/api/admin/table/Requirement/[rId]` | PUT | Admin | Update requirement fields |

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
| `/api/chat/update-control` | POST | Admin | Create Control from AI-suggested `___CONTROL___` block |

#### Gamification APIs

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/gamification/award` | POST | Auth | Award points + check badge criteria |

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

### 6.3 Admin View Components (`src/app/admin/`)

| Component | Purpose |
|-----------|---------|
| **AssuranceProtocolView** | Filterable, paginated protocol table with expandable rows |
| **BadgesView** | Badge catalogue viewer |
| **ExtractionView** | Document upload + AI extraction UI |
| **KnowledgebaseView** | Knowledgebase entry editor |
| **RequirementsView** | Requirements browser |

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

**Wired up:**
- `POST /api/gamification/award` — basic point award (50 for assessment_complete, 10 for other)
- "First Assessment" badge check
- `PointTransaction` records created
- Schema fully defined (GameAttribute, GameAttributeRule, AchievementBadge, UserAchievement, EmotionalDriveMetric, Milestone)

**Not yet wired:**
- `GameAttributeRule` engine — rules defined but not triggered by any workflow
- Team leaderboard UI — schema exists (Department/Position), UI not built
- Individual competency tracks — data collected, visualization not built
- Badge catalogue beyond "First Assessment"
- Emotional drive calculation + display
- Quarterly point/health reset automation

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

1. **Company Cookie:** `selectedCompanyId` stored in browser cookie, read by `getSelectedCompanyId()` in `src/lib/authz.ts`
2. **Server-Side Filtering:** All data queries add `where: { companyId }` when a company is selected
3. **Company Selector:** `CompanySelector` component in NavBar — updates cookie on change
4. **Template Adoption:** SAMS001 acts as seed. "Adopt Templates" copies Standards, ProcessAreas, SubProcesses, Requirements, Controls, and mappings into the target company
5. **Composite Uniques:** `@@unique([field, companyId])` on all company-scoped tables prevents cross-company collisions

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

---

## 9. AI Integration

### 9.1 Knowledgebase Chat (`/api/chat/knowledge`)

**Model:** DeepSeek V4 (`deepseek-chat`)
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
1. Upload via Attachment system (`destTable=DocumentExtract`)
2. Text extraction: `pdf-parse` (PDF), `mammoth` (DOCX→markdown), direct read (MD/TXT/CSV)
3. AI extracts structured controls → `ControlFromDocument` records
4. Human reviews candidates → Approve (creates Control + MapControl2Requirement) or Reject

**Status Flow:**

| DocumentExtract | ControlFromDocument |
|-----------------|---------------------|
| Uploaded → Extracted → Completed | Pending → Approved / Rejected |

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
- **Company scoping:** All data reads filtered by `companyId`

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

---

## Appendix B: Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| APP_DESIGN.md | `seam-assurance-app/APP_DESIGN.md` | Original SEAM Assurance App design (companion app) |
| APP_DESIGN_PowerPlatform.md | `seam-assurance-app/APP_DESIGN_PowerPlatform.md` | Power Platform companion design |
| CONTEXT.md | `CONTEXT.md` (project root) | Sharpened domain glossary + design decisions |
| ADRs | `sams-app/docs/adr/` | Architecture Decision Records |
| Schema | `sams-app/prisma/schema.prisma` | Prisma schema (source of truth for DB) |
| Gamification Design | `02 Design and Backup/SEAM_Process_Gamification_Design.md` | Full gamification design doc |
| Backup Instructions | `/memories/repo/backup.md` | DB backup & restore procedures |
| Grilling Workflow | `/memories/repo/grilling-workflow.md` | When and how to use grill-with-docs |
| Schema Change Checklist | `/memories/repo/schema-change-checklist.md` | Pre-deploy checklist for schema changes |

---

> **📝 Auto-Update Instruction:** After completing any feature, bug fix, or significant change to the SAMS app, update this document:
> 1. Add a version entry in Appendix A with date + summary of changes
> 2. If schema changed, update Section 4 (Data Model) — verify all models, fields, and relationships are accurate
> 3. If routes changed, update Section 5 (Route Map)
> 4. If components changed, update Section 6 (Component Library)
> 5. If new design decisions were made, update the relevant section
> 6. Run `python backup.py` from project root to back up this document
>
> **Schema sync rule:** When `prisma/schema.prisma` is modified, also update Section 4 of this document before committing.
