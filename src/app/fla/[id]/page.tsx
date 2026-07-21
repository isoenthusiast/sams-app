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
    },
  });

  if (!assessment) notFound();

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

  return (
    <AssessmentClient
      assessment={JSON.parse(JSON.stringify(assessment))}
      allControls={JSON.parse(JSON.stringify(allControls))}
      processAreas={processAreas}
      currentUserId={(session.user as any)?.id}
    />
  );
}
