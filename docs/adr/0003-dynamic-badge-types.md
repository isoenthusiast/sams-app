# ADR-0003: Dynamic Badge Types — Enum → Table

**Date:** 2026-07-24
**Status:** Accepted
**Deciders:** Grilling session on Gamification of Work Processes

---

## Context

The `AchievementBadge` model uses a Prisma `BadgeType` enum with three fixed values: `Track`, `Role`, `Special`. This covers system-awarded badges tied to process area competency, role excellence, and unique achievements.

During the 2026-07-24 grilling session, we identified two additional badge types:

- **Streak:** Consistency over time (e.g., "completed an assessment every quarter for 4 consecutive quarters")
- **Mentor:** Growing others (e.g., "mentored someone who reached Silver")

More critically, we identified the need for **Behavioral Badges** — peer-awarded badges given by colleagues to recognize positive behaviors (e.g., "Supported" badge awarded by a colleague who felt supported). These badges derive their value from the social relationship (Chou's CD5 Social Treasure), not from system algorithms. In a mature feedback culture, peer recognition carries MORE weight than authority recognition because peers have nothing to gain from the gesture.

A fixed enum cannot accommodate:
- Admin-defined badge types per company (different organizations value different behaviors)
- Peer-awarded badges that live alongside system-awarded badges
- Future badge types we haven't conceived yet (Innovation, Safety Champion, etc.)

---

## Decision

**Change `AchievementBadge.badgeType` from a Prisma enum to a foreign key referencing a new `BadgeType` table.**

### Schema Change

```prisma
// NEW: Dynamic badge type catalog
model BadgeType {
  id          String             @id @default(cuid())
  name        String             // "Track", "Role", "Special", "Streak", "Mentor", "Behavioral"
  description String?            // Human-readable description
  awardSource AwardSource        // SYSTEM or PEER
  companyId   String?            // NULL = global (SAMS001), set = company-specific
  company     Company?           @relation(fields: [companyId], references: [id])
  badges      AchievementBadge[]
  createdAt   DateTime           @default(now())

  @@unique([name, companyId])
}

enum AwardSource {
  SYSTEM
  PEER
}

// MODIFIED: badgeType enum replaced with FK
model AchievementBadge {
  // ... existing fields ...
  badgeTypeId  String
  badgeType    BadgeType         @relation(fields: [badgeTypeId], references: [id])
  // ... rest unchanged ...
}
```

### Behavioral Badge Rules

- Awarded by any user to any other user (same company)
- Requires a reason/description (minimum length, not empty)
- One award per giver-recipient-badgeType combination (no spamming)
- Optional cooldown per giver (e.g., 1 behavioral award per week)
- Visible to Admin for moderation (abuse prevention)
- Counts toward CV export

---

## Consequences

### Positive

- **Extensible:** Admin adds badge types without schema migrations
- **Multi-tenant:** Each company can define its own behavioral badge vocabulary
- **Social depth:** Peer-awarded badges create visible social fabric. "Recognized by 12 colleagues across 4 behavioral categories" is a powerful signal.
- **Future-proof:** CV export, competency analytics, and Octalysis CD5 scoring all benefit from rich badge taxonomy
- **Culture-building:** The system can propose behavioral badge types appropriate to each maturity stage

### Negative

- **Migration complexity:** Existing `AchievementBadge` records with `badgeType` enum values must be mapped to `BadgeType` table rows. Seed data needed for the 5 standard types.
- **Query complexity:** Filtering badges by type now requires a JOIN instead of an enum comparison
- **Enum simplicity lost:** Prisma enums provide type safety in generated TypeScript. We trade that for runtime flexibility.
- **Validation burden:** Peer-awarded badges need abuse-prevention logic (rate limiting, reason validation, admin moderation)

### Neutral

- The `AchievementBadge.badgeType` column (varchar) will be replaced by `badgeTypeId` (FK). A data migration must backfill existing badge records.

---

## Alternatives Considered

### A: Keep enum, add more values
Add `Streak`, `Mentor`, `Behavioral` to the enum. Rejected because it doesn't solve the extensibility problem — every new badge type requires a migration. It also doesn't support company-specific behavioral badge types.

### B: Keep enum for system awards, separate table for peer awards
Two parallel systems. Rejected because it creates unnecessary divergence — the badge display, CV export, and analytics layers would need to handle two different badge models.

### C: JSON field for badge type metadata
Add a `badgeTypeMeta` JSON column while keeping the enum. Rejected as a half-measure — it doesn't enable the Admin workflow of creating new badge types through the UI.

---

## References

- `Gamification of Work Processes.md` — Section 5.5 (Badge Rule Engine), Section 2 (Core Philosophy)
- `CONTEXT.md` — Assurance Gamification section
- Existing `AchievementBadge` model in `sams-app/prisma/schema.prisma`
- Chou's Octalysis CD5 (Social Influence & Relatedness) — Social Treasure concept
- Clear's Atomic Habits — Identity-based change, peer recognition as identity votes
- Ben-Shahar's Happier — Chapter 8, Relationships as a pillar of happiness
