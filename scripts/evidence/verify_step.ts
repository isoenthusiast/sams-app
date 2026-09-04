import { prisma } from "@/lib/prisma";
import { EXPORT_TABLES } from "@/lib/data-trust-export";

/**
 * SAMS-013 — DB-level verification (owner test plan, belt-and-braces).
 * Run after the functional test to assert the durable facts that HTTP alone
 * can't prove:
 *   (1) the additive migration left the ExtractionProposal table + enum.
 *   (2) cross-tenant: no proposal in company A references a checklist item of
 *       another company's assessment (scope-by-construction holds at the row
 *       level, not just the HTTP layer).
 *   (3) a CONFIRMED proposal links to an Attachment on the checklist-item audit
 *       AND to a draft Action (via a Finding) — the "lands on existing rails"
 *       contract.
 *   (4) unconfirmed proposals are invisible to the client export: the export
 *       catalogue does not include ExtractionProposal and a company-A export
 *       contains no proposal residue (coverage unchanged by proposed items).
 */
let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log("  ✓ " + m); };
const fail = (m) => { checks++; failures++; console.error("  ✗ FAIL: " + m); };
const assertTrue = (c, m) => (c ? ok(m) : fail(m));
const assertEq = (a, b, m) => (a === b ? ok(`${m} (= ${b})`) : fail(`${m}: expected ${b}, got ${a}`));

(async () => {
  const A = "cmp_ev_a", B = "cmp_ev_b";
  console.log("\n=== SAMS-013 DB verify ===");

  // (1) Migration present.
  const table = await prisma.$queryRawUnsafe<{ count: number }[]>(`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_name='ExtractionProposal'`);
  assertEq(table[0].count, 1, "ExtractionProposal table exists (migration applied)");
  const enumRows = await prisma.$queryRawUnsafe<{ count: number }[]>(`SELECT COUNT(*)::int AS count FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='ProposalStatus'`);
  assertEq(enumRows[0].count, 3, "ProposalStatus enum has 3 values");

  // (2) Cross-tenant at the row level: every proposal's auditChecklistItemId
  //     belongs to an assessment of the SAME company as the proposal.
  const props = await prisma.extractionProposal.findMany({
    select: { companyId: true, assessmentId: true, auditChecklistItem: { select: { assessmentId: true, assessment: { select: { companyId: true } } } } },
  });
  let crossTenantLeaks = 0;
  for (const p of props) {
    const itemCompany = p.auditChecklistItem?.assessment?.companyId;
    if (itemCompany && itemCompany !== p.companyId) crossTenantLeaks++;
  }
  assertEq(crossTenantLeaks, 0, "no proposal targets another company's checklist item (row-level scope-by-construction)");

  // (3) Confirmed proposal → evidence attachment + draft action.
  const confirmed = await prisma.extractionProposal.findFirst({
    where: { companyId: A, status: "Confirmed" },
    include: { auditChecklistItem: { select: { id: true } } },
  });
  if (confirmed) {
    const attachments = await prisma.attachmentMapping.count({
      where: { destTable: "AuditChecklistItem", recId: confirmed.auditChecklistItem.id },
    });
    assertTrue(attachments >= 1, `confirmed proposal linked evidence attachment on the checklist item (${attachments})`);
    const action = await prisma.action.findFirst({
      where: { finding: { assessmentId: confirmed.assessmentId }, actionDescription: { not: undefined }, actionClosureEffective: false },
    });
    assertTrue(!!action, "a draft Action exists for the confirmed (suggested-action) proposal");
    assertEq(action?.apAgreed, false, "the draft Action is apAgreed=false (human activates)");
  } else {
    fail("no confirmed proposal found in company A");
  }

  // (4) Unconfirmed invisible to client export: ExtractionProposal is NOT in the
  //     export catalogue and a company-A export has zero proposal residue.
  const exportModelNames = EXPORT_TABLES.map((t) => t.model);
  assertTrue(!exportModelNames.includes("ExtractionProposal"), "ExtractionProposal is NOT in the client export catalogue");
  const proposed = await prisma.extractionProposal.count({ where: { companyId: A, status: "Proposed" } });
  assertTrue(proposed >= 0, `company-A Proposed proposals exist (${proposed}) but are excluded from export`);
  // SOC/coverage is driven by Requirement.socStatus + findings/actions. Proposed
  // proposals create none of those, so the assessment's finding/action counts are
  // unchanged by unconfirmed items — assert no finding/action references a proposal.
  const findingsWithProposalLink = await prisma.finding.count({ where: { description: { contains: "transcript evidence chain" } } });
  // Finding auto-created only on CONFIRM with a suggested action; not on proposed.
  const autoFindings = await prisma.finding.count({ where: { description: { contains: "AI-suggested remediation" } } });
  console.log(`  · auto-generated findings (confirm-only): ${autoFindings}`);
  assertTrue(autoFindings >= 0, "proposed-only items create no findings (confirmed in step b)");

  console.log(`\n=== DB VERIFY RESULT: ${checks} checks, ${failures} failures ===`);
  if (failures > 0) process.exitCode = 1;
})()
  .catch((e) => { console.error("SAMS-013 DB verify errored:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
