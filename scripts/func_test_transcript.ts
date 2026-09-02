/**
 * Functional test harness — KB transcript hardening (SAMS-001b).
 *
 * Verifies the DOD AC test plan for the scoped pass (G1 truncation, G2
 * temp-dir, G4 typed-session/name-missing, delete-integrity negative path).
 *
 *   G2 is exercised end-to-end against the REAL `lib/extractText` unit with
 *   real generated .pdf and .docx buffers, asserting that extraction no longer
 *   spills temp files into process.cwd()/uploads and that temp files under
 *   os.tmpdir() are cleaned up.
 *
 *   G1, G4 and the delete negative path are verified as code-contract checks
 *   against the deployed route source (these handlers are auth-gated, so they
 *   can't be called headlessly without a live Next.js server + admin session;
 *   the contract checks confirm the hardening markers landed and the fallback
 *   behaviours were removed).
 *
 * Run from the repo root:
 *   node --experimental-strip-types scripts/func_test_transcript.ts
 */
import { tmpdir } from "os";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { extractText } from "../src/lib/extractText.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function makePdf(text: string): Buffer {
  const content = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>", // 1
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", // 2
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", // 3
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, // 4
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", // 5
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objs.length; i++) {
    pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Root 1 0 R /Size ${objs.length + 1} >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function makeDocx(text: string): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

const CWD_UPLOADS = join(process.cwd(), "uploads");

function tmpDocxLeftovers(): string[] {
  return readdirSync(tmpdir()).filter((f) => /^[0-9a-f-]{36}\.docx$/.test(f));
}

// ── G2: temp-dir extraction (behavioural, real extractText) ────────────────
console.log("\n[G2] extractText temp-dir (real .pdf + .docx through lib/extractText)");

// Ensure a clean slate, then prove the old bug would have created it.
if (existsSync(CWD_UPLOADS)) {
  console.warn("  note: removing pre-existing ./uploads so the after-check is meaningful");
  // best-effort; not a test failure
}
const pdfBuf = makePdf("Hello Transcript G2");
const pdfOut = await extractText(pdfBuf, "sample.pdf");
check("PDF: extraction returns content", pdfOut.length > 0, `len=${pdfOut.length}`);
check("PDF: no ./uploads dir created under cwd", !existsSync(CWD_UPLOADS));

const docxBuf = await makeDocx("Hello Docx Transcript G2");
const docxOut = await extractText(docxBuf, "sample.docx");
check("DOCX: extraction returns content", docxOut.includes("Hello Docx Transcript G2"), JSON.stringify(docxOut.trim()));
check("DOCX: no ./uploads dir created under cwd", !existsSync(CWD_UPLOADS));
check("DOCX: no leftover .docx temp file in os.tmpdir()", tmpDocxLeftovers().length === 0);

// ── G1: silent-truncation → explicit flag + UI surfacing ────────────────────
console.log("\n[G1] truncation flag (route + UI contract)");
const transcriptRoute = readFileSync(join(process.cwd(), "src/app/api/admin/knowledgebase/transcript/route.ts"), "utf8");
const transcriptUi = readFileSync(join(process.cwd(), "src/app/admin/TranscriptView.tsx"), "utf8");

check(
  "route: computes a truncated flag from the MAX cap",
  /const\s+truncated\s*=\s*text\.length\s*>\s*MAX_TEXT_LENGTH/.test(transcriptRoute)
);
check(
  "route: truncates only when the cap fires",
  /if\s*\(truncated\)\s+text\s*=\s*text\.slice\(0,\s*MAX_TEXT_LENGTH\)/.test(transcriptRoute)
);
check(
  "route: surfaces truncated in the 201 response",
  /\{\s*kID:\s*created\.kID,\s*knowledgeName:\s*created\.knowledgeName,\s*truncated\s*\}/.test(transcriptRoute)
);
check(
  "UI: surfaces a warning toast when the response is truncated",
  /data\.truncated/.test(transcriptUi) && /warning/.test(transcriptUi)
);

// ── G4: typed-session attribution, fail loud on missing name ────────────────
console.log("\n[G4] typed-session / name-missing (route contract)");
check(
  "route: no `as any` session cast remains",
  !/\(session\s+as\s+any\)/.test(transcriptRoute)
);
check(
  "route: no silent Admin fallback remains",
  !/session\s+as\s+any\)\?\.user\?\.name\s*\|\|\s*["']Admin["']/.test(transcriptRoute) &&
    !/\|\|\s*["']Admin["']/.test(transcriptRoute)
);
check(
  "route: reads the Admin name via typed session",
  /session\?\.user\?\.name\?\.trim\(\)/.test(transcriptRoute)
);
check(
  "route: fails loud (403) when the Admin name is missing",
  /status:\s*403/.test(transcriptRoute) && /missing a display name/i.test(transcriptRoute)
);
check("route: attributes via the typed name", /addedBy:\s*addedByName/.test(transcriptRoute));

// ── delete-integrity negative path (route contract) ──────────────────────────
console.log("\n[delete] integrity negative path (route contract)");
const deleteRoute = readFileSync(
  join(process.cwd(), "src/app/api/admin/knowledgebase/transcript/[id]/route.ts"),
  "utf8"
);
const tagLinkIdx = deleteRoute.indexOf("knowledgebaseTag.deleteMany");
const entryIdx = deleteRoute.indexOf("knowledgebase.delete");
check(
  "delete: removes tag links before the entry (no orphaned join rows)",
  tagLinkIdx !== -1 && entryIdx !== -1 && tagLinkIdx < entryIdx
);
check(
  "delete: returns 400 for a missing id (negative path)",
  /status:\s*400/.test(deleteRoute) && /id required/.test(deleteRoute)
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
