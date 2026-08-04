const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ errorFormat: 'minimal' });
(async () => {
  console.log('=== SMDS DATA INVENTORY ===\n');
  
  const smds = await p.company.findFirst({ where: { companyID: 'comp_smds' }, select: { id: true, name: true } });
  if (!smds) { console.log('SMDS company not found'); return; }
  console.log('Company:', smds.name, '(' + smds.id + ')\n');
  
  // Standards
  const stds = await p.standard.findMany({ 
    where: { companyId: smds.id },
    include: { _count: { select: { processAreas: true } } },
    orderBy: { standard: 'asc' }
  });
  console.log('=== STANDARDS (' + stds.length + ') ===');
  for (const s of stds) {
    console.log('  ' + s.standard + ' | PAs: ' + s._count.processAreas);
  }
  
  // ProcessAreas (non-ISO only)
  const isoStd = await p.standard.findFirst({ where: { companyId: smds.id, standard: 'International Standards (ISO)' }, select: { id: true } });
  const pas = await p.processArea.findMany({
    where: { companyId: smds.id, ...(isoStd ? { standardId: { not: isoStd.id } } : {}) },
    include: { 
      _count: { select: { requirements: true, controls: true } },
      standardRef: { select: { standard: true } }
    },
    orderBy: [{ standardRef: { standard: 'asc' } }, { name: 'asc' }]
  });
  console.log('\n=== NON-ISO PROCESS AREAS (' + pas.length + ') ===');
  for (const pa of pas) {
    console.log('  [' + pa.standardRef.standard + '] ' + pa.name + ' | reqs:' + pa._count.requirements + ' | ctrls:' + pa._count.controls);
  }
  
  // Requirements summary per PA
  console.log('\n=== REQUIREMENTS PER PA (non-ISO) ===');
  for (const pa of pas) {
    const reqs = await p.requirement.findMany({
      where: { processAreaId: pa.id },
      select: { requirementId: true, clauseContent: true },
      orderBy: { requirementId: 'asc' },
      take: 5
    });
    console.log('  [' + pa.name + '] ' + pa._count.requirements + ' total, first ' + reqs.length + ':');
    for (const r of reqs) {
      console.log('    ' + r.requirementId + ': ' + (r.clauseContent || '').substring(0, 80));
    }
    if (pa._count.requirements > 5) console.log('    ...');
  }
  
  await p.$disconnect();
})();
