# SAMS App — UI Wireframes & Component Specifications

**Status:** Design Phase — No Code Yet  
**Target:** Role-based, mobile-aware, accessible user interface  
**Reference:** `Kimi_APP_DESIGN.md` (design philosophy), `01_DESIGN_CONTEXT.md` (personas & navigation)

---

## 1. Design System

### 1.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#1e40af` | Primary actions, links, active states |
| `--color-primary-hover` | `#1e3a8a` | Primary button hover |
| `--color-success` | `#059669` | Success messages, healthy status, effective controls |
| `--color-warning` | `#d97706` | Warnings, tolerable status, unmapped controls |
| `--color-danger` | `#dc2626` | Errors, not tolerable status, delete actions |
| `--color-info` | `#2563eb` | Information, badges, links |
| `--color-bg` | `#f8fafc` | Page background |
| `--color-surface` | `#ffffff` | Card background |
| `--color-border` | `#e2e8f0` | Borders, dividers |
| `--color-text` | `#0f172a` | Primary text |
| `--color-text-secondary` | `#64748b` | Secondary text, placeholders |
| `--color-text-muted` | `#94a3b8` | Muted text, disabled |

### 1.2 Typography

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `--text-xs` | 0.75rem | 400 | Captions, labels, badges |
| `--text-sm` | 0.875rem | 400 | Body text, table cells |
| `--text-base` | 1rem | 400 | Default body |
| `--text-lg` | 1.125rem | 500 | Card titles, section headers |
| `--text-xl` | 1.25rem | 600 | Page titles |
| `--text-2xl` | 1.5rem | 700 | Major headings |
| `--text-3xl` | 1.875rem | 700 | Hero text |

### 1.3 Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 0.25rem | Tight gaps |
| `--space-sm` | 0.5rem | Component padding |
| `--space-md` | 1rem | Card padding, section gaps |
| `--space-lg` | 1.5rem | Page sections |
| `--space-xl` | 2rem | Major sections |
| `--space-2xl` | 3rem | Page margins |

### 1.4 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 0.25rem | Small elements |
| `--radius-md` | 0.375rem | Buttons, inputs |
| `--radius-lg` | 0.5rem | Cards, modals |
| `--radius-xl` | 0.75rem | Large cards |
| `--radius-full` | 9999px | Pills, badges |

### 1.5 Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1)` | Cards, dropdowns |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | Modals, popovers |

---

## 2. Component Library

### 2.1 Core Components (to build)

#### Button
```typescript
interface ButtonProps {
  variant: "primary" | "secondary" | "success" | "warning" | "danger" | "ghost";
  size: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}
```

**Variants:**
- `primary`: Blue background, white text
- `secondary`: White background, gray border, gray text
- `success`: Green background, white text
- `warning`: Amber background, white text
- `danger`: Red background, white text
- `ghost`: Transparent background, colored text

#### Card
```typescript
interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padding?: "sm" | "md" | "lg";
  shadow?: "none" | "sm" | "md" | "lg";
}
```

#### Badge
```typescript
interface BadgeProps {
  variant: "default" | "success" | "warning" | "danger" | "info";
  size: "sm" | "md";
  children: React.ReactNode;
}
```

#### Input
```typescript
interface InputProps {
  type: "text" | "email" | "password" | "number" | "date" | "search";
  label?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}
```

#### Select
```typescript
interface SelectProps {
  label?: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}
```

#### Modal
```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
}
```

#### Table
```typescript
interface TableProps<T> {
  columns: Array<{
    key: string;
    header: string;
    render?: (row: T) => React.ReactNode;
    sortable?: boolean;
    width?: string;
  }>;
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  pagination?: {
    page: number;
    perPage: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}
```

#### HealthIndicator
```typescript
interface HealthIndicatorProps {
  score: number; // 0-100
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}
```

**Visual:**
- 🟢 Green circle + "85% Healthy" (score > 80)
- 🟡 Amber circle + "62% Tolerable" (score 50-80)
- 🔴 Red circle + "30% Not Tolerable" (score < 50)

#### StatusBadge
```typescript
interface StatusBadgeProps {
  status: string;
  variantMap?: Record<string, "success" | "warning" | "danger" | "info" | "default">;
}
```

**Default mappings:**
- Planned: default
- InProgress: info
- Completed: success
- Cancelled: danger
- Effective: success
- NotEffective: danger
- NotTested: default
- Tested: info

---

### 2.2 Domain Components (to extract/build)

#### ProcessAreaCard
```typescript
interface ProcessAreaCardProps {
  processArea: {
    id: string;
    name: string;
    description?: string;
    standard?: string;
    _count: { controls: number; subProcesses: number };
  };
  requirements: Array<{
    rId: number;
    requirementId: string;
    clauseContent: string;
    controls: Array<{ id: string; name: string; effective?: string }>;
  }>;
  expanded?: boolean;
  onToggle?: () => void;
}
```

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Air Quality                    Carbon, Environment  6 req │
│   1.01 Air Quality                                        │
│   ├─ 🟢 Air Quality - 1 (1 control)    85% Healthy        │
│   ├─ 🟡 Air Quality - 2 (1 control)    62% Tolerable      │
│   ├─ 🔴 Air Quality - 3 (1 control)    30% Not Tolerable  │
│   ├─ ⚪ Air Quality - 4 (0 controls)   —                   │
│   ├─ ⚪ Air Quality - 5 (0 controls)   —                   │
│   └─ 📋 Unmapped Controls (4)          —                   │
└─────────────────────────────────────────────────────────────┘
```

#### RequirementCard
```typescript
interface RequirementCardProps {
  requirement: {
    rId: number;
    requirementId: string;
    clauseContent: string;
    controls: ControlSummary[];
  };
  expanded?: boolean;
  onToggle?: () => void;
  onDropControl?: (controlId: string, targetReqId: number) => void;
  onAddControl?: (reqId: number) => void;
  onEditControl?: (control: ControlSummary) => void;
  onUnassignControl?: (control: ControlSummary) => void;
}
```

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Air Quality - 1 (1)                    🟢 85% Healthy    │
│   Sources with Volatile Organic Compound (VOC) emissions... │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ ⋮⋮ │ Control Name          │ Type    │ Health │ ... │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │ ⋮⋮ │ Conduct Air Dispersion│ Procedural│ 🟢 85%│ ... │   │
│   └─────────────────────────────────────────────────────┘   │
│   [+ Add Control]                                           │
└─────────────────────────────────────────────────────────────┘
```

#### MappingPanel
```typescript
interface MappingPanelProps {
  unmappedControls: ControlSummary[];
  requirements: Array<{
    rId: number;
    requirementId: string;
    clauseContent: string;
    controls: ControlSummary[];
  }>;
  onAssign: (controlIds: string[], targetReqId: number) => void;
  onClose: () => void;
}
```

**Visual:**
```
┌──────────────────────────┬──────────────────────────────────┐
│  📋 Unmapped Controls (4)│  Requirements                    │
│  [Filter controls...]    │  ┌────────────────────────────┐  │
│  ┌─────────────────────┐ │  │ Air Quality - 1 (1)       │  │
│  │ ☑ Control A         │ │  │ Sources with VOC...       │  │
│  │ ☐ Control B         │ │  │                    [Assign]│  │
│  │ ☑ Control C         │ │  └────────────────────────────┘  │
│  │ ☐ Control D         │ │  ┌────────────────────────────┐  │
│  │                     │ │  │ Air Quality - 2 (1)       │  │
│  │ [Select All] [Clear]│ │  │ A Facility with VOC...    │  │
│  └─────────────────────┘ │  │                    [Assign]│  │
│  2 selected              │  └────────────────────────────┘  │
│  [→ Assign to Req ▾]    │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

#### AssessmentCard
```typescript
interface AssessmentCardProps {
  assessment: {
    id: string;
    name: string;
    status: string;
    startDate: Date;
    endDate?: Date;
    activityType: { name: string };
    assessor: { name: string };
    _count: { samples: number; findings: number; actions: number };
  };
  onClick?: () => void;
}
```

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│ Q3 Air Quality Assessment          [InProgress]             │
│ Started: Jul 15, 2026 | Assessor: Megan                     │
│ 8 controls | 12 samples | 3 findings | 5 actions            │
│ [Continue →]                                                │
└─────────────────────────────────────────────────────────────┘
```

#### FindingCard
```typescript
interface FindingCardProps {
  finding: {
    id: string;
    description: string;
    severity: string;
    risks?: string;
    actions: Array<{
      id: string;
      actionDescription: string;
      actionParty?: string;
      targetDate?: Date;
      actionClosureEffective: boolean;
    }>;
  };
  onEdit?: () => void;
  onAddAction?: () => void;
}
```

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 High | VOC emissions exceed threshold                    │
│ Risk: Regulatory non-compliance, environmental impact        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Actions:                                                │ │
│ │ ☑ Install VOC monitoring system | John | Jul 30        │ │
│ │ ☐ Conduct root cause analysis   | Sarah | Aug 15       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [Edit Finding] [+ Add Action]                               │
└─────────────────────────────────────────────────────────────┘
```

#### GamificationPanel
```typescript
interface GamificationPanelProps {
  user: {
    totalPoints: number;
    dailyPointStreak: number;
    achievements: Array<{ badge: { name: string; rarity: string } }>;
  };
  leaderboard: Array<{
    username: string;
    totalPoints: number;
    rank: number;
  }>;
  nextBadge?: {
    name: string;
    progress: number;
    target: number;
  };
}
```

**Visual:**
```
┌─────────────────────────┐
│  🏆 Gamification        │
│  ─────────────────────  │
│  Points: 36             │
│  Streak: 5 days 🔥      │
│  ─────────────────────  │
│  Recent Badges:         │
│  🥇 First Assessment    │
│  🥈 10 Controls Tested  │
│  ─────────────────────  │
│  Next Badge:            │
│  Assessment Master      │
│  ████████░░ 8/10        │
│  ─────────────────────  │
│  Leaderboard:           │
│  1. admin    36 pts     │
│  2. edward   10 pts     │
│  3. regina   10 pts     │
│  ─────────────────────  │
│  Your rank: #2          │
└─────────────────────────┘
```

#### KnowledgebasePanel
```typescript
interface KnowledgebasePanelProps {
  entries: Array<{
    kID: string;
    knowledgeName: string;
    knowledgeContent: string;
    remarks?: string;
    createdDate: string;
  }>;
  selectedEntry?: string;
  onSelect: (kID: string) => void;
  onUpload: (file: File) => void;
  onSearch: (query: string) => void;
}
```

**Visual:**
```
┌─────────────────────────────────────────────────────────────┐
│  📚 Knowledgebase                          [+ Upload]       │
│  [Search documents...]                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 📄 Air Quality Management Procedure                  │    │
│  │    Uploaded: Jul 10, 2026 | 2.3 MB                  │    │
│  │ 📄 VOC Monitoring Guidelines                         │    │
│  │    Uploaded: Jul 5, 2026 | 1.1 MB                   │    │
│  │ 📄 Emission Testing Protocol                         │    │
│  │    Uploaded: Jun 28, 2026 | 3.7 MB                  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Selected: Air Quality Management Procedure           │    │
│  │                                                     │    │
│  │ # Air Quality Management                            │    │
│  │                                                     │    │
│  │ 1. Purpose                                          │    │
│  │ This procedure establishes...                       │    │
│  │                                                     │    │
│  │ [Edit] [Download] [AI Chat]                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Page Wireframes

### 3.1 Assessor Pages

#### `/fla` — Dashboard (Assessor Home)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SAMS                          Dashboard    My Work    KB    Help      │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌────────────────────────────────────────┐  ┌─────────────────────┐   │
│  │  📊 Process Health                     │  │  🏆 Gamification    │   │
│  │  ─────────────────────────────────────  │  │  Points: 36         │   │
│  │                                        │  │  Streak: 5 days 🔥  │   │
│  │  Carbon, Environment, Social          │  │                     │   │
│  │  ┌──────────────────────────────────┐  │  │  Recent Badges:     │   │
│  │  │ 🟢 Air Quality        85% (8/8) │  │  │  🥇 First Assessment│   │
│  │  │ 🟡 Water in Env       62% (5/8) │  │  │  🥈 10 Controls     │   │
│  │  │ 🔴 Waste              30% (2/8) │  │  │                     │   │
│  │  └──────────────────────────────────┘  │  │  Next Badge:        │   │
│  │                                        │  │  Assessment Master  │   │
│  │  HSSE & SP Foundations                │  │  ████████░░ 8/10    │   │
│  │  ┌──────────────────────────────────┐  │  │                     │   │
│  │  │ 🟢 Process Safety     92% (11/12)│  │  │  Leaderboard:       │   │
│  │  │ 🟢 Workplace Health   88% (7/8) │  │  │  1. admin   36 pts  │   │
│  │  └──────────────────────────────────┘  │  │  2. edward  10 pts  │   │
│  │                                        │  │  3. regina  10 pts  │   │
│  │  [View All Process Areas →]            │  │                     │   │
│  │                                        │  │  Your rank: #2      │   │
│  │  ─────────────────────────────────────  │  └─────────────────────┘   │
│  │  ⚡ Quick Actions                       │                            │
│  │  [+ New Assessment] [My Open Actions]  │                            │
│  │  [Upload Evidence]  [View KB]          │                            │
│  └────────────────────────────────────────┘                            │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│  📋 My Active Assessments (3)                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Q3 Air Quality Assessment    [InProgress]  8 controls  →        │   │
│  │ Q3 Water Management          [Planned]     5 controls  →        │   │
│  │ Q2 Waste Review                [Completed]   12 controls  →       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### `/fla/[id]` — Assessment Detail (5 Tabs)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Dashboard    Q3 Air Quality Assessment          [InProgress]│
│  ─────────────────────────────────────────────────────────────────────  │
│  [Overview] [Control Assignment] [Sample Selection] [Findings] [Activities]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  📋 Assessment Details                                           │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Name: Q3 Air Quality Assessment                                 │   │
│  │  Activity Type: Field Assessment                                 │   │
│  │  Assessor: Megan                                                 │   │
│  │  LOA: Second Line                                                │   │
│  │  Start Date: Jul 15, 2026                                        │   │
│  │  End Date: —                                                     │   │
│  │  Status: InProgress                                              │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  📊 Progress                                                     │   │
│  │  Controls Assigned: 8/8                                          │   │
│  │  Samples Collected: 12/16                                        │   │
│  │  Findings Recorded: 3                                            │   │
│  │  Actions Open: 5                                                 │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  [Complete Assessment]  [Edit Details]                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tab 2: Control Assignment**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Overview] [Control Assignment] [Sample Selection] [Findings] [Activities]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌────────────────────────────────────────┐  ┌─────────────────────┐   │
│  │  🔍 Select Controls                    │  │  ✅ Assigned (8)    │   │
│  │  ─────────────────────────────────────  │  │  ─────────────────  │   │
│  │  Process Area: [Air Quality ▾]        │  │  Air Quality - 1    │   │
│  │  Requirement: [All ▾]                 │  │  ├─ Control A       │   │
│  │  Search: [___________]                 │  │  └─ Control B       │   │
│  │  ─────────────────────────────────────  │  │                     │   │
│  │  ┌──────────────────────────────────┐  │  │  Air Quality - 2    │   │
│  │  │ ☑ Conduct Air Dispersion Mod... │  │  │  ├─ Control C       │   │
│  │  │ ☑ Identify Air Emission Risks... │  │  │  └─ Control D       │   │
│  │  │ ☐ Manage Ozone Depleting Sub... │  │  │                     │   │
│  │  │ ☑ Reduce VOC Emissions to AL... │  │  │  Unmapped Controls  │   │
│  │  │ ☐ Monitor SOx and NOx Emissi... │  │  │  ├─ Control E       │   │
│  │  │ ☐ Implement Leak Detection...   │  │  │  ├─ Control F       │   │
│  │  └──────────────────────────────────┘  │  │  ├─ Control G       │   │
│  │  [Select All] [Clear] [Add Selected]  │  │  └─ Control H       │   │
│  └────────────────────────────────────────┘  │  [Remove Selected]  │   │
│                                              └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tab 3: Sample Selection**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Overview] [Control Assignment] [Sample Selection] [Findings] [Activities]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  📋 Sample Collection                                           │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Control: Conduct Air Dispersion Modelling                      │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ Sample 1: Site inspection report                         │    │   │
│  │  │ Type: DocumentReview | Source: Internal                 │    │   │
│  │  │ Status: [Tested ▾]  Conclusion: [Effective ▾]           │    │   │
│  │  │ Notes: _______________________________________________  │    │   │
│  │  │ [📎 Attach File]  [Save]                                │    │   │
│  │  ├─────────────────────────────────────────────────────────┤    │   │
│  │  │ Sample 2: Interview with operations manager              │    │   │
│  │  │ Type: Interview | Source: Personnel                      │    │   │
│  │  │ Status: [NotTested ▾]  Conclusion: [— ▾]                │    │   │
│  │  │ Notes: _______________________________________________  │    │   │
│  │  │ [📎 Attach File]  [Save]                                │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │  [+ Add Sample]                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tab 4: Finding & Actions**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Overview] [Control Assignment] [Sample Selection] [Findings] [Activities]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ⚠️ Findings (3)                                                │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │ 🔴 High | VOC emissions exceed threshold                 │    │   │
│  │  │ Risk: Regulatory non-compliance, environmental impact     │    │   │
│  │  │ Controls: Control A, Control B                            │    │   │
│  │  │ ─────────────────────────────────────────────────────     │    │   │
│  │  │ Actions:                                                  │    │   │
│  │  │ ☑ Install VOC monitoring | John    | Jul 30  [Done]      │    │   │
│  │  │ ☐ Root cause analysis    | Sarah   | Aug 15  [Edit]      │    │   │
│  │  │ [+ Add Action]  [Edit Finding]  [Delete]                  │    │   │
│  │  ├─────────────────────────────────────────────────────────┤    │   │
│  │  │ 🟡 Medium | Documentation incomplete                     │    │   │
│  │  │ ...                                                     │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  │  [+ New Finding]                                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tab 5: Activities**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Overview] [Control Assignment] [Sample Selection] [Findings] [Activities]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────────────────┬──────────────────────────────────────────┐   │
│  │  📅 Activities       │  (Select an activity or add a new one)   │   │
│  │  ─────────────────   │                                          │   │
│  │  [+ Add Activity]    │                                          │   │
│  │  ─────────────────   │                                          │   │
│  │  ▶ ACT-001 Interview │                                          │   │
│  │    Jul 20 · 09:00-10 │                                          │   │
│  │  ▶ ACT-002 Doc Review│                                          │   │
│  │    Jul 21 · 14:00-16 │                                          │   │
│  │                      │                                          │   │
│  └──────────────────────┘                                          │   │
│                                                                         │
│  When an activity is selected, the right pane shows sub-tabs:            │
│  [Participants] [Details] [Controls]                                    │
│                                                                         │
│  Participants sub-tab:                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Assigned Participants                                          │   │
│  │  User: [Megan ▾]  Role: [Interviewer ___]  Remarks: [____]     │   │
│  │  [+ Add]                                                        │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Megan      Interviewer     Test notes              [Remove]    │   │
│  │  John       Observer        —                       [Remove]    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Details sub-tab:                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Activity Type: [Interview ▾]   Date: [Jul 20, 2026 ▾]         │   │
│  │  Start: [09:00]  End: [10:00]  Duration: [1h]                  │   │
│  │  Activity Name: [Interview with operations manager]            │   │
│  │  Description: [_________________]                              │   │
│  │  Checklists: [_________________]                               │   │
│  │  Activity Notes: [_________________]                           │   │
│  │  📎 Attachments (0) [Upload]                                    │   │
│  │  [Save Changes]                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Controls sub-tab:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Mapped Controls (2)                                            │   │
│  │  • Conduct Air Dispersion Modelling                    [Remove] │   │
│  │  • Identify Air Emission Risks                         [Remove] │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Available Controls                                             │   │
│  │  • Reduce VOC Emissions to ALARP                    [+ Map]     │   │
│  │  • Manage Ozone Depleting Substances                [+ Map]     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  [+ Add Activity] opens a modal with the same fields as Details.        │
│  [Delete Activity] removes the activity and its participants/controls.  │
│  Duplicate user/control assignments are blocked with a clear message.   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 3.2 Admin Pages

#### `/admin` — Admin Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SAMS [SAMS001 ▾]    Dashboard    Setup    Admin    Help               │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────┬───────────────────────────────────────────────────────┐   │
│  │          │                                                       │   │
│  │ 📊       │  Admin Dashboard                    [SAMS001 ▾]      │   │
│  │ Overview │  ─────────────────────────────────────────────────    │   │
│  │          │                                                       │   │
│  │ 🗄️       │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │   │
│  │ Database │  │ Tables  │ │  Users  │ │ Controls│ │Requirements│   │   │
│  │          │  │   45    │ │   12    │ │  3,144  │ │   933   │    │   │
│  │ 👥       │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │   │
│  │ Users    │                                                       │   │
│  │          │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │   │
│  │ 📋       │  │Assessments│ │Findings│ │ Actions │ │Knowledge│    │   │
│  │ Require- │  │   156    │ │   89    │ │   234   │ │   45    │    │   │
│  │ ments    │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │   │
│  │          │                                                       │   │
│  │ 🏷️       │  ─────────────────────────────────────────────────    │   │
│  │ Badges   │  ⚡ Quick Actions                                     │   │
│  │          │  [Backup Database] [Adopt Templates] [View Logs]      │   │
│  │ 📚       │                                                       │   │
│  │ Knowledge│  ─────────────────────────────────────────────────    │   │
│  │ base     │  📈 Recent Activity                                   │   │
│  │          │  • Jul 21 14:32 — admin created Control "VOC Mon..." │   │
│  │ 📦       │  • Jul 21 14:15 — megan completed Assessment "Q3..." │   │
│  │ Templates│  • Jul 21 13:58 — edward adopted templates to SMDS   │   │
│  │          │  • Jul 21 13:45 — paul created Finding "VOC emiss..."│   │
│  │          │                                                       │   │
│  └──────────┴───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### `/admin` — Database Management (Sidebar Selected)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SAMS [SAMS001 ▾]    Dashboard    Setup    Admin    Help               │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────┬───────────────────────────────────────────────────────┐   │
│  │          │                                                       │   │
│  │ 📊       │  🗄️ Database Management                               │   │
│  │ Overview │  ─────────────────────────────────────────────────    │   │
│  │          │                                                       │   │
│  │ 🗄️       │  [💾 Download Full Backup]  [📤 Restore from File]   │   │
│  │ Database │  [🔍 Check Sync Status]                               │   │
│  │  ✓       │                                                       │   │
│  │ 👥       │  ─────────────────────────────────────────────────    │   │
│  │ Users    │  📦 SAMS Relational Data Exports                      │   │
│  │          │  [📥 Controls CSV] [📋 Controls JSON]                 │   │
│  │ 📋       │  [📥 Requirements CSV] [📋 Requirements JSON]         │   │
│  │ Require- │                                                       │   │
│  │ ments    │  ─────────────────────────────────────────────────    │   │
│  │          │  📋 Database Tables (45)                              │   │
│  │ 🏷️       │  ┌─────────────────────────────────────────────┐     │   │
│  │ Badges   │  │ Table          │ Columns │ Rows    │ Actions │     │   │
│  │          │  │────────────────┼─────────┼─────────┼─────────│     │   │
│  │ 📚       │  │ User           │    12   │     12  │ [View]  │     │   │
│  │ Knowledge│  │ Control        │    28   │  3,144  │ [View]  │     │   │
│  │ base     │  │ Requirement    │    12   │    933  │ [View]  │     │   │
│  │          │  │ Assessment     │    10   │    156  │ [View]  │     │   │
│  │ 📦       │  │ ...            │   ...   │    ...  │  ...    │     │   │
│  │ Templates│  └─────────────────────────────────────────────┘     │   │
│  │          │                                                       │   │
│  └──────────┴───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### `/setup/processdetails/[id]` — Process Area Detail (Requirements & Controls Tab)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Process Areas    Air Quality                    [🗂 Map Controls]   │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Process Overview] [Requirements & Controls] [Assessments] [Knowledgebase]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  6 requirement(s) · 8 linked control(s)           [🗂 Map Controls] [+ Requirement]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ▼ Air Quality - 1 (1)                              🟢 85% Healthy│   │
│  │   Sources with Volatile Organic Compound (VOC) emissions...       │   │
│  │   ┌─────────────────────────────────────────────────────────┐    │   │
│  │   │ ⋮⋮ │ Control              │ Type       │ Health │ ... │    │   │
│  │   ├─────────────────────────────────────────────────────────┤    │   │
│  │   │ ⋮⋮ │ Conduct Air Disp...  │ Procedural │ 🟢 85% │ ... │    │   │
│  │   └─────────────────────────────────────────────────────────┘    │   │
│  │   [+ Add Control]                                                │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ▶ Air Quality - 2 (1)                              🟡 62% Tolerable│  │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ▶ Air Quality - 3 (1)                              🔴 30% Not Tolerable││
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ▶ Air Quality - 4 (0)                              ⚪ —           │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ▶ Air Quality - 5 (0)                              ⚪ —           │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ ▶ Unmapped Controls (4)                            📋 —           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**With Map Controls Panel Open:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Process Areas    Air Quality                    [✕ Exit Map Mode]   │
│  ─────────────────────────────────────────────────────────────────────  │
│  [Process Overview] [Requirements & Controls] [Assessments] [Knowledgebase]│
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────────────────────┬──────────────────────────────────────┐   │
│  │  📋 Unmapped Controls (4) │  📋 Requirements                     │   │
│  │  [Filter controls...]     │  ──────────────────────────────────  │   │
│  │  ┌─────────────────────┐  │  ┌────────────────────────────────┐  │   │
│  │  │ ☑ Control A         │  │  │ Air Quality - 1 (1) 🟢 85%    │  │   │
│  │  │ ☐ Control B         │  │  │ Sources with VOC emissions...  │  │   │
│  │  │ ☑ Control C         │  │  │                      [Assign ←] │  │   │
│  │  │ ☐ Control D         │  │  └────────────────────────────────┘  │   │
│  │  │                     │  │  ┌────────────────────────────────┐  │   │
│  │  │ [Select All] [Clear]│  │  │ Air Quality - 2 (1) 🟡 62%    │  │   │
│  │  └─────────────────────┘  │  │ A Facility with VOC emissions..│  │   │
│  │  2 selected               │  │                      [Assign ←] │  │   │
│  │  [→ Assign to Req ▾]     │  └────────────────────────────────┘  │   │
│  │                           │  ┌────────────────────────────────┐  │   │
│  │                           │  │ Air Quality - 3 (1) 🔴 30%    │  │   │
│  │                           │  │ Existing Facility in non-OECD..│  │   │
│  │                           │  │                      [Assign ←] │  │   │
│  │                           │  └────────────────────────────────┘  │   │
│  │                           │  ...                                 │   │
│  └──────────────────────────┴──────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Mobile Wireframes (Tablet)

### 4.1 Assessor Dashboard (768px)

```
┌─────────────────────────────────────┐
│  ☰  SAMS           👤 Megan  ⚙️    │
│  ─────────────────────────────────  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  📊 Process Health          │    │
│  │  🟢 Air Quality    85%      │    │
│  │  🟡 Water          62%      │    │
│  │  🔴 Waste          30%      │    │
│  │  [View All →]               │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  ⚡ Quick Actions           │    │
│  │  [+ New Assessment]         │    │
│  │  [My Open Actions]          │    │
│  │  [Upload Evidence]          │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  📋 My Assessments (3)      │    │
│  │  Q3 Air Quality  [InProg] → │    │
│  │  Q3 Water        [Plan]   → │    │
│  │  Q2 Waste        [Done]   → │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🏆 Points: 36  Streak: 5🔥 │    │
│  └─────────────────────────────┘    │
│                                     │
│  ─────────────────────────────────  │
│  [Dashboard] [My Work] [KB] [Help] │
└─────────────────────────────────────┘
```

### 4.2 Sample Entry (768px — Field Use)

```
┌─────────────────────────────────────┐
│  ← Back    Sample Collection   💾  │
│  ─────────────────────────────────  │
│                                     │
│  Control: Air Dispersion Modelling │
│  ─────────────────────────────────  │
│                                     │
│  Sample Type: [Document Review ▾]  │
│  Source: [Internal ▾]              │
│                                     │
│  Status:                            │
│  ┌─────┐ ┌─────────┐ ┌──────────┐ │
│  │     │ │         │ │          │ │
│  │ ⬜  │ │   ✅    │ │    ⬜    │ │
│  │Not  │ │ Tested  │ │ In       │ │
│  │Tested│ │         │ │ Progress │ │
│  └─────┘ └─────────┘ └──────────┘ │
│                                     │
│  Conclusion:                        │
│  ┌─────────┐ ┌──────────┐ ┌─────┐ │
│  │         │ │          │ │     │ │
│  │   ✅    │ │    ⬜    │ │ ⬜  │ │
│  │Effective│ │ Not      │ │ N/A │ │
│  │         │ │ Effective│ │     │ │
│  └─────────┘ └──────────┘ └─────┘ │
│                                     │
│  Notes:                             │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │  _________________________  │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  [📷 Take Photo]  [📎 Attach File] │
│                                     │
│  ─────────────────────────────────  │
│  [Save Sample]  [+ Add Another]    │
└─────────────────────────────────────┘
```

---

## 5. Interaction Patterns

### 5.1 Drag-and-Drop (Control Mapping)

| Step | Action | Visual Feedback |
|------|--------|-----------------|
| 1 | User starts dragging control | Control becomes semi-transparent (opacity: 0.4) |
| 2 | Drag over requirement card | Card highlights blue (`bg-blue-100 border-blue-400`) |
| 3 | Drop on requirement | "Drop control here" text pulses |
| 4 | Release | Control moves to new requirement, API call fires |
| 5 | Success | Toast: "Control mapped to Air Quality - 1" |
| 6 | Error | Control snaps back, toast: "Mapping failed" |

### 5.2 Map Controls Mode

| Step | Action | Visual Feedback |
|------|--------|-----------------|
| 1 | Click "🗂 Map Controls" | Panel slides in, cards fade out |
| 2 | Check controls on left | Checked items highlight amber |
| 3 | Click requirement on right | Immediate assign, toast confirmation |
| 4 | Or: select from dropdown | Bulk assign button enabled |
| 5 | Click "✕ Exit Map Mode" | Panel slides out, cards fade in |

### 5.3 Inline Editing (Requirements)

| Step | Action | Visual Feedback |
|------|--------|-----------------|
| 1 | Click requirement row | Row expands, form fields appear |
| 2 | Edit fields | Field borders highlight on focus |
| 3 | Click "Save" | Loading spinner, then success checkmark |
| 4 | Click "Cancel" | Form collapses, changes discarded |

### 5.4 File Upload (Attachments)

| Step | Action | Visual Feedback |
|------|--------|-----------------|
| 1 | Click "📎 Attach File" or drag file | Drop zone highlights blue |
| 2 | File selected | File name + size appears, progress bar |
| 3 | Upload complete | File appears in list with download/delete buttons |
| 4 | Error | Red border, error message |

### 5.5 Assessment Activities

| Step | Action | Visual Feedback |
|------|--------|-----------------|
| 1 | Click "Activities" tab | Activity list + empty detail pane appears |
| 2 | Click "+ Add Activity" | Modal opens with activity fields |
| 3 | Fill fields, click "Create Activity" | Modal closes, activity appears in list, toast success |
| 4 | Click an activity | Right pane shows Participants/Details/Controls sub-tabs |
| 5 | Add participant | Participant appears in table; duplicate shows error toast |
| 6 | Map control | Control moves from Available to Mapped list |
| 7 | Save details | Toast: "Activity updated" |
| 8 | Click "Delete Activity" | Confirm dialog; on confirm, activity removed |

---

## 6. Accessibility Specifications

### 6.1 ARIA Labels

| Element | ARIA Attribute | Value |
|---------|---------------|-------|
| Health indicator | `role="img"` `aria-label` | `"Health score: 85 percent, healthy"` |
| Drag handle | `aria-label` | `"Drag to reorder or move control"` |
| Expand/collapse | `aria-expanded` | `"true"` or `"false"` |
| Modal | `role="dialog"` `aria-modal` | `"true"` |
| Close button | `aria-label` | `"Close dialog"` |
| Required field | `aria-required` | `"true"` |
| Error message | `role="alert"` | Announced to screen readers |
| Loading spinner | `aria-busy` | `"true"` |
| Navigation | `role="navigation"` `aria-label` | `"Main navigation"` |

### 6.2 Keyboard Navigation

| Action | Key | Context |
|--------|-----|---------|
| Navigate links/buttons | `Tab` / `Shift+Tab` | Global |
| Activate button | `Enter` / `Space` | Focused element |
| Close modal | `Escape` | Modal open |
| Expand/collapse | `Enter` / `Space` | Accordion header |
| Move control (drag alternative) | `Ctrl+↑` / `Ctrl+↓` | Control selected |
| Open context menu | `Shift+F10` | Any element |
| Skip to main content | `Tab` (first) | Skip link |

### 6.3 Focus Management

| Scenario | Behavior |
|----------|----------|
| Modal opens | Focus moves to first focusable element inside modal |
| Modal closes | Focus returns to element that opened it |
| Page navigation | Focus moves to main heading |
| Form error | Focus moves to first error field |
| Toast appears | Focus stays on current element (no steal) |

---

## 7. Responsive Breakpoints

| Breakpoint | Width | Target Devices | Layout Changes |
|------------|-------|---------------|----------------|
| `xs` | < 640px | Phone | Single column, hamburger menu, bottom tabs |
| `sm` | 640–768px | Large phone | Single column, condensed navbar |
| `md` | 768–1024px | Tablet | Two-column where possible, collapsible sidebar |
| `lg` | 1024–1280px | Small desktop | Full layout, sidebar visible |
| `xl` | > 1280px | Desktop | Full layout, optimal spacing |

---

## 8. Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-07-21 | Initial UI wireframes. Design system (colors, typography, spacing), component library specs, page wireframes for all major pages, mobile wireframes, interaction patterns, accessibility specifications. |
| v1.1.0 | 2026-07-22 | Updated Assessment Detail Activities tab wireframe to reflect implemented two-pane layout with Participants/Details/Controls sub-tabs, duplicate-assignment guards, and attachment support. Added Activity interaction pattern. |
