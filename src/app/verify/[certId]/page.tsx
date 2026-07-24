import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ certId: string }> }) {
  const { certId } = await params;

  const certs = await prisma.$queryRawUnsafe<Array<{ userId: string; generatedAt: string }>>(
    `SELECT "userId", "generatedAt" FROM "Certificate" WHERE "certId" = $1`, certId
  );
  if (!certs.length) notFound();

  const { userId, generatedAt } = certs[0];
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) notFound();

  const total = await prisma.pointTransaction.aggregate({ where: { userId }, _sum: { points: true } });
  const overallXP = total._sum.points || 0;

  const tracks = await prisma.$queryRawUnsafe<Array<{ paName: string; xp: number }>>(
    `SELECT ga."attributeName" as "paName", COALESCE(SUM(pt.points), 0) as xp
     FROM "GameAttribute" ga
     LEFT JOIN "PointTransaction" pt ON pt."gameAttributeId" = ga.id AND pt."userId" = $1
     GROUP BY ga."attributeName" ORDER BY xp DESC LIMIT 5`, userId
  );

  const genDate = new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <html lang="en">
      <head><title>Certificate Verification — SAMS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; } .valid { color: #16a34a; } h1 { font-size: 1.5rem; } .detail { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 12px 0; }`}</style>
      </head>
      <body>
        <h1>Certificate Verification</h1>
        <p className="valid">✅ This certificate is valid.</p>
        <div className="detail">
          <strong>Issued to:</strong> {user.name}<br />
          <strong>Certificate ID:</strong> {certId}<br />
          <strong>Generated:</strong> {genDate}<br />
          <strong>Total XP:</strong> {overallXP}<br />
          <strong>Tracks:</strong> {tracks.map(t => `${t.paName} (${t.xp} XP)`).join(", ") || "None"}
        </div>
        <p style={{ color: "#94a3b8", fontSize: "0.8rem" }}>SAMS — Seam Assurance Management System</p>
      </body>
    </html>
  );
}
