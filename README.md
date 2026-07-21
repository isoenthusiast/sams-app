# SAMS App

**SAMS Assurance App** — Redesigned user experience for the SEAM gamified internal control testing platform.

**Status:** Design Phase — No Code Yet  
**Database:** Shared with `seam-assurance-app` (PostgreSQL)  
**Purpose:** Same functionality, better UX

---

## Directory Structure

```
sams-app/
├── 01 Design Considerations/
│   ├── 01_DESIGN_CONTEXT.md              # Project context, personas, navigation, shared DB strategy
│   ├── 02_DATA_MODEL.md                  # Complete data model documentation (45 models, 10 enums)
│   ├── 03_UI_WIREFRAMES.md               # UI wireframes, component specs, interaction patterns
│   ├── 04_USER_ROLES_AND_TEST_SCENARIOS.md  # User roles, test scenarios, edge cases
│   └── 05_DEVELOPMENT_CHECKLIST.md       # 100-item phased development plan
├── Kimi_APP_DESIGN.md                    # Original design document (root folder)
└── README.md                             # This file
```

## Key Documents

| Document | Purpose |
|----------|---------|
| `01_DESIGN_CONTEXT.md` | Why sams-app exists, user personas from production DB, navigation architecture, shared database strategy |
| `02_DATA_MODEL.md` | Complete reference for all 45 database models, relationships, constraints, cascade rules |
| `03_UI_WIREFRAMES.md` | Visual wireframes for all pages, component library specifications, mobile layouts, accessibility |
| `04_USER_ROLES_AND_TEST_SCENARIOS.md` | Role definitions, 30+ test scenarios, edge cases, accessibility and performance tests |
| `05_DEVELOPMENT_CHECKLIST.md` | 100-item development plan across 10 phases (scaffolding → deployment) with exit criteria and progress tracker |

## Design Principles

1. **Role-First UI** — Admin and Assessor see different navbars, landing pages, and features
2. **Progressive Disclosure** — Complexity hidden until needed (mapping mode, expandable cards)
3. **Mobile-Aware** — Tablet-first for field assessors, desktop for admins
4. **Component-Driven** — Reusable components extracted from monolithic pages
5. **Accessible** — ARIA labels, keyboard navigation, focus management
6. **Shared Database** — No schema changes, same APIs, same auth system

## Next Steps

1. Review design documents with stakeholders
2. Create component library (Phase 1)
3. Build role-based navigation (Phase 1)
4. Implement admin dashboard (Phase 2)
5. Implement assessor dashboard (Phase 2)
6. Mobile optimization (Phase 3)
7. Accessibility audit (Phase 4)

---

**Reference:** `seam-assurance-app/APP_DESIGN.md` for technical architecture details.
