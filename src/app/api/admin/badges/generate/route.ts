import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || (session.user as any)?.role !== "Admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { badgeId, format } = await req.json(); // format: "svg" | "png"
    if (!badgeId) return NextResponse.json({ error: "badgeId required" }, { status: 400 });

    const badge = await prisma.achievementBadge.findUnique({ where: { id: badgeId } });
    if (!badge) return NextResponse.json({ error: "Badge not found" }, { status: 404 });

    const bgPrompt = badge.backgroundPrompt || "";
    const fgPrompt = badge.foregroundPrompt || "";
    const combinedPrompt = `${bgPrompt}\n\n${fgPrompt}`.trim();

    if (!combinedPrompt) return NextResponse.json({ error: "No prompts configured" }, { status: 400 });

    let imageUrl: string;

    if (format === "svg") {
      // DeepSeek for SVG
      const dsRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{
            role: "user",
            content: `Generate a clean SVG badge design. ${combinedPrompt}. Return ONLY valid SVG code wrapped in \`\`\`svg...\`\`\`. No explanations. Use a 256x256 viewBox.`
          }],
          max_tokens: 2000,
        }),
      });
      const dsData = await dsRes.json();
      const content = dsData.choices?.[0]?.message?.content || "";
      const svgMatch = content.match(/```svg\n?([\s\S]*?)```/);
      const svg = svgMatch ? svgMatch[1].trim() : content;
      // Store as data URI
      const b64 = Buffer.from(svg).toString("base64");
      imageUrl = `data:image/svg+xml;base64,${b64}`;
    } else {
      // gpt-image-2 for PNG
      const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: `Badge design: ${combinedPrompt}. Flat vector style, clean, centered, 1024x1024.`,
          n: 1,
          size: "1024x1024",
        }),
      });
      const imgData = await imgRes.json();
      imageUrl = imgData.data?.[0]?.url || "";
    }

    if (!imageUrl) return NextResponse.json({ error: "Image generation failed" }, { status: 500 });

    // Save to badge
    await prisma.achievementBadge.update({
      where: { id: badgeId },
      data: { badgeImage: imageUrl, imageFormat: format },
    });

    return NextResponse.json({ success: true, imageUrl, format });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
