import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET — return org chart tree for a company
export async function GET(request: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  // Build tree via recursive CTE
  const rows = await prisma.$queryRawUnsafe<Array<{
    username: string; name: string; email: string | null; role: string;
    preferredName: string | null; id: string;
    positionTitle: string | null; departmentName: string | null;
    organisationIndicator: string | null; managerUsername: string | null;
    depth: number; staffCount: number;
  }>>(
    `WITH RECURSIVE org AS (
      SELECT u.username, u.name, u.email, u.role::text, u."preferredName", u.id,
             p.title as "positionTitle", d.name as "departmentName",
             u."organisationIndicator", u."managerUsername",
             0 as depth
      FROM "User" u
      LEFT JOIN "Position" p ON u."positionId" = p.id
      LEFT JOIN "Department" d ON p."departmentId" = d.id
      WHERE u."managerUsername" = 'TOP'
        AND (${companyId ? `EXISTS (SELECT 1 FROM "UserCompany" uc WHERE uc."userId" = u.id AND uc."companyId" = '${companyId}')` : "TRUE"})
      UNION ALL
      SELECT u.username, u.name, u.email, u.role::text, u."preferredName", u.id,
             p.title as "positionTitle", d.name as "departmentName",
             u."organisationIndicator", u."managerUsername",
             o.depth + 1
      FROM "User" u
      JOIN org o ON u."managerUsername" = o.username
      LEFT JOIN "Position" p ON u."positionId" = p.id
      LEFT JOIN "Department" d ON p."departmentId" = d.id
    )
    SELECT o.*, COUNT(ch.username)::int as "staffCount"
    FROM org o
    LEFT JOIN "User" ch ON ch."managerUsername" = o.username
    GROUP BY o.username, o.name, o.email, o.role, o."preferredName", o.id, o."positionTitle", o."departmentName", o."organisationIndicator", o."managerUsername", o.depth
    ORDER BY o.depth, o.name`
  );

  // Nest into tree structure
  const nodeMap = new Map<string, any>();
  for (const r of rows) {
    nodeMap.set(r.username, {
      id: r.id,
      username: r.username,
      name: r.name,
      preferredName: r.preferredName,
      email: r.email,
      role: r.role,
      position: r.positionTitle,
      department: r.departmentName,
      orgIndicator: r.organisationIndicator,
      managerUsername: r.managerUsername,
      depth: r.depth,
      staffCount: r.staffCount,
      children: [] as any[],
    });
  }

  const roots: any[] = [];
  for (const r of rows) {
    const node = nodeMap.get(r.username)!;
    if (r.managerUsername === "TOP" || !nodeMap.has(r.managerUsername || "")) {
      roots.push(node);
    } else {
      nodeMap.get(r.managerUsername!)?.children.push(node);
    }
  }

  return NextResponse.json({ tree: roots, totalUsers: rows.length });
}
