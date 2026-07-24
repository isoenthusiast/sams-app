import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const LEVEL_COLORS: Record<string, string> = {
  Observer: "#94a3b8", Bronze: "#d97706", Silver: "#94a3b8",
  Gold: "#eab308", Platinum: "#06b6d4", Black: "#1e293b",
};

const LEVEL_XP: Record<string, number> = {
  Observer: 0, Bronze: 10, Silver: 50, Gold: 200, Platinum: 500, Black: 1000,
};

function getLevel(xp: number): string {
  if (xp >= LEVEL_XP.Black) return "Black";
  if (xp >= LEVEL_XP.Platinum) return "Platinum";
  if (xp >= LEVEL_XP.Gold) return "Gold";
  if (xp >= LEVEL_XP.Silver) return "Silver";
  if (xp >= LEVEL_XP.Bronze) return "Bronze";
  return "Observer";
}

export default async function CertificatePage({ params }: { params: Promise<{ certId: string }> }) {
  const { certId } = await params;

  // Get certificate record
  const certs = await prisma.$queryRawUnsafe<Array<{ userId: string; generatedAt: string }>>(
    `SELECT "userId", "generatedAt" FROM "Certificate" WHERE "certId" = $1`, certId
  );
  if (!certs.length) notFound();
  const { userId, generatedAt } = certs[0];

  // Get user
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
  if (!user) notFound();

  // Get company + signatory
  const companies = await prisma.$queryRawUnsafe<Array<{ companyName: string; certSignatoryName: string | null; certSignatoryPosition: string | null }>>(
    `SELECT "companyName", "certSignatoryName", "certSignatoryPosition" FROM "Company" WHERE "companyID" = 'SAMS001' LIMIT 1`
  );
  const company = companies[0] || { companyName: "SAMS", certSignatoryName: null, certSignatoryPosition: null };

  // Overall XP
  const total = await prisma.pointTransaction.aggregate({ where: { userId }, _sum: { points: true } });
  const overallXP = total._sum.points || 0;

  // Top tracks
  const tracks = await prisma.$queryRawUnsafe<Array<{ paName: string; xp: number }>>(
    `SELECT ga."attributeName" as "paName", COALESCE(SUM(pt.points), 0) as xp
     FROM "GameAttribute" ga
     LEFT JOIN "PointTransaction" pt ON pt."gameAttributeId" = ga.id AND pt."userId" = $1
     GROUP BY ga."attributeName"
     ORDER BY xp DESC LIMIT 5`,
    userId
  );

  // Badge counts by rarity
  const badges = await prisma.$queryRawUnsafe<Array<{ rarity: string; count: number }>>(
    `SELECT b.rarity, COUNT(*)::int as count
     FROM "UserAchievement" ua
     JOIN "AchievementBadge" b ON ua."badgeId" = b.id
     WHERE ua."userId" = $1
     GROUP BY b.rarity
     ORDER BY count DESC`,
    userId
  );

  // Assessment count
  const assessmentCount = await prisma.pointTransaction.count({
    where: { userId, reason: { startsWith: "Conduct Assurance" } },
  });

  // Action closure rate
  const actionStats = await prisma.$queryRawUnsafe<Array<{ closed: number; total: number }>>(
    `SELECT COUNT(*) FILTER (WHERE "closureDate" IS NOT NULL)::int as closed, COUNT(*)::int as total
     FROM "Action" WHERE "actionParty" = $1`, userId
  );
  const closeRate = actionStats[0]?.total > 0 ? Math.round((actionStats[0].closed / actionStats[0].total) * 100) : null;

  // All badges inventory (for transcript)
  const allBadges = await prisma.userAchievement.findMany({
    where: { userId },
    include: { badge: { select: { badgeName: true, level: true, badgeType: true, icon: true, rarity: true } } },
    orderBy: { earnedAt: "desc" },
  });

  // Recent activity (for transcript)
  const recent = await prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const generatedDate = new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const pageUrl = process.env.NEXTAUTH_URL || "https://sams-app-sams.up.railway.app";

  return (
    <html lang="en">
      <head>
        <title>SAMS Competency Certificate — {user.name}</title>
        <style>{`
          @page { size: A4; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Georgia', 'Times New Roman', serif; color: #1e293b; }
          .page { width: 210mm; min-height: 297mm; padding: 20mm 25mm; page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          .cert-border { border: 4px double #1e293b; padding: 15mm 20mm; min-height: 237mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
          .cert-title { font-size: 28pt; font-weight: bold; letter-spacing: 2px; margin-bottom: 8mm; color: #0f172a; }
          .cert-subtitle { font-size: 12pt; color: #64748b; margin-bottom: 12mm; }
          .cert-awarded { font-size: 11pt; color: #64748b; margin-bottom: 4mm; }
          .cert-name { font-size: 24pt; font-weight: bold; color: #0f172a; margin-bottom: 8mm; }
          .cert-body { font-size: 11pt; color: #475569; line-height: 2; margin-bottom: 10mm; max-width: 140mm; }
          .cert-body strong { color: #1e293b; }
          .cert-signature { margin-top: auto; padding-top: 10mm; }
          .cert-signature .line { width: 60mm; border-top: 1px solid #1e293b; margin: 0 auto 3mm; }
          .cert-signature .name { font-size: 12pt; font-weight: bold; }
          .cert-signature .position { font-size: 10pt; color: #64748b; }
          .cert-qr { margin-top: 6mm; font-size: 8pt; color: #94a3b8; }

          .transcript-title { font-size: 16pt; font-weight: bold; margin-bottom: 6mm; padding-bottom: 2mm; border-bottom: 2px solid #e2e8f0; }
          .transcript-section { margin-bottom: 6mm; }
          .transcript-section h3 { font-size: 12pt; margin-bottom: 3mm; color: #0f172a; }
          .transcript-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
          .transcript-table th, .transcript-table td { padding: 2mm 3mm; border-bottom: 1px solid #e2e8f0; text-align: left; }
          .transcript-table th { color: #64748b; font-weight: normal; font-size: 9pt; }
          .track-level { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 9pt; font-weight: bold; color: white; }
          .footer { margin-top: auto; font-size: 8pt; color: #94a3b8; text-align: center; padding-top: 8mm; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        `}</style>
      </head>
      <body>
        {/* Page 1: Certificate */}
        <div className="page">
          <div className="cert-border">
            <div className="cert-title">SAMS</div>
            <div className="cert-subtitle">Competency Portfolio Certificate</div>
            <div className="cert-awarded">This certifies that</div>
            <div className="cert-name">{user.name}</div>
            <div className="cert-body">
              has demonstrated competency in the following disciplines:<br />
              {tracks.map(t => (
                <span key={t.paName}>
                  <strong>{t.paName}</strong> — {getLevel(t.xp)} ({t.xp} XP)<br />
                </span>
              ))}
              <br />
              <strong>{overallXP} Total XP</strong> earned across {tracks.length} disciplines<br />
              {badges.length > 0 && (
                <span>
                  {badges.map(b => `${b.count} ${b.rarity}`).join(", ")} Badge{badges.reduce((a, b) => a + b.count, 0) !== 1 ? "s" : ""} Earned<br />
                </span>
              )}
              Participated in <strong>{assessmentCount} assessments</strong>
              {closeRate !== null && (
                <span> with a <strong>{closeRate}% action closure rate</strong></span>
              )}
            </div>
            <div className="cert-signature">
              <div className="line" />
              <div className="name">{company.certSignatoryName || "[Signatory Name]"}</div>
              <div className="position">{company.certSignatoryPosition || "[Position]"}</div>
            </div>
            <div className="cert-qr">
              Generated: {generatedDate} · Verify: {pageUrl}/verify/{certId}
            </div>
          </div>
        </div>

        {/* Page 2+: Transcript */}
        <div className="page">
          <div className="transcript-title">Competency Transcript</div>

          <div className="transcript-section">
            <h3>Mastery Tracks</h3>
            <table className="transcript-table">
              <thead><tr><th>Process Area</th><th>Level</th><th>XP</th></tr></thead>
              <tbody>
                {tracks.map(t => (
                  <tr key={t.paName}>
                    <td>{t.paName}</td>
                    <td><span className="track-level" style={{ background: LEVEL_COLORS[getLevel(t.xp)] }}>{getLevel(t.xp)}</span></td>
                    <td>{t.xp} XP</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {allBadges.length > 0 && (
            <div className="transcript-section">
              <h3>Badge Inventory ({allBadges.length})</h3>
              <table className="transcript-table">
                <thead><tr><th>Badge</th><th>Type</th><th>Level</th><th>Rarity</th></tr></thead>
                <tbody>
                  {allBadges.map(b => (
                    <tr key={b.badge.badgeName + b.badge.level}>
                      <td>{b.badge.icon} {b.badge.badgeName}</td>
                      <td>{b.badge.badgeType}</td>
                      <td>{b.badge.level || "—"}</td>
                      <td>{b.badge.rarity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="transcript-section">
            <h3>Recent Activity</h3>
            <table className="transcript-table">
              <thead><tr><th>Activity</th><th>Points</th><th>Date</th></tr></thead>
              <tbody>
                {recent.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td>{r.reason}</td>
                    <td>+{r.points}</td>
                    <td>{new Date(r.createdAt).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="footer">
            Certificate ID: {certId} · Generated: {generatedDate} · {pageUrl}/verify/{certId}
          </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `window.onload = () => window.print();` }} />
      </body>
    </html>
  );
}
