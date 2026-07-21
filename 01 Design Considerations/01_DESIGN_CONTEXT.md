# SAMS App — Design Context

**Project:** SAMS Assurance App (SAMS = Shell Asset Management System)  
**Companion:** `seam-assurance-app` (existing application, shared database)  
**Database:** PostgreSQL (same instance as seam-assurance-app)  
**Purpose:** Same functionality, redesigned user experience  
**Status:** Design Phase — No Code Yet

---

## 1. Relationship to Existing App

| Aspect | seam-assurance-app | sams-app |
|--------|-------------------|----------|
| **Database** | PostgreSQL (shared) | PostgreSQL (shared) |
| **Schema** | 45 models, 10 enums | Same — no changes |
| **API Routes** | ~90 endpoints | Reuse existing endpoints |
| **Authentication** | NextAuth.js v5 | Same auth system |
| **Authorization** | Role-based (Admin/Assessor) | Same role model |
| **Purpose** | Full-featured application | Redesigned UX layer |
| **Users** | Same user base | Same user base |
| **Data** | Production data | Same production data |

**Key Principle:** sams-app is a **pure UI/UX redesign** — it reads from and writes to the same database, uses the same APIs, and respects the same authorization rules. The only difference is how the user interacts with the system.

---

## 2. Design Philosophy

### 2.1 Why a Separate App?

The existing `seam-assurance-app` has grown organically over 2 years. It works, but:

- **Navigation is flat** — single navbar serves both Admin and Assessor roles
- **Admin features clutter assessor workflow** — assessors see links they can't use
- **Mobile experience is an afterthought** — desktop-first design with limited tablet support
- **Component reuse is low** — large monolithic page components with inline JSX
- **Accessibility is minimal** — no ARIA labels, keyboard-only drag-and-drop

### 2.2 sams-app Design Goals

| Goal | How |
|------|-----|
| **Role-First UI** | Separate navbars, landing pages, and feature sets per role |
| **Progressive Disclosure** | Complexity hidden until needed (mapping mode, expandable cards) |
| **Mobile-Aware** | Tablet-first for field assessors, desktop for admins |
| **Component-Driven** | Reusable components extracted from monolithic pages |
| **Accessible** | ARIA labels, keyboard navigation, focus management |
| **Consistent** | Design tokens for colors, spacing, typography |

---

## 3. User Personas (from Production Database)

### 3.1 Admin Users (6 total)

| Username | Company Access | Primary Role |
|----------|---------------|--------------|
| `admin` | SAMS001, SMDS, OGP | System administrator |
| `aisyah` | SMDS | Company admin |
| `edward` | SAMS001, SMDS, OGP | Multi-company admin |
| `jonathan` | SAMS001, SMDS | Multi-company admin |
| `rhanif` | SAMS001, SMDS | Multi-company admin |
| `shahsha` | SAMS001, OGP | Multi-company admin |

**Admin Goals:**
- Configure master data (controls, requirements, process areas)
- Manage users and company assignments
- Adopt templates to propagate SAMS001 blueprint
- Database backup/restore
- Monitor system health

### 3.2 Assessor Users (6 total)

| Username | Company Access | Primary Role |
|----------|---------------|--------------|
| `denry` | OGP | Field assessor |
| `megan` | SMDS | Field assessor |
| `paul` | SMDS | Field assessor |
| `presca` | SMDS | Field assessor |
| `regina` | SAMS001, SMDS | Senior assessor |
| `tecklee` | SMDS | Field assessor |

**Assessor Goals:**
- Create and execute assessments
- Collect evidence (samples, attachments)
- Record findings and assign actions
- Use knowledgebase for reference
- Track personal gamification progress

### 3.3 Persona Matrix

| Persona | Count | Company Selector | Landing Page | Mobile Priority |
|---------|-------|-----------------|--------------|-----------------|
| Single-Company Admin | 1 (aisyah) | Hidden | `/admin` | Low |
| Multi-Company Admin | 5 | Visible | `/admin` | Low |
| Single-Company Assessor | 4 (denry, megan, paul, tecklee) | Hidden | `/fla` | High |
| Multi-Company Assessor | 1 (regina) | Visible | `/fla` | High |

---

## 4. Navigation Architecture

### 4.1 Current Problem (seam-assurance-app)

```
Single Navbar: Dashboard | Assessments | Process Area | Controls | Admin | Help
                  ↑
         Same for everyone — Admin sees assessor links,
         Assessor sees Admin link (403 if clicked)
```

### 4.2 sams-app Solution

**Admin Navbar:**
```
┌────────────────────────────────────────────────────────────────────┐
│ SAMS [SAMS001 ▾]  Dashboard    Setup    Admin    Help             │
│                          ↑        ↑        ↑                       │
│                     /admin   /setup/*  /admin/*                    │
└────────────────────────────────────────────────────────────────────┘
```

**Assessor Navbar:**
```
┌────────────────────────────────────────────────────────────────────┐
│ SAMS          Dashboard    My Work    Knowledgebase    Help        │
│                  ↑            ↑            ↑                       │
│                /fla      /fla/*    /knowledgebase                  │
└────────────────────────────────────────────────────────────────────┘
```

**Key Differences:**
- Admin sees "Setup" (Process Areas, Controls, Requirements) and "Admin" (Users, Database, Templates)
- Assessor sees "My Work" (Assessments, Actions, Findings) and "Knowledgebase"
- Company selector only visible for multi-company users
- SAMS001 (template company) only visible to Admin role

### 4.3 Company Selector Logic

```typescript
// Pseudo-code for company selector visibility
function showCompanySelector(user: User, companies: Company[]): boolean {
  const userCompanyCount = user.userCompanies.length;
  const isAdmin = user.role === "Admin";
  
  // Show if: multiple companies OR admin (needs template access)
  return userCompanyCount > 1 || isAdmin;
}
```

---

## 5. Information Architecture

### 5.1 Admin Information Flow

```
Admin Dashboard (/admin)
├── 📊 Overview
│   ├── System health summary
│   ├── Recent activity log
│   └── Quick actions (backup, adopt templates)
│
├── 🗄️ Database
│   ├── Table browser (45 tables)
│   ├── Backup / Restore
│   └── Sync check
│
├── 👥 Users
│   ├── User list with company assignments
│   ├── Add / Edit users
│   └── Role management
│
├── 📋 Requirements
│   ├── Tree: Standard → Process Area → Requirements
│   ├── Inline editor
│   └── Associated controls panel
│
├── 🏷️ Badges
│   ├── Badge definitions
│   ├── Generate / Clear
│   └── User achievements
│
├── 📚 Knowledgebase
│   ├── Document upload
│   ├── Search / Preview
│   └── AI chat assistant
│
└── 📦 Templates
    ├── Assessment templates
    ├── Adopt to companies
    └── Template editor
```

### 5.2 Assessor Information Flow

```
Dashboard (/fla)
├── 📊 Process Health
│   ├── By standard (collapsible)
│   ├── Traffic-light indicators
│   └── Click → navigate to PA
│
├── ⚡ Quick Actions
│   ├── + New Assessment
│   ├── My Open Actions
│   └── Upload Evidence
│
├── 🏆 Gamification
│   ├── Points & streak
│   ├── Recent badges
│   └── Leaderboard position
│
└── 📋 My Work
    ├── Active assessments
    ├── Pending findings
    └── Overdue actions
```

---

## 6. Shared Database Strategy

### 6.1 Connection

Both apps connect to the **same PostgreSQL instance**:

```
# seam-assurance-app/.env
DATABASE_URL="postgresql://postgres:...@hayabusa.proxy.rlwy.net:54471/railway"

# sams-app/.env (same)
DATABASE_URL="postgresql://postgres:...@hayabusa.proxy.rlwy.net:54471/railway"
```

### 6.2 Schema Sharing

- **No schema changes** — sams-app uses the exact same Prisma schema
- **No new tables** — all data structures remain identical
- **No migrations** — sams-app is a read/write layer on existing data

### 6.3 API Reuse

sams-app will call the **same API endpoints** as seam-assurance-app:

| Endpoint | Used By | Purpose |
|----------|---------|---------|
| `GET /api/admin/table/[table]/data` | Both apps | List table rows (company-scoped) |
| `POST /api/admin/table/[table]` | Both apps | Create row (admin/whitelist) |
| `PUT /api/admin/table/[table]/[id]` | Both apps | Update row |
| `DELETE /api/admin/table/[table]/[id]` | Both apps | Delete row (with cascade) |
| `GET /api/admin/assessments` | Both apps | List assessments |
| `POST /api/admin/assessments` | Both apps | Create assessment |
| `GET /api/controls` | Both apps | List controls with mappings |
| `POST /api/convert` | Both apps | Document conversion |
| `POST /api/chat/knowledge` | Both apps | AI chat assistant |
| `GET /api/admin/database/backup` | Admin app | Full database backup |
| `POST /api/admin/database/restore` | Admin app | Database restore |

### 6.4 Authentication Sharing

- Same NextAuth.js configuration
- Same JWT secret and session strategy
- Same credentials provider
- Users can log into either app with the same credentials

---

## 7. Technology Stack

| Layer | sams-app | seam-assurance-app | Notes |
|-------|----------|-------------------|-------|
| Framework | Next.js 16.2.9 | Next.js 16.2.9 | Same |
| Database | PostgreSQL 16/18 | PostgreSQL 16/18 | Shared instance |
| ORM | Prisma 7.8.0 | Prisma 7.8.0 | Same schema |
| Auth | NextAuth.js 5.x | NextAuth.js 5.x | Same config |
| UI Library | React 19.2.4 | React 19.2.4 | Same |
| CSS | Tailwind CSS 4.x | Tailwind CSS 4.x | Same |
| Deployment | Railway | Railway | Same platform |

**Key Difference:** sams-app will use a **component-driven architecture** with extracted reusable components, while seam-assurance-app has monolithic page components.

---

## 8. Design Constraints

### 8.1 Must Preserve

| Constraint | Reason |
|-----------|--------|
| Same database schema | No migrations possible |
| Same API endpoints | Data consistency |
| Same auth system | Single sign-on |
| Same role model (Admin/Assessor) | Authorization rules |
| Company scoping (companyId) | Data isolation |
| SAMS001 as template company | Blueprint propagation |

### 8.2 Can Change

| Aspect | Freedom |
|--------|---------|
| Page layouts | Complete redesign |
| Navigation structure | Role-based navbars |
| Component organization | Extract reusable components |
| Mobile responsiveness | Tablet-first for assessors |
| Accessibility | Add ARIA labels, keyboard nav |
| Visual design | New color scheme, typography |
| User flows | Simplified workflows |

### 8.3 Cannot Change

| Aspect | Constraint |
|--------|-----------|
| Database tables/columns | Would break seam-assurance-app |
| API request/response formats | Would break existing integrations |
| Authentication flow | Would break existing sessions |
| Company data isolation | Security requirement |

---

## 9. Success Metrics

| Metric | Current (seam-assurance-app) | Target (sams-app) |
|--------|------------------------------|-------------------|
| Time to create assessment | ~5 clicks | ~3 clicks |
| Time to map controls | ~7 clicks (Bulk Map) | ~2 clicks (Map Mode) |
| Mobile usability score | 60% | 90% |
| Accessibility score | 40% | 80% |
| Component reuse | 20% | 70% |
| First-time user onboarding | No guidance | Interactive tour |

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Data conflicts between apps | High | Same database, same validation rules |
| User confusion (two apps) | Medium | Clear branding, role-based landing pages |
| Maintenance overhead | Medium | Shared component library, shared API layer |
| Deployment complexity | Low | Same Railway platform, independent deploys |
| Feature parity drift | Medium | sams-app focuses on UX, not new features |

---

## 11. Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-07-21 | Initial design context document. User personas, navigation architecture, information architecture, shared database strategy, technology stack, constraints, success metrics, risks. |
