# CONAN — PowerApps Build Quest

**An 8-Sprint Journey for Junior Developers**
**Target Platform:** Microsoft PowerApps (Canvas) + SharePoint Lists + Power Automate
**Total Effort:** 64 hours (8 sprints × 8 hours)
**Data Status:** ✅ Ready — needs loading into SharePoint

---

## Table of Contents

1. [Letter to the Team](#1-letter-to-the-team)
2. [What Are We Building?](#2-what-are-we-building)
3. [Design Philosophy — The WHY](#3-design-philosophy--the-why)
4. [SharePoint Data Model](#4-sharepoint-data-model)
5. [App Screens Overview](#5-app-screens-overview)
6. [The 8-Sprint Backlog](#6-the-8-sprint-backlog)
7. [Data Loading Guide](#7-data-loading-guide)
8. [Development Guidelines](#8-development-guidelines)
9. [Appendix: Reference Screenshots](#9-appendix-reference-screenshots)

---

## 1. Letter to the Team

Hello team! 👋

You're about to build something that genuinely changes how people work. Not just another business app — but a system that transforms "dreaded audits" into a game people want to play.

**CONAN** (Seam Assurance Management System) helps organizations continuously prove their safety barriers are holding. It takes the fear out of audits by making assurance visible, collaborative, and — believe it or not — fun.

Don't worry if you've never built anything like this before. This document is your quest log. Every backlog item is one concrete, achievable task. By the end of Sprint 8, you'll have built a complete assurance management system.

**You've got this.** Let's go.

---

## 2. What Are We Building?

### 2.1 The Problem

Today, organizations deal with assurance like this:

> Audit → Find gaps → More paperwork → Dread next audit

Everyone treats audits as something to survive, not something to learn from. Leadership can't see whether barriers are actually working. The assessor is seen as "the enemy with a clipboard."

### 2.2 The Solution

CONAN flips this on its head:

> Assurance → Find gaps → Close them → Get stronger → Celebrate wins

- **Assessors become coaches**, not adversaries — "Let me help you see your blindspots"
- **Findings are gold** — catching a gap before it becomes an incident is celebrated
- **Everyone can see barrier health** — from the frontline worker to the CEO
- **Gamification makes it stick** — points, badges, and leaderboards reward doing the right thing

### 2.3 What the App Does (Feature Summary)

| Area | What Users Can Do |
|------|-------------------|
| **Process Areas** | Browse standards → drill into process areas → see requirements, controls, documents |
| **Assessments** | Create frontline assurance checks → assign controls → record samples |
| **Findings & Actions** | Raise findings when controls fail → track remediation actions to closure |
| **User Profiles** | See your gamification stats, earned badges, XP levels |
| **Admin Panel** | Manage users, companies, standards, templates, backlog |
| **Gamification** | Earn XP for completing assessments, unlock badges, climb leaderboards |
| **Knowledge Base** | Search and reference procedures, policies, and assurance protocols |

---

## 3. Design Philosophy — The WHY

> **Read this section before writing a single line of Power Fx.** Every screen, every button, every list you build traces back to one of these principles.

### 3.1 Core Mission

> **Make assurance visible, continuous, and everyone's job.**

CONAN is NOT an audit checklist app. It's an **assurance management system**. The difference matters:

| Audit Tool | Assurance System |
|------------|-----------------|
| "Did you pass?" | "Are your barriers holding right now?" |
| One-time event | Continuous visibility |
| Punishes findings | Celebrates finding gaps early |
| Assessor vs. auditee | Coach + learner |

### 3.2 The 15 Guiding Principles

These are your north star. When you're unsure how to build something, come back here.

| # | Principle | What It Means For Your Build |
|---|-----------|------------------------------|
| 1 | **Assurance over Audit** | Track barrier health continuously, not pass/fail snapshots. Show health scores (0-100%) on controls. |
| 2 | **Findings are Gold** | When someone finds a gap, the UI should celebrate it, not shame them. "Great catch — you found this before it hurt someone." |
| 3 | **Every Role Has Stakes** | Interviewees see their interviews. Assessors see their assessments. Admins see everything. No one sees "nothing." |
| 4 | **No-Blame Design** | Ineffective samples earn 0 points, NEVER negative. No punishment mechanics. Learning conversations only. |
| 5 | **Abundance, Not Scarcity** | Leaderboards rank by total team points, not zero-sum competition. Everyone wins by doing their own work well. |
| 6 | **Traceability to Risk** | Every point, badge, and health score must trace back to a specific control protecting against a specific risk. |
| 7 | **Company Isolation** | SMDS users never see OGP data. Always filter by Company. This is non-negotiable. |
| 8 | **preferredName First** | Display calling names (e.g. "Alvin") instead of formal names ("Ho, Wei Seng") when available. Search scans both. |
| 9 | **Leadership Visibility** | Build a Demo/Overview screen that tells the story — leaders don't need to click through every page. |
| 10 | **Hierarchy Clarity** | Org charts should be color-coded by depth. Show who reports to whom at a glance. |
| 11 | **Resilient Error Recovery** | Never show raw error messages. Always give a retry path. Never show a blank screen. |
| 12 | **Mandatory Field Guarding** | Required fields get a red `*`. Save is blocked until they're filled. |
| 13 | **Optimistic Updates** | After saving, update the screen immediately. Don't reload the whole app. |
| 14 | **Empty States** | Every list shows "Nothing here yet — [action]" instead of blank space. |
| 15 | **Confirmation for Destructive Actions** | Deleting anything shows a confirm dialog explaining what will be lost. |

### 3.3 Paradigm Shifts — What Changes for Users

| Old Way | New Way (What You're Building) |
|---------|-------------------------------|
| "Oh no, an audit" | "Great, fresh eyes on my work" |
| Assessor = enemy | Assessor = coach |
| Certification is one-and-done | Certification is proven daily |
| Only assessors care about assurance | Everyone sees their barrier health |
| Error = dead end | Error = "Try Again" with clear path |

### 3.4 The Gamification Engine — Making Work Like a Game

CONAN uses a 3-layer engagement model adapted from Yu-kai Chou's Octalysis framework:

| Layer | What It Feels Like | When It Activates |
|-------|-------------------|-------------------|
| **Playground** | "I want to explore and see what I can do" | New users, voluntary browsing |
| **Game** | "I want to earn points, badges, and level up" | Structured assessment work |
| **Sport** | "This is who I am as a professional" | Top performers, mastery identity |

**Two ways to earn XP:**

| Track | How You Earn | Example |
|-------|-------------|---------|
| **Conduct Assurance** | Complete an assessment as assessor | +100 XP per assessment |
| **Domain XP** | Perform activities in a process area | +5 XP per control tested |

**Four Maturity Stages:**

```
Stage 0: Compliance → Stage 1: Recognition → Stage 2: Growth → Stage 3: Play
  (baseline)         (points + badges)     (leaderboards)     (full gamification)
```

Start by building Stage 0-1. Stage 2-3 comes later.

### 3.5 The ORCA Mental Model

Every process area follows this chain:

```
Objectives → Risk → Controls → Assurance
```

When building the Process Area detail screen, organize information in this order:
1. **O**bjectives — what we're trying to achieve
2. **R**isk — what could go wrong
3. **C**ontrols — what barriers we have in place
4. **A**ssurance — how we prove the barriers hold

### 3.6 Domain Vocabulary — Speak This Language

| Term | Meaning |
|------|---------|
| **Control Health** | 0-100% score per control. Green (Effective) / Amber (Partial) / Red (Ineffective) / Grey (Never Tested) |
| **MIC** | "Management in Control" — a confidence statement per process area |
| **Finding** | A gap found during assessment. Severity: Low / Medium / High / Serious |
| **Action** | The fix for a finding. Must have closure date + evidence. |
| **Assessment (FLA)** | A frontline assurance check. Status: Planned → InProgress → Completed |
| **PIP** | Process Improvement Plan — Kanban board for improvement ideas |
| **Company** | Tenant. Three exist: SAMS001 (template), SMDS, OGP |

---

## 4. SharePoint Data Model

> **The data is ready.** You need to create these SharePoint Lists and load the data. See [Section 7](#7-data-loading-guide) for loading instructions.

### 4.1 List Inventory

Create these SharePoint Lists. Column types are SharePoint column types.

#### Core Domain Lists

| List Name | Purpose | Key Columns |
|-----------|---------|-------------|
| **Companies** | Tenant registry | Title (Company Name), CompanyCode (single line), ShortName (single line) |
| **Standards** | Standard/regulation catalog | Title (Standard Name), SequenceNumber (number), Company (lookup→Companies) |
| **ProcessAreas** | Process areas within standards | Title (PA Name), Standard (lookup→Standards), Company (lookup→Companies) |
| **Requirements** | Requirements within process areas | Title (Requirement ID), ClauseContent (multiline), ProcessArea (lookup→ProcessAreas), Company (lookup→Companies) |
| **Controls** | Control statements (the barriers) | Title (Control Name), Statement (multiline), ControlType (choice), ProcessArea (lookup→ProcessAreas), HealthScore (number 0-100), Company (lookup→Companies) |
| **MapControl2Requirement** | Which controls satisfy which requirements | Control (lookup→Controls), Requirement (lookup→Requirements) |

#### User & Organization Lists

| List Name | Purpose | Key Columns |
|-----------|---------|-------------|
| **Users** | All system users | Title (Full Name), Username (single line, unique), Email (single line), PreferredName (single line), Role (choice: Admin/Assessor/Interviewee), Company (lookup→Companies), ManagerUsername (single line), Department (single line), Position (single line), OrganisationIndicator (single line), Active (yes/no) |
| **Departments** | Organizational units | Title (Dept Name), ParentDepartment (lookup→Departments, self-ref), Company (lookup→Companies) |
| **UserCompanies** | User↔Company assignments (M:N) | User (lookup→Users), Company (lookup→Companies) |

#### Assessment & Workflow Lists

| List Name | Purpose | Key Columns |
|-----------|---------|-------------|
| **Assessments** | Frontline assurance checks | Title (Assessment Name), Status (choice: Planned/InProgress/Completed/Cancelled), LeadAssessor (lookup→Users), Company (lookup→Companies), LOA (single line), Objective (multiline), Scope (multiline), Sponsor (single line), Methodology (multiline) |
| **ControlAssignments** | Controls being assessed | Assessment (lookup→Assessments), Control (lookup→Controls), Effectiveness (choice: Effective/NotEffective/NotTested) |
| **Samples** | Records tested during assessment | Title (Sample Name), ControlAssignment (lookup→ControlAssignments), Status (choice: Tested/NotTested), Conclusion (choice: Pass/Fail) |
| **Findings** | Gaps identified | Title (Finding ID, e.g. FID-000001), ControlAssignment (lookup→ControlAssignments), Severity (choice: Low/Medium/High/Serious), Description (multiline), IsRepeat (yes/no) |
| **Actions** | Remediation for findings | Title (Action Name), Finding (lookup→Findings), ActionParty (lookup→Users), ClosureDate (date), ClosureEvidence (multiline), ClosureEffective (yes/no), Status (choice: Open/Closed) |

#### Gamification Lists

| List Name | Purpose | Key Columns |
|-----------|---------|-------------|
| **PointTransactions** | Every point earned | User (lookup→Users), Points (number), Reason (single line), SourceEvent (single line), GameAttribute (single line) |
| **GameAttributes** | XP tracks per user per PA | User (lookup→Users), ProcessArea (lookup→ProcessAreas), AttributeName (single line), XP (number), Level (number) |
| **AchievementBadges** | Badge catalog | Title (Badge Name), Description (multiline), Rarity (choice: Common/Uncommon/Rare/Epic/Legendary), PointsRequired (number), BadgeType (choice: Track/Role/Special), ImageURL (hyperlink) |
| **UserAchievements** | Badges earned by users | User (lookup→Users), Badge (lookup→AchievementBadges), EarnedDate (date) |
| **Milestones** | Goal tracking | Title (Milestone Name), TargetValue (number), CurrentValue (number), Type (single line), User (lookup→Users, optional) |

#### Knowledge & Documents Lists

| List Name | Purpose | Key Columns |
|-----------|---------|-------------|
| **KnowledgeBase** | Knowledge articles | Title (Article Name), Content (multiline), ProcessArea (lookup→ProcessAreas), Company (lookup→Companies) |
| **Documents** | Reference documents | Title (Document Title), Summary (multiline), ProcessArea (lookup→ProcessAreas, optional), Company (lookup→Companies), FileURL (hyperlink), Archived (yes/no) |
| **ActivityLog** | Audit trail | User (lookup→Users), Action (single line), EntityType (single line), EntityID (single line), Summary (multiline), Timestamp (date) |
| **BacklogItems** | Kanban backlog | Title (Item Title), Description (multiline), Type (choice: Feature/Bug/Improvement), Priority (choice: High/Medium/Low), Status (choice: Proposed/Approved/InProgress/Completed), Sprint (single line) |

### 4.2 Key Relationships Diagram

```
Companies ──→ Standards ──→ ProcessAreas ──→ Requirements
                 │                │                │
                 │                │                │
                 │                ▼                │ (M:N via MapControl2Requirement)
                 │           Controls ◄────────────┘
                 │                │
                 │                │ (via ControlAssignments)
                 │                ▼
                 │           Assessments ──→ Samples
                 │                │
                 │                ▼
                 │           Findings ──→ Actions
                 │
                 ▼
              Users ──→ PointTransactions
                 │       GameAttributes
                 │       UserAchievements ──→ AchievementBadges
                 │
                 ▼
            Departments
```

### 4.3 Lookup Column Setup

When creating lookup columns in SharePoint:
1. Create the **parent list first** (e.g., create Companies before Standards)
2. Add lookup columns referencing the parent list's **ID** column
3. For M:N relationships (like MapControl2Requirement), use a separate list with two lookup columns
4. Name lookup columns clearly: `Control` not `ControlId`, `ProcessArea` not `PA`

---

## 5. App Screens Overview

### 5.1 Screen Map

Your PowerApps app needs these screens. Build them in this order (matches sprint priority):

```
┌─────────────────────────────────────────────────┐
│                   Login Screen                   │
│          (Username + Password → Role)           │
└─────────────────────┬───────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│  Admin    │  │ Assessor  │  │Interviewee│
│  Dashboard│  │ Dashboard │  │ Dashboard │
└─────┬─────┘  └─────┬─────┘  └─────┬─────┘
      │              │              │
      ▼              ▼              ▼
┌───────────┐  ┌───────────┐  ┌───────────┐
│User Mgmt  │  │Assessment │  │My Interviews│
│Companies  │  │  List     │  │           │
│Standards  │  │           │  │           │
│Backlog    │  │           │  │           │
│Gamification│ │           │  │           │
└───────────┘  └─────┬─────┘  └───────────┘
                     │
                     ▼
              ┌───────────┐
              │Assessment │
              │  Detail   │
              │(Controls, │
              │ Samples,  │
              │ Findings, │
              │ Actions)  │
              └───────────┘

Shared Screens (all roles):
┌───────────┐  ┌───────────┐  ┌───────────┐
│Process    │  │Process    │  │User       │
│Area List  │  │Area Detail│  │Profile    │
│(by Std)   │  │(ORCA tabs)│  │(XP+Badges)│
└───────────┘  └───────────┘  └───────────┘

┌───────────┐
│  Help &   │
│  Demo     │
└───────────┘
```

### 5.2 Screen Descriptions

| Screen | Who Sees It | What It Does |
|--------|-------------|--------------|
| **Login** | Everyone | Username + password. Redirects to role-appropriate dashboard. |
| **Admin Dashboard** | Admin | Navigation hub: Users, Companies, Standards, Backlog, Gamification, Database |
| **Assessor Dashboard** | Assessor | List of assessments (mine + all). Create new assessment button. |
| **Interviewee Dashboard** | Interviewee | My assigned interviews only. Read-only. |
| **Process Area List** | Everyone | Standards as expandable groups → Process Areas as cards with control count + health. |
| **Process Area Detail** | Everyone | Tabbed: Overview (ORCA), Requirements, Controls, Documents. |
| **Assessment Detail** | Assessor | Tabbed: Controls (assign + rate), Samples (record test results), Findings (raise gaps), Actions (track fixes). |
| **New Assessment** | Assessor | Form: select company, process area, activity type, dates, assessors. |
| **User Profile** | Everyone | Gamification dashboard: Total XP, XP per track, badges earned, level. |
| **User Management** | Admin | List all users. Add/edit/activate/deactivate. Filter by company. |
| **Help & Demo** | Everyone | Design philosophy, app guide, leadership demo walkthrough. |

---

## 6. The 8-Sprint Backlog

> **Each sprint = 8 hours of work. Each backlog item = 1 task. Complete them in order — each builds on the previous.**

---

### 🔵 SPRINT 1: Foundation — SharePoint + Data + Login (8 hrs)

**Goal:** Get SharePoint set up, data loaded, and a working login screen. By end of sprint, you can log in and see a blank dashboard.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S1.1** | Create SharePoint site | 0.5h | Create a new SharePoint site for CONAN. Name it "CONAN". Add a document library for file storage. |
| **S1.2** | Create Core Domain lists | 1.5h | Create: Companies, Standards, ProcessAreas, Requirements, Controls, MapControl2Requirement. Set up lookup columns. |
| **S1.3** | Create User & Org lists | 1h | Create: Users, Departments, UserCompanies. Set up lookup columns. Add at least 2 test users (admin/admin + assessor/assessor). |
| **S1.4** | Create Assessment lists | 1h | Create: Assessments, ControlAssignments, Samples, Findings, Actions. Set up cascading lookups (Assessment→ControlAssignment→Sample/Finding). |
| **S1.5** | Create Gamification + Knowledge lists | 1h | Create: PointTransactions, GameAttributes, AchievementBadges, UserAchievements, Milestones, KnowledgeBase, Documents, ActivityLog, BacklogItems. |
| **S1.6** | Load seed data | 1.5h | Load Companies (SAMS001, SMDS, OGP). Load Standards + ProcessAreas + Requirements + Controls from provided CSV files. Use Power Apps "Import from Excel" or Power Automate. |
| **S1.7** | Build Login screen | 1h | Canvas app: username + password text inputs, Login button. On select: LookUp(Users, Username=TextInput1.Text && Password=TextInput2.Text). Store logged-in user in global variable `gblCurrentUser`. Show error "Invalid credentials" on mismatch. |
| **S1.8** | Build role-based navigation shell | 0.5h | After login: If(gblCurrentUser.Role="Admin", Navigate(AdminDashboard), If(gblCurrentUser.Role="Assessor", Navigate(AssessorDashboard), Navigate(IntervieweeDashboard))). Add a top navigation bar with user name + sign out. |

**Sprint 1 Definition of Done:**
- [ ] All 16 SharePoint lists created with correct column types
- [ ] Lookup columns working (test by adding a record manually)
- [ ] Admin user can log in and see Admin Dashboard (blank for now)
- [ ] Assessor user can log in and see Assessor Dashboard (blank for now)

---

### 🟢 SPRINT 2: Core Read — Browse Standards, Process Areas, Controls (8 hrs)

**Goal:** Users can browse the assurance framework. The "read" half of the app. By end of sprint, you can navigate Standards → Process Areas → Controls.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S2.1** | Load full master data | 1h | Load ALL Standards, ProcessAreas, Requirements, and Controls from the provided data export. Verify counts match. Create MapControl2Requirement links. |
| **S2.2** | Build Process Area List screen | 2h | Gallery grouped by Standard. Each Standard is a header, expandable. Each ProcessArea is a card showing: PA name, control count, average health score (color dot). Tapping navigates to PA Detail. Filter: `Filter(ProcessAreas, Company.Value = gblCurrentCompany)` |
| **S2.3** | Build Process Area Detail — Overview tab | 1.5h | Header with PA name + standard + company. ORCA cards: Objectives (text), Risk (text), Controls summary (count + health bar), Assurance summary (last assessment date + MIC statement). Use form/view form connected to ProcessAreas list. |
| **S2.4** | Build Process Area Detail — Requirements tab | 1h | Gallery of Requirements for this PA. Each shows: requirement ID, clause content (truncated). Tapping expands to full text. Filter: `Filter(Requirements, ProcessArea.Value = gblSelectedPA.ID)` |
| **S2.5** | Build Process Area Detail — Controls tab | 1.5h | Gallery of Controls. Each card shows: control name, statement, type badge, health score bar (color: green≥80, amber≥50, red<50, grey=untested). Search box at top. Filter by control type. Sort by health score. |
| **S2.6** | Build Control Detail screen (popup) | 1h | Tapping a control opens a detail panel: full statement, 5W+1H fields, mapped requirements, health history, last assessed date. |

**Sprint 2 Definition of Done:**
- [ ] All master data loaded and verified
- [ ] Process Area List shows all PAs grouped by Standard
- [ ] Process Area Detail shows 3 working tabs (Overview, Requirements, Controls)
- [ ] Control cards show health score with correct color coding

---

### 🟡 SPRINT 3: User Management & Profiles (8 hrs)

**Goal:** Admin can manage users. Everyone can see their own profile with gamification stats. Company isolation works.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S3.1** | Load user data | 1h | Import all users from SMDS_Whosewho.csv into the Users list. Set Role, Company, ManagerUsername, PreferredName, Department, Position. Verify count. |
| **S3.2** | Build User Management screen (Admin) | 2.5h | Gallery of all users. Search box (searches name + username + preferredName). Filter by company, role. Each row shows: preferredName or name, username, role badge, company, active toggle. "+" button opens Add/Edit form. Edit form: name, username, email, preferredName, role dropdown, company dropdown, active toggle. Save button. |
| **S3.3** | Build Company Selector | 0.5h | Dropdown at top of app: "Company: [SAMS001 ▾]". Stores selected company in global variable. Admin sees all companies; others see only their assigned companies. All galleries filter by `gblSelectedCompany`. |
| **S3.4** | Implement Company Isolation | 1h | Go through EVERY gallery/form in the app and add company filter. Verify: log in as SMDS user, confirm you cannot see OGP data. Log in as OGP user, confirm no SMDS data visible. |
| **S3.5** | Build User Profile screen | 2h | Display current user info: name, username, role, company, department, position. Gamification section (use placeholder data for now): Total XP (big number), XP per Process Area (bar chart or list), Badges earned (horizontal gallery), current Level + Stage. "Edit Profile" button for preferredName. |
| **S3.6** | Add Incomplete Profiles section | 1h | On User Management screen, add a section at top: "⚠️ Incomplete Profiles — X users". Shows users missing name, username, email, or role. Tapping takes admin to edit form. |

**Sprint 3 Definition of Done:**
- [ ] All users loaded with correct roles and companies
- [ ] Admin can search, filter, add, edit, and toggle user active status
- [ ] Company selector works — switching companies filters ALL data
- [ ] User Profile shows current user's info with gamification placeholder
- [ ] Incomplete profiles flagged and visible

---

### 🟠 SPRINT 4: Assessment Core — Create & Conduct Assessments (8 hrs)

**Goal:** Assessors can create assessments, assign controls, and start work. This is the core workflow.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S4.1** | Build Assessor Dashboard | 1.5h | Gallery of assessments: title, status badge (color-coded), lead assessor, company, date. Filter tabs: "My Assessments", "All Active", "Completed". "+" button → New Assessment screen. |
| **S4.2** | Build New Assessment form | 2h | Form fields: Assessment Title, Company (dropdown), Process Area (dropdown, filtered by company), Activity Type (dropdown), Lead Assessor (people picker), Additional Assessors (multi-select), Start Date, LOA, Objective (multiline), Scope (multiline), Sponsor, Methodology (multiline). Submit button creates Assessment record + auto-creates 6 template activities (placeholder for now). |
| **S4.3** | Build Assessment Detail — Controls tab | 2h | Gallery of assigned controls. Each row: control name, statement preview, effectiveness dropdown (Not Tested / Effective / Not Effective). "+" button opens control picker (gallery of controls for this PA to add). Remove button (with confirm). Auto-save on dropdown change. |
| **S4.4** | Build Assessment Detail — Info tab | 1h | Read-only view of assessment metadata: title, status, dates, assessors, TOR fields. Edit button for assessor/admin. Status change button: Planned → InProgress → Completed (with confirm). |
| **S4.5** | Build Interviewee Dashboard | 1.5h | For Interviewee role only. Simple list: "My Interviews" — shows assessments where the user is assigned as an interviewee (via activity participants). Read-only. Tapping opens Assessment Detail in read-only mode. |

**Sprint 4 Definition of Done:**
- [ ] Assessor can create a new assessment
- [ ] Controls can be assigned to an assessment and rated (Effective/Not Effective)
- [ ] Assessment status can be changed through the lifecycle
- [ ] Interviewee sees only their assigned interviews

---

### 🔴 SPRINT 5: Findings & Actions — Close the Loop (8 hrs)

**Goal:** When controls fail, assessors raise findings and track actions to closure. This is the "assurance" part.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S5.1** | Build Assessment Detail — Samples tab | 1.5h | Gallery of samples for each assigned control. Each sample: name, status (Tested/NotTested), conclusion (Pass/Fail). "+" to add sample. Select control → enter sample details → save. |
| **S5.2** | Build Assessment Detail — Findings tab | 2h | Gallery of findings. Each card: Finding ID (FID-XXXXXX, auto-generated), severity badge (color: grey=Low, amber=Medium, orange=High, red=Serious), description, control reference, repeat flag. "+" button opens New Finding form: select control → select severity → enter description → set repeat flag. Auto-generate FID-XXXXXX. |
| **S5.3** | Build Finding auto-ID generator | 0.5h | Power Fx: `"FID-" & Text(CountRows(Findings)+1, "000000")`. Run on finding creation. |
| **S5.4** | Build Assessment Detail — Actions tab | 2h | Gallery of actions linked to findings. Each action: title, assigned to (people picker), status (Open/Closed), closure date, closure evidence. "+" opens New Action form tied to a finding. Action party gets an email notification (Power Automate, optional for now). |
| **S5.5** | Build Action closure workflow | 1.5h | On Action detail: closure date picker, closure evidence (multiline), "Mark as Closed" button. Sets status to Closed, records closer + timestamp. ClosureEffective checkbox (reviewed separately by assessor). |
| **S5.6** | Build Control Health Score calculation | 0.5h | When an assessment is marked Complete: for each control, count outstanding findings × severity weight (Low=0, Medium=-5, High=-10, Serious=-15, Repeat=-15). Health = MAX(0, 100 + sum of deductions). Update Control.HealthScore. |

**Sprint 5 Definition of Done:**
- [ ] Samples can be recorded against controls with Pass/Fail
- [ ] Findings are created with auto-generated FID-XXXXXX
- [ ] Actions are created, assigned, and can be closed with evidence
- [ ] Control health scores update when assessments are completed

---

### 🟣 SPRINT 6: Gamification — Points, Badges, Leaderboards (8 hrs)

**Goal:** The fun part. Users earn XP, unlock badges, and see their progress. This is what makes CONAN different.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S6.1** | Create Gamification Engine (Power Automate) | 1.5h | Flow triggered when Assessment.Status changes to "Completed". Creates PointTransaction: +100 XP to LeadAssessor for "assessment_complete". Creates PointTransaction: +5 XP per control tested for each assessor. |
| **S6.2** | Build XP award for finding creation | 1h | Flow triggered when Finding is created. +10 XP to the assessor for "finding_raised" (findings are gold!). |
| **S6.3** | Build XP award for action closure | 1h | Flow triggered when Action.Status changes to "Closed" AND ClosureEffective=Yes. +20 XP to the action party for "action_closed_effective". +5 XP to the assessor for "coaching_effective". |
| **S6.4** | Build GameAttribute tracker | 0.5h | Flow that maintains GameAttributes list: for each (User, ProcessArea) pair, sum PointTransactions → total XP, calculate level (Level = Floor(XP/50) + 1). |
| **S6.5** | Build Badge Engine (Power Automate) | 1.5h | Flow triggered on PointTransaction created. Checks badge criteria: "First Assessment" (1+ assessment completed), "Finding Finder" (5+ findings raised), "Action Hero" (10+ actions closed), "Centurion" (100+ total XP), "Master" (500+ total XP). Awards badge if criteria met and not already earned. |
| **S6.6** | Build User Profile gamification (real data) | 1.5h | Replace Sprint 3 placeholders with real data: Total XP (Sum of PointTransactions), XP per ProcessArea (grouped GameAttributes), Badges earned (UserAchievements gallery with badge images), Level + Stage. |
| **S6.7** | Build Leaderboard screen | 1h | Gallery of top 20 users by total XP. Shows: rank (#), name, total XP, level, top badge. Filter by company. "My Rank" card at top showing current user's position. |

**Sprint 6 Definition of Done:**
- [ ] Completing an assessment awards XP to assessors
- [ ] Raising findings and closing actions awards XP
- [ ] Badges are automatically awarded when criteria are met
- [ ] User Profile shows real gamification data
- [ ] Leaderboard shows top performers by company

---

### ⚫ SPRINT 7: Knowledge Base & Documents (8 hrs)

**Goal:** Users can find procedures, policies, and reference documents. The knowledge layer.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S7.1** | Build Knowledge Base list screen | 2h | Gallery of knowledge articles. Search box (searches title + content). Filter by ProcessArea, Company. Each card: title, process area tag, content preview (first 100 chars). Tapping opens full article. |
| **S7.2** | Build Knowledge Base detail/edit screen | 1.5h | Full article view: title, process area, company, full content (rich text). Edit button for admin. Admin can add/edit/delete articles. |
| **S7.3** | Build Documents tab on Process Area Detail | 1.5h | Gallery of documents linked to the PA. Each: document title, summary, file link (opens in new tab). Upload button (for admin/assessor): file picker → upload to SharePoint document library → create Documents list entry. "Shared with all companies" checkbox for SAMS001 docs. |
| **S7.4** | Build Help & Demo screen | 2h | Help screen with sections: (1) "What is CONAN?" — mission statement, (2) "Design Philosophy" — the 15 principles + paradigm shifts, (3) "How to Use This App" — role-based quick guides, (4) "Leadership Demo" — narrative walkthrough for executives. Use text labels, not hardcoded images. |
| **S7.5** | Build Admin Dashboard navigation | 1h | Admin Dashboard with cards/buttons: User Management, Company Management, Standards & PAs, Backlog, Gamification Config (badges), Knowledge Base, Database (import/export), Help. Each card navigates to the relevant screen. |

**Sprint 7 Definition of Done:**
- [ ] Knowledge articles are searchable and filterable
- [ ] Documents can be uploaded and linked to Process Areas
- [ ] Help screen explains the app and design philosophy
- [ ] Admin Dashboard provides clear navigation to all admin functions

---

### ⚪ SPRINT 8: Polish, Admin Tools & Deploy (8 hrs)

**Goal:** Beautiful UI, admin configuration tools, testing, and deployment. The final coat of paint.

| ID | Task | Est. | Description |
|----|------|------|-------------|
| **S8.1** | UI Polish pass | 2h | Consistent colors (blue primary, slate background, white cards). Status colors: green (good), amber (warning), red (bad), grey (neutral). Card shadows, rounded corners. Consistent padding (16px). Loading spinners on all galleries. Empty state messages everywhere: "No items yet — [action]". |
| **S8.2** | Build Admin — Standards & PA management | 1h | Admin screens: Add/Edit Standard, Add/Edit ProcessArea, Add/Edit Control. Simple forms connected to SharePoint lists. Delete with confirm dialog. |
| **S8.3** | Build Admin — Badge management | 1h | Gallery of AchievementBadges. Add/Edit form: badge name, description, rarity, points required, badge type, image URL. Preview of badge card. |
| **S8.4** | Build Admin — Backlog Kanban | 1.5h | Kanban board with columns: Proposed, Approved, InProgress, Completed. Cards are draggable between columns (or use buttons: Move→). "+" adds new item: title, description, type, priority. Color-code by priority. |
| **S8.5** | Build Admin — Database tools | 1h | Import screen: file picker for CSV → Power Automate flow to parse and load into SharePoint lists. Export screen: Power Automate flow to export list data to CSV. Activity Log viewer (last 100 entries). |
| **S8.6** | Full test pass + bug fixes | 1h | Test as Admin: create assessment, assign controls, record samples, raise finding, create action, close action. Test as Assessor: same workflow. Test as Interviewee: view interviews. Test company isolation: switch companies, verify no cross-company data leakage. Fix all bugs found. |
| **S8.7** | Deploy and handover | 0.5h | Publish PowerApps app. Share with test users. Create app user guide (1-pager). Document known limitations. Celebrate! 🎉 |

**Sprint 8 Definition of Done:**
- [ ] UI is consistent and polished across all screens
- [ ] Admin can manage standards, PAs, controls, and badges
- [ ] Kanban backlog works with drag/button movement
- [ ] Data import/export tools work
- [ ] Full test pass completed with zero critical bugs
- [ ] App published and shared with users

---

## 7. Data Loading Guide

### 7.1 Source Data Location

All master data is exported and ready at:
```
C:\Users\edwar\OneDrive\Documents\01 AI\02 Gamified Plant\data\exports\
```

### 7.2 Loading Method

**Option A: Power Apps Import from Excel (Recommended for juniors)**

1. Open each CSV file in Excel
2. Format as Table (Ctrl+T)
3. In SharePoint List → "Edit in grid view" → paste from Excel
4. For lookup columns: use the SharePoint ID of the parent record

**Option B: Power Automate Flow**

1. Create a flow: "When a file is created" (in a SharePoint document library)
2. "Parse CSV" → "Create item in SharePoint list" for each row
3. For lookup columns: use "Get items" to find the parent record ID

### 7.3 Loading Order (IMPORTANT!)

Load in this exact order — parent lists before child lists:

```
1. Companies        (3 records: SAMS001, SMDS, OGP)
2. Users            (500+ records from SMDS_Whosewho.csv)
3. Departments      (from user department data)
4. Standards        (3 standards)
5. ProcessAreas     (50+ PAs)
6. Requirements     (500+ requirements)
7. Controls         (1000+ controls)
8. MapControl2Requirement  (mapping links)
9. KnowledgeBase    (reference articles)
10. AchievementBadges (badge catalog)
```

### 7.4 Verification Queries

After loading each list, verify with these Power Fx checks:

```powerapps
// Count records
CountRows(Companies)     // Should be 3
CountRows(Users)         // Should be 500+
CountRows(ProcessAreas)  // Should be 50+
CountRows(Controls)      // Should be 1000+

// Check company isolation
Filter(ProcessAreas, Company.Value = "SMDS")  // Should return only SMDS PAs
Filter(ProcessAreas, Company.Value = "OGP")   // Should return only OGP PAs

// Check lookup relationships
LookUp(ProcessAreas, Title = "HSSEQ Management").Standard.Value  // Should return standard name
```

---

## 8. Development Guidelines

### 8.1 Power Fx Patterns to Use

```powerapps
// ✅ GOOD: Filter with company isolation
Filter(Controls, ProcessArea.Value = gblSelectedPA.ID && Company.Value = gblSelectedCompany)

// ✅ GOOD: Search across multiple fields
Search(Users, TextInput1.Text, "name", "username", "preferredName")

// ✅ GOOD: Color-coded health
If(ThisItem.HealthScore >= 80, Color.Green,
   ThisItem.HealthScore >= 50, Color.Orange,
   ThisItem.HealthScore > 0, Color.Red,
   Color.Gray)  // Never tested

// ✅ GOOD: Status badges
If(ThisItem.Status = "Completed", Color.Green,
   ThisItem.Status = "InProgress", Color.Orange,
   ThisItem.Status = "Planned", Color.Blue,
   Color.Gray)

// ✅ GOOD: Empty state
If(CountRows(FilteredGallery.Items) = 0,
   "No items found. Try a different filter or create a new one.",
   FilteredGallery.Items)

// ✅ GOOD: Confirmation before delete
If(Confirm("Delete this control? This cannot be undone."),
   Remove(Controls, ThisItem); Refresh(Controls))
```

### 8.2 Common Mistakes to Avoid

| ❌ Don't | ✅ Do |
|----------|------|
| Hardcode company names as text | Use `gblSelectedCompany` global variable |
| Forget company filter on any gallery | Every gallery must have `Company.Value = gblSelectedCompany` |
| Show raw SharePoint errors to users | Wrap in `IfError()` with friendly message |
| Use `Navigate()` without checking login state | Check `gblCurrentUser` is set on every screen's `OnVisible` |
| Create lookup columns pointing to wrong list | Double-check parent list name before creating lookup |
| Skip empty states | Every gallery should handle 0 items elegantly |

### 8.3 Power Apps Performance Tips

1. **Delegate queries when possible** — Use `Filter()` and `Search()` (delegable) instead of `LookUp()` in loops (non-delegable)
2. **Limit gallery items** — Use `FirstN(Filter(...), 100)` for large lists
3. **Load data with collections** — `ClearCollect(colUsers, Users)` on App.OnStart for frequently accessed lookup data
4. **Avoid too many controls on one screen** — If a screen has 50+ controls, split into tabs or separate screens
5. **Use concurrent loading** — `Concurrent(Collect(colCompanies, Companies), Collect(colStandards, Standards))`

### 8.4 Naming Conventions

| Prefix | For | Example |
|--------|-----|---------|
| `gbl` | Global variables | `gblCurrentUser`, `gblSelectedCompany` |
| `col` | Collections | `colUsers`, `colStandards` |
| `loc` | Local/context variables | `locSelectedPA`, `locFilterText` |
| `txt` | Text inputs | `txtSearch`, `txtUsername` |
| `dd` | Dropdowns | `ddCompany`, `ddRole` |
| `gal` | Galleries | `galProcessAreas`, `galControls` |
| `btn` | Buttons | `btnSave`, `btnDelete` |
| `lbl` | Labels | `lblTitle`, `lblHealthScore` |

---

## 9. Appendix: Reference Screenshots

> The reference CONAN app (Next.js version) is deployed at: `https://sams-app-sams.up.railway.app`
> Login: `admin` / `PaaP6ggFHqsr`

### Key Screens to Reference

| Screen | URL | What to Look At |
|--------|-----|-----------------|
| Process Area List | `/setup/process-areas` | Collapsible standards, PA cards with health dots |
| Process Area Detail | `/setup/processdetails/[id]` | ORCA overview, tabbed layout, control health bars |
| Assessment Dashboard | `/fla` | Assessment cards, status badges, create button |
| Assessment Detail | `/fla/[id]` | Controls tab, effectiveness dropdowns, findings |
| User Profile | `/profile` | XP display, badges gallery, competency tracks |
| Admin Dashboard | `/admin` | Tab navigation, user management, backlog kanban |
| Help & Demo | `/help?topic=demo` | Leadership narrative, design philosophy |

### Demo Credentials
- **URL:** `https://sams-app-sams.up.railway.app`
- **Username:** `admin`
- **Password:** `PaaP6ggFHqsr`

---

## 🏁 Quest Complete Checklist

When all 8 sprints are done, you should be able to:

- [ ] Log in as Admin, Assessor, and Interviewee with different experiences
- [ ] Browse Standards → Process Areas → Requirements → Controls
- [ ] See control health scores (green/amber/red/grey)
- [ ] Create an assessment, assign controls, record samples
- [ ] Raise findings with auto-generated FID-XXXXXX
- [ ] Create and close actions with evidence
- [ ] See XP and badges update on User Profile after completing work
- [ ] View leaderboard ranked by total XP
- [ ] Search and read knowledge articles
- [ ] Upload documents linked to process areas
- [ ] Switch between companies and see only that company's data
- [ ] Admin can manage users, standards, PAs, controls, badges
- [ ] Help screen explains the design philosophy

---

> **"Build a playground. Make work so integrated with growth that nobody is 'working' in the conventional sense."**
> — CONAN Design Philosophy

**Good luck, team. Go build something awesome.** 🚀
