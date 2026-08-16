# SAMS App

**SAMS Assurance App** — Redesigned user experience for the SEAM gamified internal control testing platform.

**Status:** ✅ Deployed — design v1.13.10 (2026-08-15), Next.js 16 + React 19 + TypeScript 5.9 + Prisma 7 (PostgreSQL) + Tailwind 4 + next-auth v5, hosted on Railway (port 3100)

**Database:** Shared with `seam-assurance-app` (PostgreSQL)

**Purpose:** Same functionality, better UX

---

## Directory Structure

```
sams-app/
├── 01 Design Considerations/        # Original design context, data model, wireframes, roles
├── 02 lesson learnt/                # Build-session lessons log (21 lessons, consolidated into gamified-plant/ProjectLessonLearnt.md)
├── TestPlan/                        # UI/UX functional test plan (v1.10.3), org-sort tests
├── docs/                            # ADRs, runbooks, audit docs
├── prisma/                          # Prisma schema (66 models), migrations
├── src/                             # App code (app router, components, API routes)
├── scripts/                         # Admin/dev scripts (db, gamification, users)
├── public/                          # Static assets
├── APP_DESIGN_PowerApps_Quest.md    # PowerApps build quest — SUPERSEDED, archived in gamified-plant
├── SAMS_APP_DESIGN.md               # ⭐ The living design record (v1.13.10) — updated on every feature
└── README.md                        # This file
```

## Repo Roles (important)

- **`gamified-plant`** (separate repo) is the **design home** — concepts, plans, ADRs, principles, lessons learnt.
- **`sams-app`** is the **implementation home** — this codebase.
- Design flow: plan in gamified-plant → build here → feed lessons & design updates back to gamified-plant.
- `SAMS_APP_DESIGN.md` in this repo is the working design record; it is mirrored/consolidated into gamified-plant's `docs/conan/CONAN_App Design.md`.

## Key Documents

| Document | Purpose |
|----------|---------|
| `SAMS_APP_DESIGN.md` | The living app design record — architecture, data model, routes, AI pipelines, version history (v1.13.x) |
| `01 Design Considerations/` | Original design context, personas, navigation, data model, wireframes, role scenarios |
| `02 lesson learnt/LESSONS_LEARNED.md` | 21 build-session lessons (Railway, Prisma 7, next-auth v5, Turbopack, etc.) |
| `TestPlan/TEST_PLAN_UIUX_Functional_v1.10.3.md` | UI/UX functional test plan (25 sections, 100+ cases) |
| `docs/adr/` | Architecture Decision Records (0001–0003) |

## Design Principles

1. **Role-First UI** — Admin and Assessor see different navbars, landing pages, and features
2. **Progressive Disclosure** — Complexity hidden until needed (mapping mode, expandable cards)
3. **Mobile-Aware** — Tablet-first for field assessors, desktop for admins
4. **Component-Driven** — Reusable components extracted from monolithic pages
5. **Accessible** — ARIA labels, keyboard navigation, focus management
6. **Shared Database** — No schema changes, same APIs, same auth system
7. **Honest Metrics** — Never Tested ≠ Effective; coverage = % requirements Fully Comply (v1.13.9/10)

## Workflow

1. Feature starts as a **plan in gamified-plant** → PR in that repo
2. Implementation lands here on a `feat/<topic>` branch → PR in this repo
3. After merge: `SAMS_APP_DESIGN.md` is updated (see CLAUDE.md in gamified-plant)
4. Lessons learnt go back into `gamified-plant/ProjectLessonLearnt.md`

## Next Steps

- Maintain the design-record sync (SAMS_APP_DESIGN.md ↔ gamified-plant CONAN docs) after each release
- Continue SOC / compliance-coverage features per the backlog in gamified-plant
- Power Platform companion build (per `00 Design for Microsoft Power Platform/` in gamified-plant)

---

**Reference:** `gamified-plant` repo for design docs, ADRs, and the SOC report; `seam-assurance-app/APP_DESIGN.md` for the original technical architecture.
