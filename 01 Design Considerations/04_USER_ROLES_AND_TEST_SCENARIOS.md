# SAMS App — User Roles & Test Scenarios

**Source:** Production database analysis (July 21, 2026)  
**Purpose:** Define test scenarios for each user persona to validate UI/UX design

---

## 1. Role Definitions

### 1.1 System Roles (from `User.role` enum)

| Role | Value | Description |
|------|-------|-------------|
| **Admin** | `Admin` | Full system access. Can manage all companies, users, master data, database. |
| **Assessor** | `Assessor` | Field testing role. Can create assessments, collect evidence, record findings. |

### 1.2 Functional Roles (derived from UserCompany mappings)

| Functional Role | Description | Example Users |
|-----------------|-------------|---------------|
| **System Administrator** | Access to all 3 companies + SAMS001 template | `admin` |
| **Multi-Company Admin** | Access to 2+ companies, can switch between them | `edward`, `jonathan`, `rhanif`, `shahsha` |
| **Single-Company Admin** | Access to 1 company only | `aisyah` |
| **Multi-Company Assessor** | Access to 2+ companies for field work | `regina` |
| **Single-Company Assessor** | Access to 1 company only | `denry`, `megan`, `paul`, `presca`, `tecklee` |

---

## 2. User Directory (Production Data)

### 2.1 Admin Users (6)

| Username | Name | Role | Position | Company Access | Points | Notes |
|----------|------|------|----------|---------------|--------|-------|
| `admin` | — | Admin | — | SAMS001, SMDS, OGP | 36 | System administrator |
| `aisyah` | — | Admin | — | SMDS | 0 | SMDS company admin |
| `edward` | — | Admin | — | SAMS001, SMDS, OGP | 10 | Multi-company admin |
| `jonathan` | — | Admin | — | SAMS001, SMDS | 0 | Multi-company admin |
| `rhanif` | — | Admin | — | SAMS001, SMDS | 0 | Multi-company admin |
| `shahsha` | — | Admin | — | SAMS001, OGP | 0 | Multi-company admin |

### 2.2 Assessor Users (6)

| Username | Name | Role | Position | Company Access | Points | Notes |
|----------|------|------|----------|---------------|--------|-------|
| `denry` | — | Assessor | — | OGP | 0 | OGP field assessor |
| `megan` | — | Assessor | — | SMDS | 0 | SMDS field assessor |
| `paul` | — | Assessor | — | SMDS | 0 | SMDS field assessor |
| `presca` | — | Assessor | — | SMDS | 0 | SMDS field assessor |
| `regina` | — | Assessor | — | SAMS001, SMDS | 10 | Senior assessor |
| `tecklee` | — | Assessor | — | SMDS | 0 | SMDS field assessor |

### 2.3 Companies (3)

| CompanyID | CompanyName | ShortName | Type |
|-----------|-------------|-----------|------|
| SAMS001 | SAMS | SAMS | Template company (master blueprint) |
| SMDS | Shell Middle Distillate Synthesis | SMDS | Production company |
| OGP | Oil & Gas Pipeline | OGP | Production company |

---

## 3. UI Behavior by User Type

### 3.1 Navigation Visibility

| UI Element | System Admin | Multi-Company Admin | Single-Company Admin | Multi-Company Assessor | Single-Company Assessor |
|------------|-------------|---------------------|---------------------|----------------------|----------------------|
| Company Selector | ✅ Visible | ✅ Visible | ❌ Hidden | ✅ Visible | ❌ Hidden |
| SAMS001 in Selector | ✅ | ✅ | ❌ | ❌ | ❌ |
| Admin Navbar Link | ✅ | ✅ | ✅ | ❌ | ❌ |
| Dashboard Link | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assessments Link | ✅ | ✅ | ✅ | ✅ | ✅ |
| Process Areas Link | ✅ | ✅ | ✅ | ✅ | ✅ |
| Controls Link | ✅ | ✅ | ✅ | ✅ | ✅ |
| Knowledgebase Link | ✅ | ✅ | ✅ | ✅ | ✅ |
| Help Link | ✅ | ✅ | ✅ | ✅ | ✅ |

### 3.2 Landing Pages

| User Type | Default Landing Page | Rationale |
|-----------|---------------------|-----------|
| System Admin | `/admin` | System overview, quick actions |
| Multi-Company Admin | `/admin` | Company management, templates |
| Single-Company Admin | `/admin` | Company-specific admin tasks |
| Multi-Company Assessor | `/fla` | Process health, gamification |
| Single-Company Assessor | `/fla` | Process health, gamification |

### 3.3 Data Visibility

| Data Type | Admin | Assessor |
|-----------|-------|----------|
| Own company data | ✅ | ✅ |
| Other company data | ✅ (via selector) | ❌ |
| SAMS001 template | ✅ | ❌ |
| User management | ✅ | ❌ |
| Database backup/restore | ✅ | ❌ |
| Requirements editor | ✅ | ❌ |
| Badge management | ✅ | ❌ |
| Template management | ✅ | ❌ |
| Assessment creation | ✅ | ✅ |
| Assessment editing (own) | ✅ | ✅ |
| Assessment editing (others) | ✅ | ❌ |
| Knowledgebase upload | ✅ | ❌ |
| Knowledgebase view | ✅ | ✅ |
| AI Chat | ✅ | ✅ |

---

## 4. Test Scenarios

### 4.1 System Administrator (`admin`)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|---------------|
| A1 | Login and view all companies | 1. Login as admin<br>2. Check navbar<br>3. Click company selector | Company selector shows SAMS001, SMDS, OGP. Admin link visible. |
| A2 | Switch between companies | 1. Login as admin<br>2. Select SMDS from selector<br>3. Navigate to Process Areas<br>4. Select OGP from selector | Data filters to selected company. Process Areas show company-specific data. |
| A3 | Access SAMS001 template | 1. Login as admin<br>2. Select SAMS001 from selector<br>3. Navigate to Requirements | SAMS001 data visible. Requirements show template master data. |
| A4 | Manage users | 1. Login as admin<br>2. Go to Admin → Users<br>3. Add new user<br>4. Assign to company | User created. UserCompany record created. User appears in list. |
| A5 | Adopt templates | 1. Login as admin<br>2. Select SMDS<br>3. Go to Admin → Templates<br>4. Click Adopt Templates | SMDS receives SAMS001 controls, requirements, process areas. |
| A6 | Database backup | 1. Login as admin<br>2. Go to Admin → Database<br>3. Click Download Backup | .sql file downloads with full database dump. |
| A7 | Edit requirement | 1. Login as admin<br>2. Go to Admin → Requirements<br>3. Expand a requirement<br>4. Edit clause content<br>5. Save | Requirement updated in database. Change reflected in UI. |
| A8 | View activity log | 1. Login as admin<br>2. Go to Admin → Activity Log<br>3. Filter by MappingChanged | Mapping activity entries visible with before/after data. |

### 4.2 Multi-Company Admin (`edward`)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|---------------|
| B1 | Switch companies | 1. Login as edward<br>2. Select SMDS from selector<br>3. View Process Areas | SMDS data displayed. SAMS001 not visible in selector (or visible if admin). |
| B2 | Cross-company comparison | 1. Login as edward<br>2. Select SAMS001<br>3. Note control count<br>4. Select SMDS<br>5. Note control count | Can compare data between companies. Counts match (1,048 each). |
| B3 | Template propagation | 1. Login as edward<br>2. Select SMDS<br>3. Go to Admin → Templates<br>4. Adopt templates | SMDS updated with latest SAMS001 data. |

### 4.3 Single-Company Admin (`aisyah`)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|---------------|
| C1 | No company selector | 1. Login as aisyah<br>2. Check navbar | Company selector hidden. SMDS data auto-selected. |
| C2 | Manage SMDS only | 1. Login as aisyah<br>2. Go to Admin → Users<br>3. Add user | User created with SMDS company assignment. |
| C3 | Cannot access SAMS001 | 1. Login as aisyah<br>2. Check company selector | SAMS001 not available (hidden or not present). |

### 4.4 Multi-Company Assessor (`regina`)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|---------------|
| D1 | Switch companies for assessment | 1. Login as regina<br>2. Select SMDS from selector<br>3. Create assessment<br>4. Select SAMS001<br>5. View assessments | Assessment created in SMDS. SAMS001 shows different assessment list. |
| D2 | Use knowledgebase across companies | 1. Login as regina<br>2. Select SMDS<br>3. Go to Knowledgebase<br>4. Search document | SMDS knowledgebase documents visible. SAMS001 documents not visible. |

### 4.5 Single-Company Assessor (`megan`)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|---------------|
| E1 | No company selector clutter | 1. Login as megan<br>2. Check navbar | Company selector hidden. SMDS data auto-selected. |
| E2 | Create assessment | 1. Login as megan<br>2. Go to Dashboard<br>3. Click + New Assessment<br>4. Select controls<br>5. Create | Assessment created. Redirected to assessment detail. |
| E3 | Record finding | 1. Login as megan<br>2. Open assessment<br>3. Go to Findings tab<br>4. Click + New Finding<br>5. Fill form<br>6. Save | Finding created. Action can be assigned. |
| E4 | Upload evidence | 1. Login as megan<br>2. Open assessment<br>3. Go to Samples tab<br>4. Select sample<br>5. Attach file | File uploaded. Linked to sample. |
| E5 | Use AI chat | 1. Login as megan<br>2. Go to Process Area<br>3. Click Knowledgebase tab<br>4. Type question in chat<br>5. Submit | AI responds with relevant knowledgebase content. |
| E6 | View gamification | 1. Login as megan<br>2. Go to Dashboard<br>3. Check sidebar | Points, streak, badges, leaderboard visible. |

### 4.6 Field Assessor Tablet Scenario (`paul`)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|---------------|
| F1 | Tablet dashboard | 1. Login as paul on tablet<br>2. View dashboard | Large touch targets. Collapsible sections. Bottom tab bar. |
| F2 | Mobile sample entry | 1. Login as paul on tablet<br>2. Open assessment<br>3. Go to Samples tab<br>4. Tap status button | Large status buttons (Tested/Not Tested). Easy one-handed operation. |
| F3 | Camera capture | 1. Login as paul on tablet<br>2. Open sample<br>3. Tap 📷 Take Photo | Camera opens. Photo attaches to sample. |
| F4 | Offline awareness | 1. Login as paul on tablet<br>2. Disable network<br>3. Attempt to save | Offline indicator appears. Data queued for sync. |

---

## 5. Edge Cases

| # | Edge Case | Users Affected | Handling |
|---|-----------|---------------|----------|
| EC1 | User with 0 companies | New user (no UserCompany records) | Show "Contact admin for access" message. Redirect to login. |
| EC2 | User with 1 company | `aisyah`, `denry`, `megan`, `paul`, `presca`, `tecklee` | Hide company selector. Auto-select company. |
| EC3 | User with 3+ companies | `admin`, `edward` | Show all companies in selector. SAMS001 visible for admins. |
| EC4 | SAMS001 template access | All assessors | SAMS001 hidden from selector. Direct URL blocked by middleware. |
| EC5 | Cross-company data leak | Any user | All queries filtered by `companyId`. API returns 403 for wrong company. |
| EC6 | Session expiry during assessment | Any user | Auto-save draft. Redirect to login with return URL. |
| EC7 | Concurrent edits | Multiple users on same assessment | Last-write-wins. Activity log tracks all changes. |
| EC8 | Deleted company data | Admin deletes company | Cascade delete or block with foreign key constraint. |

---

## 6. Accessibility Test Scenarios

| # | Scenario | Test Method | Expected Result |
|---|----------|------------|---------------|
| AC1 | Keyboard-only navigation | Tab through all interactive elements | All elements reachable. Focus indicators visible. |
| AC2 | Screen reader | Use NVDA/JAWS to navigate dashboard | All content announced. ARIA labels present. |
| AC3 | High contrast mode | Enable Windows High Contrast | All text readable. Icons visible. |
| AC4 | Color blindness | Use Color Oracle simulator | Health indicators distinguishable without color. |
| AC5 | Reduced motion | Enable prefers-reduced-motion | Animations disabled or reduced. |
| AC6 | Font scaling | Set browser font to 200% | Layout doesn't break. Text readable. |

---

## 7. Performance Test Scenarios

| # | Scenario | Metric | Target |
|---|----------|--------|--------|
| P1 | Dashboard load time | Time to interactive | < 2 seconds |
| P2 | Process Areas page with 65 PAs | Scroll performance | 60fps, no jank |
| P3 | Requirements table with 933 rows | Render time | < 1 second |
| P4 | Assessment detail with 50 samples | Tab switch time | < 500ms |
| P5 | Knowledgebase search | Search response | < 300ms |
| P6 | Database backup (45 tables) | Download time | < 30 seconds |

---

## 8. Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-07-21 | Initial user roles and test scenarios. 12 production users analyzed, 4 functional roles defined, 30+ test scenarios across all personas, edge cases, accessibility and performance tests. |
