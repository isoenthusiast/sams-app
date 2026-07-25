# ADR-0001: Control Health Recalculation — Deduction-Based Formula

**Date:** 2026-07-22
**Status:** Accepted

## Context

Controls have a `rawHealthScore` (Int, default 80) that currently never changes. We need it to reflect the actual outcome of assessments — findings, severity, and whether actions have been closed.

## Decision

A **cumulative deduction model** scoped per-assessment, with quarterly reset:

1. Each quarter starts with all controls at 0%.
2. The first assessment on a control brings it to 100%.
3. Outstanding actions (any `actionClosureEffective = false`) linked to findings on the control deduct from the score:
   - Low: 0% (observation, not a defect)
   - Medium: -5%
   - High: -10%
   - Serious: -15%
   - Repeat (any severity): -15%
4. Floor at 0%. Cumulative across multiple findings within the quarter.
5. Quarterly manual reset to 0% triggers the next anxiety cycle.

## Alternatives Considered

### Option A: Simple binary (healthy / not healthy)
Rejected — not diagnostic enough. Two controls could both be "not healthy" with wildly different underlying severity.

### Option B: Average across assessments
Rejected — the user explicitly wanted cumulative deductions within a quarter to reflect the buildup of findings, and a reset to drive behavioral change.

### Option C: Per-assessment recalculation only (latest wins)
Rejected — would lose the cumulative signal of multiple findings within a quarter.

## Consequences

- **Pro:** Creates behavioral pressure — quarterly reset + first-assurance anxiety → action.
- **Pro:** Diagnostic — a control at 75% tells a different story than one at 40%.
- **Con:** Requires a quarterly reset mechanism (manual for now; cron/trigger in future).
- **Con:** "Outstanding" depends on `actionClosureEffective` — if actions aren't diligently closed, scores degrade even if the finding was resolved.
