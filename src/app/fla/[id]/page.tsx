import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getSelectedCompanyId } from "@/lib/authz";
import { notFound } from "next/navigation";
import AssessmentClient from "./AssessmentClient";

export const dynamic = "force-dynamic";

export default async function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const companyId = await getSelectedCompanyId();
  if (!session?.user) return null;

  const userId = (session.user as { id?: string; role?: string }).id;
  const userRole = (session.user as { role?: string }).role;

  const assessment = await prisma.assessment.findUnique({
    where: { id, ...(companyId ? { companyId } : {}) },
    include: {
      activityType: true,
      assessor: true,
      samples: { include: { sampleType: true, recordSource: true } },
      findings: { include: { actions: { orderBy: { createdDate: "asc" } } } },
      controlAssignments: {
        include: {
          control: {
            include: {
              processArea: true,
              requirementMappings: { include: { requirement: true } },
            },
          },
        },
      },
      aacts: {
        include: {
          controls: true,
          users: true,
          details: true,
        },
        orderBy: { activityDate: "desc" },
      },
      assessorLinks: { select: { userId: true } },
    },
  });

  if (!assessment) notFound();

  // Access control: Admin, lead assessor, or any assigned assessor
  const isAdmin = userRole === "Admin";
  const isLeadAssessor = assessment.assessorId === userId;
  const isLinkedAssessor = assessment.assessorLinks?.some((l) => l.userId === userId);
  if (!isAdmin && !isLeadAssessor && !isLinkedAssessor) {
    // Redirect interviewees to My Interviews
    if (userRole === "Interviewee") {
      const { redirect } = await import("next/navigation");
      redirect("/fla/my-interviews");
    }
    notFound();
  }

  // All available controls (company-scoped)
  const allControls = await prisma.control.findMany({
    where: companyId ? { companyId } : {},
    include: {
      processArea: true,
      requirementMappings: { include: { requirement: true } },
    },
    orderBy: { name: "asc" },
  });

  // Process areas for filter
  const processAreas = await prisma.processArea.findMany({
    where: companyId ? { companyId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Reference data for edit form
  const activityTypes = await prisma.assuranceActivityType.findMany({ orderBy: { name: "asc" } });
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const sampleTypes = await prisma.sampleType.findMany({ orderBy: { name: "asc" } });
  const recordSources = await prisma.recordSourceType.findMany({ orderBy: { name: "asc" } });

  const linkedAssessorIds = assessment.assessorLinks?.map((l) => l.userId) ?? [];

  return (
    <AssessmentClient
      assessment={JSON.parse(JSON.stringify(assessment))}
      allControls={JSON.parse(JSON.stringify(allControls))}
      processAreas={processAreas}
      activityTypes={activityTypes}
      users={users}
      sampleTypes={sampleTypes}
      recordSources={recordSources}
      currentUserId={(session.user as any)?.id}
      linkedAssessorIds={linkedAssessorIds}
    />
  );
}
