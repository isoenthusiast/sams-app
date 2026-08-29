import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * Shared text extraction for uploaded documents/transcripts.
 * Supports: .pdf, .docx, .csv, .txt, .md, .json, .vtt, .srt.
 * Returns the extracted plain-text (markdown for CSV).
 */
export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  const ext = lower.substring(lower.lastIndexOf("."));

  if (ext === ".pdf" || ext === ".docx") {
    const tempDir = join(process.cwd(), "uploads");
    await mkdir(tempDir, { recursive: true }).catch(() => {});
    const tempPath = join(tempDir, `${randomUUID()}${ext}`);
    await writeFile(tempPath, buffer);
    try {
      if (ext === ".pdf") {
        const { PDFParse } = await import("pdf-parse");
        const pdfParser = new PDFParse({ data: new Uint8Array(buffer) });
        const text = (await pdfParser.getText()).text;
        await pdfParser.destroy();
        return text;
      }
      // .docx
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ path: tempPath });
      return result.value;
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  const text = buffer.toString("utf-8");

  if (ext === ".vtt" || ext === ".srt") {
    return parseTimedTranscript(text, ext);
  }
  if (ext === ".csv") {
    return csvToMarkdown(text);
  }
  if (ext === ".json") {
    return jsonToText(text);
  }
  // .txt, .md, and anything else → raw text
  return text;
}

/**
 * Strip timestamps/indices from a WebVTT (.vtt) or SubRip (.srt) file,
 * leaving the spoken lines (and any speaker labels) as plain text.
 */
function parseTimedTranscript(text: string, ext: string): string {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (ext === ".vtt" && line === "WEBVTT") continue;
    // SubRip cue index ("1", "2", …)
    if (ext === ".srt" && /^\d+$/.test(line)) continue;
    // Timestamp arrows: "00:00:01.000 --> 00:00:04.000" (also comma variant)
    if (/^\d{2}:\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{1,3}/.test(line)) continue;
    // VTT metadata blocks
    if (/^(NOTE|STYLE|REGION)\b/i.test(line)) continue;
    // VTT speaker tags like "<v Speaker Name>" → strip angle brackets
    out.push(line.replace(/^<v\s+([^>]+)>\s*/i, "$1: "));
  }
  return out.join("\n");
}

function csvToMarkdown(text: string): string {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return "";
  const headers = lines[0].split(",").map((h) => h.trim());
  let md = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
  for (let i = 1; i < Math.min(lines.length, 500); i++) {
    md += `| ${lines[i].split(",").map((c) => c.trim()).join(" | ")} |\n`;
  }
  return md;
}

function jsonToText(text: string): string {
  try {
    const data = JSON.parse(text);
    if (typeof data === "string") return data;
    return JSON.stringify(data, null, 2);
  } catch {
    return text;
  }
}
